/**
 * Tool call dispatcher.
 *
 * Receives function call events from the AI provider and executes the
 * corresponding business logic.  Returns a string result that is sent
 * back to the AI as the function output.
 */

import { getSession, updateSession } from '../sessions/store.js';
import {
  upsertCustomer,
  updateCustomerName,
  saveDraft,
  confirmDraft,
  cancelDraft,
} from '../services/engagements.js';
import {
  sendLocationSMS,
  sendOrderConfirmation,
  sendBookingConfirmation,
} from '../services/sms.js';
import { query } from '../db/pool.js';
import twilio from 'twilio';
import { search as knSearch, syncEngagement } from '../services/knowledgeNexus.js';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Dispatch a tool call.
 *
 * @param {string} callSid          - Active call SID
 * @param {string} toolName         - Function name from AI
 * @param {object} args             - Parsed arguments
 * @param {function} endCallFn      - Callback to cleanly close the WebSocket
 * @returns {Promise<string>}       - Result string sent back to AI
 */
export async function dispatch(callSid, toolName, args, { endCallFn } = {}) {
  const session = getSession(callSid);
  if (!session) return 'Error: session not found';

  try {
    switch (toolName) {

      // ── End Call ────────────────────────────────────────────────────────────
      case 'end_call': {
        if (endCallFn) setTimeout(endCallFn, 3000); // small delay so AI finishes speaking
        return 'Call will end shortly.';
      }

      // ── Transfer Call ───────────────────────────────────────────────────────
      case 'transfer_call': {
        const managerPhone = session.business?.phone || process.env.MANAGER_NUMBER;
        if (managerPhone && session.callSid) {
          const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${session.destPhone}">${managerPhone}</Dial></Response>`;
          await twilioClient.calls(session.callSid).update({ twiml });
          return 'Call transferred to staff.';
        }
        return 'Transfer unavailable — no staff number configured.';
      }

      // ── Location SMS ────────────────────────────────────────────────────────
      case 'location_sms': {
        await sendLocationSMS(session.callerPhone, args.content);
        return 'Location details sent via SMS.';
      }

      // ── Get Caller Name ─────────────────────────────────────────────────────
      case 'get_caller_name': {
        const customer = await upsertCustomer(
          session.businessId,
          session.callerPhone,
          args.caller_name
        );
        updateSession(callSid, { customer });
        return `Customer record saved. Name: ${customer.name || args.caller_name}.`;
      }

      // ── Update Caller Name ──────────────────────────────────────────────────
      case 'update_caller_name': {
        const customerId = session.customer?.id;
        if (!customerId) return 'No customer record found to update.';
        const updated = await updateCustomerName(customerId, args.new_name);
        updateSession(callSid, { customer: updated });
        return `Name updated to ${args.new_name}.`;
      }

      // ── Save Draft Engagement ───────────────────────────────────────────────
      // Called BEFORE the AI reads back the confirmation summary.
      case 'save_draft_engagement': {
        const workflow = session.workflows?.find((w) => w.is_active) || session.workflows?.[0];
        const draft = await saveDraft({
          businessId:      session.businessId,
          workflowId:      workflow?.id,
          customerId:      session.customer?.id || null,
          callSid,
          payload:         args.payload,
          existingDraftId: session.draft?.id || null,
        });
        updateSession(callSid, { draft });
        return `Draft saved (id: ${draft.id}).`;
      }

      // ── Confirm Engagement ──────────────────────────────────────────────────
      case 'confirm_engagement': {
        const draftId = session.draft?.id;
        if (!draftId) return 'Error: no draft found to confirm. Save draft first.';

        const engagement = await confirmDraft(draftId, session.callId || null);
        updateSession(callSid, { engagement, draft: null });

        // Send confirmation SMS based on workflow type
        const workflow = session.workflows?.find((w) => w.is_active) || session.workflows?.[0];
        const payload  = typeof engagement.payload === 'string'
          ? JSON.parse(engagement.payload)
          : engagement.payload;

        const businessPhone = session.business?.phone;

        if (workflow?.type === 'ordering') {
          await sendOrderConfirmation({
            callerPhone:   session.callerPhone,
            businessPhone,
            engagement:    payload,
          }).catch((err) => console.error('[SMS] Order confirmation failed:', err.message));
        } else if (['appointment', 'reservation'].includes(workflow?.type)) {
          await sendBookingConfirmation({
            callerPhone:   session.callerPhone,
            businessPhone,
            engagement:    payload,
          }).catch((err) => console.error('[SMS] Booking confirmation failed:', err.message));
        }

        // ── Create reservation record + lock slot for reservation/appointment ─
        if (['reservation', 'appointment'].includes(workflow?.type)) {
          const p      = payload || {};
          const slotId = p.slot_id || null;

          // Lock and increment the slot atomically if slot_id was provided
          if (slotId) {
            const slotResult = await query(
              `UPDATE availability_slots
               SET booked = booked + 1
               WHERE id = $1 AND booked < capacity
               RETURNING id`,
              [slotId]
            ).catch((err) => {
              console.error('[Slot] increment failed:', err.message);
              return { rows: [] };
            });

            if (!slotResult.rows.length) {
              // Slot became full between check and confirm — surface error to AI
              return 'Sorry, that time slot just became unavailable. Please use check_availability to find another slot.';
            }
          }

          query(
            `INSERT INTO reservations
               (business_id, customer_id, slot_id, engagement_id, caller_phone, guest_name,
                party_size, reserved_for, notes, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'confirmed')
             ON CONFLICT DO NOTHING`,
            [
              session.businessId,
              session.customer?.id || null,
              slotId,
              engagement.id,
              session.callerPhone,
              p.name || p.guest_name || null,
              p.party_size || p.guests || 1,
              p.date_time || p.reserved_for || null,
              p.notes || p.special_requests || null,
            ]
          ).catch((err) => console.error('[Reservations] insert failed:', err.message));
        }

        // ── Knowledge Nexus sync (fire-and-forget) ────────────────────────
        syncEngagement({
          businessId:   session.businessId,
          callerPhone:  session.callerPhone,
          engagement,
          business:     session.business,
          workflowType: workflow?.type || 'ordering',
        }).catch((err) => console.error('[KN] sync failed:', err.message));

        return `Engagement confirmed (id: ${engagement.id}).`;
      }

      // ── Cancel Engagement ───────────────────────────────────────────────────
      case 'cancel_engagement': {
        if (session.draft?.id) {
          await cancelDraft(session.draft.id);
          updateSession(callSid, { draft: null });
          return 'Draft cancelled.';
        }
        // If confirmed engagement needs cancellation, update its status
        if (session.engagement?.id) {
          await query(
            `UPDATE engagements SET status = 'cancelled' WHERE id = $1`,
            [session.engagement.id]
          );
          return 'Engagement cancelled.';
        }
        return 'Nothing to cancel.';
      }

      // ── Update Draft Order ──────────────────────────────────────────────────
      case 'update_draft_order': {
        if (!session.draft?.id) return 'No draft to update. Place an order first.';
        const workflow = session.workflows?.find((w) => w.is_active) || session.workflows?.[0];
        const draft = await saveDraft({
          businessId:      session.businessId,
          workflowId:      workflow?.id,
          customerId:      session.customer?.id || null,
          callSid,
          payload:         args.payload,
          existingDraftId: session.draft.id,
        });
        updateSession(callSid, { draft });
        return 'Draft order updated.';
      }

      // ── Check Availability ──────────────────────────────────────────────────
      case 'check_availability': {
        const date = resolveDate(args.date);
        const tz   = session.timezone || 'America/Chicago';
        const result = await query(
          `SELECT id, slot_start, slot_end, capacity - booked AS open_spots
           FROM availability_slots
           WHERE business_id = $1
             AND DATE(slot_start AT TIME ZONE $2) = $3
             AND booked < capacity
           ORDER BY slot_start
           LIMIT 20`,
          [session.businessId, tz, date]
        );

        if (!result.rows.length) return `No available slots on ${date}.`;

        const slots = result.rows.map((r) => {
          const t = new Date(r.slot_start).toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', timeZone: tz,
          });
          return {
            slot_id:    r.id,
            time:       t,
            open_spots: r.open_spots,
          };
        });

        return JSON.stringify({
          date,
          message:    `Available slots on ${date}. When the caller picks a time, record the slot_id in the draft payload.`,
          slots,
        });
      }

      // ── Search Knowledge Base ───────────────────────────────────────────────
      case 'search_knowledge': {
        const { query: knQuery } = args;
        if (!knQuery?.trim()) return 'Please provide a search query.';
        const result = await knSearch(session.businessId, knQuery);
        return result;
      }

      default:
        console.warn(`[Handler] Unknown tool: ${toolName}`);
        return `Unknown function: ${toolName}`;
    }
  } catch (err) {
    console.error(`[Handler] Error in ${toolName}:`, err.message);
    return `Error executing ${toolName}: ${err.message}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveDate(input) {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  if (!input || input === 'today') return fmt(today);
  if (input === 'tomorrow') {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return fmt(t);
  }
  // Accept YYYY-MM-DD or parse freeform
  const parsed = new Date(input);
  return isNaN(parsed) ? fmt(today) : fmt(parsed);
}
