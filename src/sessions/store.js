/**
 * In-memory call session store.
 *
 * Each active call gets an entry keyed by CallSid:
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
 *   services:      array,     // menu items / bookable services
 *   customer:      object|null,
 *   draft:         object|null, // active draft_engagement if caller has one
 *   pipeline:      'realtime'|'stt_llm_tts',
 *   startedAt:     Date,
 * }
 *
 * Sessions auto-expire after 15 minutes to guard against leaked calls.
 */

const store = new Map();
const TIMEOUT_MS = 15 * 60 * 1000;

export function setSession(callSid, data) {
  // Clear any existing timer
  const existing = store.get(callSid);
  if (existing?._timer) clearTimeout(existing._timer);

  const timer = setTimeout(() => {
    store.delete(callSid);
    console.log(`[Session] Expired session for ${callSid}`);
  }, TIMEOUT_MS);

  store.set(callSid, { ...data, _timer: timer });
}

export function getSession(callSid) {
  const entry = store.get(callSid);
  if (!entry) return null;
  const { _timer: _t, ...data } = entry;
  return data;
}

export function updateSession(callSid, updates) {
  const existing = store.get(callSid);
  if (!existing) return;
  store.set(callSid, { ...existing, ...updates });
}

export function deleteSession(callSid) {
  const existing = store.get(callSid);
  if (existing?._timer) clearTimeout(existing._timer);
  store.delete(callSid);
}

export function sessionCount() {
  return store.size;
}
