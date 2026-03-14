import { query } from '../db/pool.js';

/**
 * Create a call record when a call starts (status: in_progress).
 * Returns the new call's UUID.
 *
 * @param {object} opts
 * @param {string} opts.callSid
 * @param {string} opts.businessId
 * @param {string|null} opts.customerId
 * @param {string} opts.callerPhone
 * @param {string} opts.pipeline - 'realtime' | 'stt_llm_tts'
 * @param {object|null} opts.engagementId - FK if associated on start
 * @returns {Promise<string>} - call UUID
 */
export async function createCallRecord({ callSid, businessId, customerId, callerPhone, pipeline, engagementId = null }) {
  const result = await query(
    `INSERT INTO calls
       (call_sid, business_id, customer_id, caller_phone, pipeline, engagement_id, status, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'in_progress', NOW())
     RETURNING id`,
    [callSid, businessId, customerId, callerPhone, pipeline, engagementId]
  );
  return result.rows[0].id;
}

/**
 * Mark a call as completed / failed.
 *
 * @param {string} callId         - Internal UUID from calls table
 * @param {object} opts
 * @param {string} opts.status    - 'completed' | 'failed' | 'no-answer'
 * @param {number} opts.durationSeconds
 * @param {string|null} opts.engagementId
 */
export async function closeCallRecord(callId, { status, durationSeconds, engagementId = null }) {
  await query(
    `UPDATE calls
     SET status           = $1,
         duration_seconds = $2,
         engagement_id    = COALESCE($3, engagement_id),
         ended_at         = NOW()
     WHERE id = $4`,
    [status, durationSeconds, engagementId, callId]
  );
}
