/**
 * Twilio incoming call route handler.
 *
 * When Twilio calls POST /incoming-call:
 *   1. Look up the business by destination (Twilio) phone number
 *   2. Load business data: locations, workflows, ai_config, services
 *   3. Look up or create a customer by caller phone
 *   4. Check for an active draft engagement (resume-on-callback)
 *   5. Determine AI pipeline via A/B routing
 *   6. Create a call record in the DB
 *   7. Cache all data in the session store (keyed by CallSid)
 *   8. Return TwiML connecting the call to /media-stream
 *
 * If anything fails, falls back to a Twilio Studio fallback URL or a
 * graceful "technical difficulties" message.
 */

import { query }           from '../db/pool.js';
import { setSession }      from '../sessions/store.js';
import { createCallRecord } from './calls.js';
import { getCustomer, getDraftForCaller } from './engagements.js';
import { getActiveMenuData } from './menu.js';

/**
 * Register Twilio routes on the Fastify instance.
 */
export function setupTwilioRoutes(fastify) {

  fastify.all('/incoming-call', async (request, reply) => {
    const callerPhone = request.body.From   || request.query.From;
    const destPhone   = request.body.To     || request.query.To;
    const callSid     = request.body.CallSid || request.query.CallSid;

    console.log(`[Twilio] Incoming call from ${callerPhone} → ${destPhone} (${callSid})`);

    try {
      // ── 1. Look up business by Twilio number ──────────────────────────────
      // Businesses have their Twilio number stored in businesses.phone
      const bizResult = await query(
        `SELECT * FROM businesses WHERE phone = $1 LIMIT 1`,
        [destPhone]
      );

      if (!bizResult.rows[0]) {
        console.error(`[Twilio] No business found for number: ${destPhone}`);
        return reply.type('text/xml').send(fallbackTwiML());
      }

      const business   = bizResult.rows[0];
      const businessId = business.id;

      // ── 2. Load business data in parallel ────────────────────────────────
      const [locResult, workflowResult, aiResult] = await Promise.all([
        query(
          `SELECT * FROM business_locations WHERE business_id = $1 AND is_active = true ORDER BY is_primary DESC, name`,
          [businessId]
        ),
        query(
          `SELECT * FROM workflows WHERE business_id = $1 AND is_active = true ORDER BY created_at`,
          [businessId]
        ),
        query(
          `SELECT * FROM ai_config WHERE business_id = $1`,
          [businessId]
        ),
      ]);

      const locations = locResult.rows;
      const workflows = workflowResult.rows;
      const aiConfig  = aiResult.rows[0] || {};

      // ── 2b. Time-aware menu resolution ───────────────────────────────────
      // Use the primary location's timezone, or the ai_config timezone, or Central.
      const timezone = locations[0]?.timezone || aiConfig.timezone || 'America/Chicago';
      const { menu: activeMenu, services, specials } =
        await getActiveMenuData(businessId, timezone);

      // ── 3. Look up customer + draft ───────────────────────────────────────
      // Only load the prior draft if resume_on_callback_enabled is true (default: true)
      const resumeEnabled = aiConfig.resume_on_callback_enabled !== false;

      const [customer, draft] = await Promise.all([
        getCustomer(businessId, callerPhone).catch(() => null),
        resumeEnabled
          ? getDraftForCaller(businessId, callerPhone).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (draft) {
        console.log(`[Twilio] Draft found for caller — resume-on-callback active (draft ${draft.id})`);
      }

      // ── 4. A/B pipeline routing ───────────────────────────────────────────
      // ab_realtime_pct: 0–100 (% of calls sent to realtime pipeline)
      // Use deterministic hash of CallSid so the same caller always hits
      // the same pipeline within a session.
      const abPct    = aiConfig.ab_realtime_pct ?? 100;
      const hash     = simpleHash(callSid || callerPhone);
      const pct      = hash % 100;
      const forcePipeline = aiConfig.pipeline_mode; // 'realtime' | 'stt_llm_tts' | null
      const pipeline =
        forcePipeline === 'stt_llm_tts' ? 'stt_llm_tts'
        : forcePipeline === 'realtime'   ? 'realtime'
        : pct < abPct                    ? 'realtime'
        :                                  'stt_llm_tts';

      console.log(`[Twilio] Pipeline: ${pipeline} (A/B: ${pct}/${abPct})`);

      // ── 5. Create call record ─────────────────────────────────────────────
      const callId = await createCallRecord({
        callSid,
        businessId,
        customerId:  customer?.id || null,
        callerPhone,
        pipeline,
        engagementId: null,
      }).catch((err) => {
        console.error('[Twilio] Failed to create call record:', err.message);
        return null;
      });

      // ── 6. Store session ──────────────────────────────────────────────────
      setSession(callSid, {
        callSid,
        callId,
        callerPhone,
        destPhone,
        businessId,
        business,
        locations,
        workflows,
        aiConfig,
        services,
        specials,
        activeMenu,
        timezone,
        customer,
        draft,
        pipeline,
        startedAt: new Date(),
      });

      // ── 7. Return TwiML ───────────────────────────────────────────────────
      // Currently both pipelines land on /media-stream.
      // The provider layer (openai.js) reads session.pipeline and routes
      // to the appropriate handler.  When the STT→LLM→TTS pipeline is
      // implemented it will register its own handler at the same route.
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Connect>
    <Stream url="wss://${request.headers.host}/media-stream">
      <Parameter name="callSid"  value="${callSid}"/>
      <Parameter name="caller"   value="${callerPhone}"/>
      <Parameter name="dest"     value="${destPhone}"/>
    </Stream>
  </Connect>
</Response>`;

      return reply.type('text/xml').send(twiml);

    } catch (err) {
      console.error('[Twilio] Error handling incoming call:', err.message, err.stack);
      return reply.type('text/xml').send(fallbackTwiML());
    }
  });

  // ── Status callback (optional) ────────────────────────────────────────────
  // Twilio can post call status updates here; the /api/webhooks/twilio/status
  // route in biteline-api is the primary handler.  This duplicate handles
  // cases where the voice server is the configured Status Callback URL.
  fastify.post('/call-status', async (request, reply) => {
    const { CallSid, CallStatus, CallDuration } = request.body;
    console.log(`[Twilio] Status callback: ${CallSid} → ${CallStatus} (${CallDuration}s)`);
    return reply.send({ ok: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple non-cryptographic hash of a string → integer.
 * Used for deterministic A/B routing by CallSid.
 */
function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return Math.abs(h);
}

/**
 * TwiML for graceful error fallback.
 * If a Twilio Studio fallback URL is configured, Twilio will use it.
 * Otherwise callers hear this message.
 */
function fallbackTwiML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">
    We're sorry, we're having technical difficulties. Please try again in a moment, or visit our website for more information.
  </Say>
  <Hangup/>
</Response>`;
}
