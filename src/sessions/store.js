/**
 * Call session store — Redis write-through with in-memory cache.
 *
 * Primary:  in-memory Map  (sync reads, zero latency for hot sessions)
 * Backup:   Redis           (cross-server + restart persistence)
 *
 * If REDIS_URL is not configured, falls back to in-memory only so local
 * development works without running Redis.
 *
 * loadSession(callSid) — async, must be called once per WebSocket connection
 *   before getSession().  router.js calls this after reading the 'start' event.
 *   Populates the local cache from Redis when the call was routed to a different
 *   server instance than the one that received the Twilio webhook.
 *
 * Session shape:
 * {
 *   callSid:       string,
 *   callId:        string (UUID from DB calls table),
 *   callerPhone:   string,
 *   destPhone:     string,
 *   businessId:    string,
 *   business:      object,
 *   locations:     array,
 *   workflows:     array,
 *   aiConfig:      object,
 *   services:      array,
 *   timezone:      string,
 *   customer:      object|null,
 *   draft:         object|null,
 *   engagement:    object|null,
 *   pipeline:      'realtime'|'stt_llm_tts',
 *   startedAt:     string (ISO),
 * }
 */

import Redis from 'ioredis';

const store       = new Map();
const TIMEOUT_MS  = 15 * 60 * 1000;   // 15 min local TTL
const REDIS_TTL_S = 16 * 60;          // 16 min Redis TTL (slightly longer)

const KEY = (sid) => `session:${sid}`;

// ── Redis client (optional) ───────────────────────────────────────────────────

let redis = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout:       2000,
    enableOfflineQueue:   false,
  });
  redis.on('error', (err) => console.error('[Session] Redis error:', err.message));
  console.log('[Session] Redis write-through enabled');
} else {
  console.log('[Session] REDIS_URL not set — in-memory session store only');
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function redisSave(callSid, data) {
  if (!redis) return;
  redis.set(KEY(callSid), JSON.stringify(data), 'EX', REDIS_TTL_S)
    .catch((err) => console.error('[Session] Redis save error:', err.message));
}

function redisDelete(callSid) {
  if (!redis) return;
  redis.del(KEY(callSid))
    .catch((err) => console.error('[Session] Redis delete error:', err.message));
}

function startTimer(callSid) {
  return setTimeout(() => {
    store.delete(callSid);
    redisDelete(callSid);
    console.log(`[Session] Expired session for ${callSid}`);
  }, TIMEOUT_MS);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create or replace a session.  Called from the Twilio webhook (twilio.js)
 * when a new inbound call is received.
 */
export function setSession(callSid, data) {
  const existing = store.get(callSid);
  if (existing?._timer) clearTimeout(existing._timer);

  store.set(callSid, { ...data, _timer: startTimer(callSid) });
  redisSave(callSid, data);
}

/**
 * Synchronous read from the local cache.  Always returns null if the session
 * is not already in memory — call loadSession() first in router.js.
 */
export function getSession(callSid) {
  const entry = store.get(callSid);
  if (!entry) return null;
  const { _timer: _t, ...data } = entry;
  return data;
}

/**
 * Load a session from Redis into the local cache if not already present.
 * Call once per WebSocket connection (router.js) before getSession().
 */
export async function loadSession(callSid) {
  if (store.has(callSid)) return;   // already cached locally
  if (!redis) return;

  try {
    const raw = await redis.get(KEY(callSid));
    if (!raw) return;

    const data = JSON.parse(raw);
    store.set(callSid, { ...data, _timer: startTimer(callSid) });
    console.log(`[Session] Loaded from Redis for ${callSid}`);
  } catch (err) {
    console.error('[Session] Redis load error:', err.message);
  }
}

/**
 * Merge updates into an existing session (in-memory + Redis write-through).
 */
export function updateSession(callSid, updates) {
  const existing = store.get(callSid);
  if (!existing) return;

  const updated = { ...existing, ...updates };
  store.set(callSid, updated);

  const { _timer: _t, ...data } = updated;
  redisSave(callSid, data);
}

/**
 * Remove a session (end of call).
 */
export function deleteSession(callSid) {
  const existing = store.get(callSid);
  if (existing?._timer) clearTimeout(existing._timer);
  store.delete(callSid);
  redisDelete(callSid);
}

/**
 * Number of sessions currently in the local cache.
 */
export function sessionCount() {
  return store.size;
}
