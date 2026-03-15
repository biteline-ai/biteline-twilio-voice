import { query, withTransaction } from '../db/pool.js';

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a customer by business + phone.
 * Returns the customer row or null.
 */
export async function getCustomer(businessId, phone) {
  const result = await query(
    `SELECT * FROM customers WHERE business_id = $1 AND phone = $2`,
    [businessId, phone]
  );
  return result.rows[0] || null;
}

/**
 * Upsert a customer record. Returns the customer.
 */
export async function upsertCustomer(businessId, phone, name = null) {
  const result = await query(
    `INSERT INTO customers (business_id, phone, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (business_id, phone)
     DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
                   visit_count = customers.visit_count + 1,
                   last_seen_at = NOW()
     RETURNING *`,
    [businessId, phone, name]
  );
  return result.rows[0];
}

/**
 * Update a customer's name by ID.
 */
export async function updateCustomerName(customerId, name) {
  const result = await query(
    `UPDATE customers SET name = $1 WHERE id = $2 RETURNING *`,
    [name, customerId]
  );
  return result.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT ENGAGEMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the most recent active draft for this business + caller phone.
 * Used at call start to resume an incomplete session.
 */
export async function getDraftForCaller(businessId, callerPhone) {
  // Join via customers table since draft_engagements references customer_id
  const result = await query(
    `SELECT d.*
     FROM draft_engagements d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.business_id = $1
       AND c.phone       = $2
       AND d.expires_at  > NOW()
     ORDER BY d.updated_at DESC
     LIMIT 1`,
    [businessId, callerPhone]
  );
  return result.rows[0] || null;
}

/**
 * Save (upsert) a draft engagement.
 * Called mid-call BEFORE the AI reads back the confirmation summary.
 *
 * @param {object} opts
 * @param {string} opts.businessId
 * @param {string} opts.workflowId
 * @param {string|null} opts.customerId
 * @param {string} opts.callSid
 * @param {object} opts.payload     - { items, total, location, pickup_time, ... }
 * @param {string|null} opts.existingDraftId - update instead of insert if present
 * @returns {Promise<object>}       - the draft row
 */
export async function saveDraft({ businessId, workflowId, customerId, callSid, payload, existingDraftId = null }) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  if (existingDraftId) {
    const result = await query(
      `UPDATE draft_engagements
       SET payload    = $1,
           updated_at = NOW(),
           expires_at = $2
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(payload), expiresAt.toISOString(), existingDraftId]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO draft_engagements
       (business_id, workflow_id, customer_id, call_sid, payload, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [businessId, workflowId, customerId, callSid, JSON.stringify(payload), expiresAt.toISOString()]
  );
  return result.rows[0];
}

/**
 * Promote a draft to a confirmed engagement and delete the draft.
 * Returns the new engagement row.
 */
export async function confirmDraft(draftId, callId = null) {
  // 1) Fetch draft
  const draftResult = await query(
    `SELECT * FROM draft_engagements WHERE id = $1`,
    [draftId]
  );
  const draft = draftResult.rows[0];
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  // 2) Insert confirmed engagement
  const engResult = await query(
    `INSERT INTO engagements
       (business_id, workflow_id, customer_id, call_id, status, payload)
     VALUES ($1, $2, $3, $4, 'confirmed', $5)
     RETURNING *`,
    [draft.business_id, draft.workflow_id, draft.customer_id, callId, draft.payload]
  );
  const engagement = engResult.rows[0];

  // 3) Delete the draft
  await query(`DELETE FROM draft_engagements WHERE id = $1`, [draftId]);

  return engagement;
}

/**
 * Discard a draft (caller cancelled).
 */
export async function cancelDraft(draftId) {
  await query(`DELETE FROM draft_engagements WHERE id = $1`, [draftId]);
}

/**
 * Atomically confirm a draft engagement, lock+increment the availability slot,
 * and create the reservation record — all in a single transaction.
 *
 * This prevents the race condition where confirm succeeds but the slot is full,
 * and ensures the reservation row always exists alongside the engagement.
 *
 * @param {object} opts
 * @param {string}      opts.draftId
 * @param {string|null} opts.callId
 * @param {string|null} opts.slotId        - From payload.slot_id
 * @param {string}      opts.businessId
 * @param {string|null} opts.customerId
 * @param {string|null} opts.callerPhone
 * @param {object}      opts.payload       - Parsed engagement payload
 * @param {string}      opts.workflowType
 * @returns {Promise<object>} engagement row
 * @throws Error with .statusCode 409 if slot is full
 */
export async function confirmDraftWithSlot({
  draftId,
  callId,
  slotId,
  businessId,
  customerId,
  callerPhone,
  payload,
  workflowType,
}) {
  return withTransaction(async (client) => {
    // 1. Fetch and delete the draft
    const draftResult = await client.query(
      `SELECT * FROM draft_engagements WHERE id = $1 FOR UPDATE`,
      [draftId]
    );
    const draft = draftResult.rows[0];
    if (!draft) throw Object.assign(new Error(`Draft ${draftId} not found`), { statusCode: 404 });

    // 2. Create confirmed engagement
    const engResult = await client.query(
      `INSERT INTO engagements
         (business_id, workflow_id, customer_id, call_id, status, payload)
       VALUES ($1, $2, $3, $4, 'confirmed', $5)
       RETURNING *`,
      [draft.business_id, draft.workflow_id, draft.customer_id, callId, draft.payload]
    );
    const engagement = engResult.rows[0];

    // 3. Delete the draft
    await client.query(`DELETE FROM draft_engagements WHERE id = $1`, [draftId]);

    // 4. Lock slot and increment if reservation/appointment workflow
    if (slotId && ['reservation', 'appointment'].includes(workflowType)) {
      const slotResult = await client.query(
        `UPDATE availability_slots
         SET booked = booked + 1
         WHERE id = $1 AND business_id = $2 AND booked < capacity
         RETURNING id`,
        [slotId, businessId]
      );
      if (!slotResult.rows.length) {
        throw Object.assign(new Error('Slot is fully booked'), { statusCode: 409 });
      }
    }

    // 5. Insert reservation record
    if (['reservation', 'appointment'].includes(workflowType)) {
      await client.query(
        `INSERT INTO reservations
           (business_id, customer_id, slot_id, engagement_id, caller_phone, guest_name,
            party_size, reserved_for, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'confirmed')
         ON CONFLICT DO NOTHING`,
        [
          businessId,
          customerId || null,
          slotId || null,
          engagement.id,
          callerPhone || null,
          payload.name || payload.guest_name || null,
          payload.party_size || payload.guests || 1,
          payload.date_time || payload.reserved_for || null,
          payload.notes || payload.special_requests || null,
        ]
      );
    }

    return engagement;
  });
}
