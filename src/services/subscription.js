/**
 * Subscription check for incoming calls.
 *
 * Queries the subscriptions table directly to determine if a business
 * is allowed to receive AI calls.  Called at /incoming-call before
 * connecting the call to the AI pipeline.
 *
 * On DB failure the function allows the call rather than blocking all calls
 * due to infrastructure issues.
 */

import { query } from '../db/pool.js';

/**
 * @param {string} businessId
 * @returns {Promise<{ allowed: boolean, plan: string|null, reason: string|null }>}
 */
export async function checkBusinessSubscription(businessId) {
  try {
    const result = await query(
      `SELECT status, plan FROM subscriptions WHERE business_id = $1`,
      [businessId]
    );
    const sub = result.rows[0];

    if (!sub) {
      return { allowed: false, plan: null, reason: 'no_subscription' };
    }

    if (!['active', 'trialing'].includes(sub.status)) {
      return { allowed: false, plan: sub.plan, reason: sub.status };
    }

    return { allowed: true, plan: sub.plan, reason: null };
  } catch (err) {
    // Allow calls through on DB errors so an infra blip doesn't kill live phones
    console.error('[Subscription] Check failed — allowing call to proceed:', err.message);
    return { allowed: true, plan: null, reason: null };
  }
}
