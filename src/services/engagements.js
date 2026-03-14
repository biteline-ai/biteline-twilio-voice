import { query } from '../db/pool.js';

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
     DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name),
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
