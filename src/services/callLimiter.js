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
      const key = `biteline:calls:${businessId}`;
      // Atomic check-and-increment: only INCR if count is currently below limit.
      // Avoids a phantom increment that would be unrecoverable if the subsequent
      // decrement fails (which leaves the counter stuck high until the 1h TTL fires).
      const acquired = await redis.eval(
        `local c = tonumber(redis.call('GET', KEYS[1]) or '0')
         if c >= tonumber(ARGV[1]) then return 0 end
         local n = redis.call('INCR', KEYS[1])
         if n == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
         return 1`,
        1, key, String(limit)
      );
      return acquired === 1;
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
      // No early return — always also decrement in-memory so the counter stays
      // correct when the acquire fell back to in-memory during a Redis outage.
    } catch (err) {
      console.error('[CallLimiter] Redis release error:', err.message);
    }
  }

  const current = memoryCounts.get(businessId) || 0;
  if (current > 0) memoryCounts.set(businessId, current - 1);
}
