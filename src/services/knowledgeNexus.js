/**
 * Knowledge Nexus bridge.
 *
 * Provides two capabilities:
 *
 *  1. search(businessId, query, realmId) — RAG retrieval via KN Retrieval Service.
 *     Used by the search_knowledge tool (only present when aiConfig.kn_enabled = true).
 *
 *  2. syncEngagement(params) — after a caller confirms an engagement, create an
 *     entity node in the business's KN realm (Graph Store Service).
 *     Bi-directional caller-side sync is NOT implemented: KN has no phone-based
 *     profile lookup endpoint.
 *
 * Requires env vars:
 *   KN_RETRIEVAL_URL   — base URL of KN Retrieval Service   (e.g. http://kn-host:8003)
 *   KN_GRAPH_URL       — base URL of KN Graph Store Service  (e.g. http://kn-host:8006)
 *   KN_SERVICE_TOKEN   — X-Internal-Service-Token for service-to-service auth
 *
 * If these are not set, all functions are no-ops so the voice server works without KN.
 * Both services can share the same base URL when running behind a single API gateway.
 */

const KN_RETRIEVAL_BASE = (process.env.KN_RETRIEVAL_URL || process.env.KN_API_URL)?.replace(/\/$/, '');
const KN_GRAPH_BASE     = (process.env.KN_GRAPH_URL     || process.env.KN_API_URL)?.replace(/\/$/, '');
const KN_TOKEN          = process.env.KN_SERVICE_TOKEN || process.env.KN_API_KEY || '';

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function knPost(baseUrl, path, body) {
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(KN_TOKEN ? { 'X-Internal-Service-Token': KN_TOKEN } : {}),
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`KN POST ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.status === 204 ? null : res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search the business's KN realm via the Retrieval Service.
 *
 * KN Retrieval Service: POST /retrieve
 * Request:  { query, top_k, enable_reranking, filters: { namespace } }
 * Response: { chunks: [{ content, score }], confidence_score }
 *
 * @param {string}      businessId - Biteline business UUID
 * @param {string}      query      - Natural-language question from the AI
 * @param {string|null} realmId    - KN realm ID; falls back to businessId
 * @returns {Promise<string>}
 */
export async function search(businessId, query, realmId = null) {
  if (!KN_RETRIEVAL_BASE) return 'Knowledge search is not configured.';

  try {
    const result = await knPost(KN_RETRIEVAL_BASE, '/retrieve', {
      query,
      top_k:            5,
      enable_reranking: true,
      filters: { namespace: realmId || businessId },
    });

    const chunks = result?.chunks;
    if (!chunks?.length) return 'No relevant information found in the knowledge base.';

    return chunks
      .map((c, i) => `[${i + 1}] ${(c.content || '').trim()}`)
      .join('\n\n');
  } catch (err) {
    console.error('[KN] search error:', err.message);
    return `Knowledge search temporarily unavailable: ${err.message}`;
  }
}

// ── Engagement sync ───────────────────────────────────────────────────────────

/**
 * Sync a confirmed engagement to KN Graph Store (fire-and-forget).
 *
 * Creates an entity node in the business's KN realm.
 * Bi-directional caller sync is intentionally omitted — KN does not
 * provide a phone-to-profile lookup endpoint.
 *
 * KN Graph Store: POST /entities
 * Request:  { type, name, properties }
 * Response: { id, ... }
 *
 * @param {object}      params.businessId
 * @param {string}      params.callerPhone
 * @param {object}      params.engagement   - Confirmed engagement DB row
 * @param {object}      params.business     - Business row (name, etc.)
 * @param {string}      params.workflowType - 'ordering' | 'appointment' | 'reservation' | 'quote'
 * @param {string|null} params.realmId      - KN realm ID from aiConfig.kn_realm_id
 */
export async function syncEngagement({ businessId, callerPhone, engagement, business, workflowType, realmId = null }) {
  if (!KN_GRAPH_BASE) return;

  const payload = typeof engagement.payload === 'string'
    ? (() => { try { return JSON.parse(engagement.payload); } catch { return {}; } })()
    : (engagement.payload || {});

  try {
    await knPost(KN_GRAPH_BASE, '/entities', {
      type:       workflowType,
      name:       `${workflowType}:${engagement.id}`,
      properties: stripUndefined({
        realm:           realmId || businessId,
        business_name:   business?.name || null,
        engagement_id:   engagement.id,
        status:          engagement.status,
        confirmed_at:    engagement.confirmed_at || new Date().toISOString(),
        caller_ref:      callerPhone ? callerPhone.slice(-4) : null,
        ...sanitizePayload(payload, workflowType),
      }),
    });

    console.log(`[KN] Synced engagement ${engagement.id} to realm ${realmId || businessId}`);
  } catch (err) {
    // Never throw — KN sync is supplemental, never blocking
    console.error('[KN] syncEngagement error:', err.message);
  }
}

// ── Payload sanitisers ────────────────────────────────────────────────────────

/**
 * Extract safe, business-operational fields from the engagement payload.
 * Avoids including raw PII or fields that could leak caller identity.
 */
function sanitizePayload(payload, type) {
  if (!payload || typeof payload !== 'object') return {};
  switch (type) {
    case 'ordering':
      return {
        items:       Array.isArray(payload.items) ? payload.items : undefined,
        total:       payload.total ?? undefined,
        pickup_time: payload.pickup_time || undefined,
      };
    case 'appointment':
      return {
        service:  payload.service || undefined,
        datetime: payload.date_time || payload.datetime || payload.reserved_for || undefined,
      };
    case 'reservation':
      return {
        party_size:       payload.party_size || undefined,
        datetime:         payload.date_time || payload.datetime || payload.reserved_for || undefined,
        special_requests: payload.special_requests || payload.notes || undefined,
      };
    case 'quote':
      return {
        inquiry: payload.inquiry || payload.notes || undefined,
      };
    default:
      return {};
  }
}

/** Remove keys with undefined values before sending to KN */
function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
