/**
 * Per-business concurrent call limiter.
 *
 * Uses Redis when available (REDIS_URL is set), falls back to an in-memory
 * Map for single-instance deployments.  Redis is shared via the session
 * store's existing connection.
 *
 * Concurrent call limits by plan:
 *   trialing:    2
 *   starter:     3
 *   growth:     10
 *   pro:        25
 *   enterprise: 50
 *
 * Redis key: biteline:calls:{businessId}  (integer counter, 1 h TTL safety net)
 */

import { getRedis } from '../sessions/store.js';

if (!process.env.REDIS_URL) {
  console.warn(
    '[CallLimiter] REDIS_URL not set — concurrent call limits are per-instance only. ' +
    'Multi-instance deployments will NOT share call counts; limits will not be enforced across nodes.'
  );
}

const LIMITS = {
  trialing:    2,
  starter:     3,
  growth:     10,
  pro:        25,
  enterprise: 50,
};

const DEFAULT_LIMIT = 2;

// In-memory fallback (single-instance)
const memoryCounts = new Map();

function getLimit(plan) {
  return LIMITS[plan] ?? DEFAULT_LIMIT;
}

/**
 * Attempt to acquire a concurrent-call slot for a business.
 *
 * @param {string}      businessId
 * @param {string|null} plan
 * @returns {Promise<boolean>}  true → call may proceed; false → at limit
 */
export async function acquireCallSlot(businessId, plan) {
  const limit = getLimit(plan);
  const redis = getRedis();

  if (redis) {
    try {
      const key   = `biteline:calls:${businessId}`;
      const count = await redis.incr(key);
      // Safety-net TTL: if a release is missed the counter resets in 1 hour
      if (count === 1) await redis.expire(key, 3_600);
      if (count > limit) {
        await redis.decr(key);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[CallLimiter] Redis error — falling through to in-memory:', err.message);
    }
  }

  // In-memory fallback
  const current = memoryCounts.get(businessId) || 0;
  if (current >= limit) return false;
  memoryCounts.set(businessId, current + 1);
  return true;
}

/**
 * Release a concurrent-call slot when a call ends.
 *
 * @param {string} businessId
 */
export async function releaseCallSlot(businessId) {
  if (!businessId) return;
  const redis = getRedis();

  if (redis) {
    try {
      const key    = `biteline:calls:${businessId}`;
      const newVal = await redis.decr(key);
      if (newVal < 0) await redis.set(key, 0);
      return;
    } catch (err) {
      console.error('[CallLimiter] Redis release error:', err.message);
    }
  }

  const current = memoryCounts.get(businessId) || 0;
  if (current > 0) memoryCounts.set(businessId, current - 1);
}
