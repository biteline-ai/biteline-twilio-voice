/**
 * Knowledge Nexus bridge.
 *
 * Provides two capabilities:
 *
 *  1. search(businessId, query) — RAG search against the business's knowledge store
 *     via the KN K2K Router retrieval endpoint.  Used by the search_knowledge tool.
 *
 *  2. syncEngagement(businessId, callerPhone, engagement, business) — after a
 *     caller confirms an engagement, post it to both:
 *       a) the restaurant's KN as a reservation/order entity node
 *       b) the caller's KN (if they have a profile, found by phone lookup)
 *     creating a bi-directional link between the two.
 *
 * Both functions are no-ops (log only) when KN_API_URL is not set, so the voice
 * server continues to work without a Knowledge Nexus instance.
 */

const KN_BASE = process.env.KN_API_URL?.replace(/\/$/, '');
const KN_KEY  = process.env.KN_API_KEY || '';

if (!KN_BASE) {
  console.warn('[KN] KN_API_URL not set — Knowledge Nexus integration disabled');
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function knFetch(path, method = 'GET', body) {
  if (!KN_BASE) return null;
  const res = await fetch(`${KN_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(KN_KEY ? { 'Authorization': `Bearer ${KN_KEY}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`KN ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search the business's Knowledge Nexus knowledge store.
 *
 * @param {string} businessId - Biteline business UUID (maps to KN namespace)
 * @param {string} query      - Natural-language query from the AI
 * @returns {Promise<string>} - Plain-text answer / excerpt for the AI
 */
export async function search(businessId, query) {
  if (!KN_BASE) return 'Knowledge search is not configured.';

  try {
    const result = await knFetch('/api/v1/retrieve', 'POST', {
      namespace: businessId,
      query,
      top_k: 5,
      rerank: true,
    });

    if (!result?.results?.length) {
      return 'No relevant information found in the knowledge base.';
    }

    // Concatenate the top results into a readable snippet for the AI
    return result.results
      .map((r, i) => `[${i + 1}] ${r.content?.trim()}`)
      .join('\n\n');
  } catch (err) {
    console.error('[KN] search error:', err.message);
    return `Knowledge search temporarily unavailable: ${err.message}`;
  }
}

// ── Engagement sync ───────────────────────────────────────────────────────────

/**
 * Sync a confirmed engagement to Knowledge Nexus (fire-and-forget).
 *
 * Creates a node in the restaurant's namespace representing the confirmed
 * engagement.  If the caller has a KN profile (looked up by phone), creates
 * a corresponding node in their namespace and links both directions.
 *
 * @param {object} params
 * @param {string} params.businessId
 * @param {string} params.callerPhone
 * @param {object} params.engagement   - The confirmed engagement DB row
 * @param {object} params.business     - Business row (name, etc.)
 * @param {string} params.workflowType - 'ordering' | 'appointment' | 'reservation' | 'quote'
 */
export async function syncEngagement({ businessId, callerPhone, engagement, business, workflowType }) {
  if (!KN_BASE) return;

  const payload = typeof engagement.payload === 'string'
    ? JSON.parse(engagement.payload)
    : (engagement.payload || {});

  try {
    // ── 1. Create entity in restaurant's KN namespace ─────────────────────
    const restaurantNode = await knFetch('/api/v1/entities', 'POST', {
      namespace:   businessId,
      type:        workflowType,           // 'reservation', 'order', 'appointment', 'quote'
      external_id: engagement.id,          // Biteline engagement UUID
      attributes: {
        business_name:  business.name,
        workflow_type:  workflowType,
        status:         engagement.status,
        confirmed_at:   engagement.confirmed_at || new Date().toISOString(),
        // Safe engagement fields (no raw caller PII — use anonymised reference)
        caller_ref:     callerPhone ? callerPhone.slice(-4) : null, // last 4 digits only
        ...sanitizePayload(payload, workflowType),
      },
    }).catch((err) => {
      console.error('[KN] Failed to create restaurant entity:', err.message);
      return null;
    });

    if (!restaurantNode?.id) return;

    // ── 2. Look up caller's KN profile by phone ───────────────────────────
    if (!callerPhone) return;

    const callerProfile = await knFetch(
      `/api/v1/profiles/by-phone?phone=${encodeURIComponent(callerPhone)}`
    ).catch(() => null);

    if (!callerProfile?.namespace) {
      // Caller doesn't have a KN profile — restaurant-only node is enough
      return;
    }

    // ── 3. Create mirrored node in caller's KN namespace ──────────────────
    const callerNode = await knFetch('/api/v1/entities', 'POST', {
      namespace:   callerProfile.namespace,
      type:        workflowType,
      external_id: `biteline:${engagement.id}`,
      attributes: {
        business_name:  business.name,
        workflow_type:  workflowType,
        confirmed_at:   engagement.confirmed_at || new Date().toISOString(),
        ...callerSafePayload(payload, workflowType),
      },
    }).catch((err) => {
      console.error('[KN] Failed to create caller entity:', err.message);
      return null;
    });

    if (!callerNode?.id) return;

    // ── 4. Create bi-directional link ─────────────────────────────────────
    await Promise.all([
      knFetch('/api/v1/links', 'POST', {
        from_namespace: businessId,
        from_id:        restaurantNode.id,
        to_namespace:   callerProfile.namespace,
        to_id:          callerNode.id,
        relation:       'customer',
      }),
      knFetch('/api/v1/links', 'POST', {
        from_namespace: callerProfile.namespace,
        from_id:        callerNode.id,
        to_namespace:   businessId,
        to_id:          restaurantNode.id,
        relation:       'visited',
      }),
    ]).catch((err) => console.error('[KN] Failed to create KN link:', err.message));

    console.log(`[KN] Synced engagement ${engagement.id} ↔ caller KN profile`);
  } catch (err) {
    // Never throw — KN sync is supplemental, never blocking
    console.error('[KN] syncEngagement error:', err.message);
  }
}

// ── Payload sanitisers ────────────────────────────────────────────────────────

/** Restaurant-side attributes — business operational data */
function sanitizePayload(payload, type) {
  switch (type) {
    case 'ordering':    return { items: payload.items, total: payload.total, pickup_time: payload.pickup_time };
    case 'appointment': return { service: payload.service, datetime: payload.datetime };
    case 'reservation': return { party_size: payload.party_size, datetime: payload.datetime, special_requests: payload.special_requests };
    case 'quote':       return { inquiry: payload.inquiry };
    default:            return {};
  }
}

/** Caller-side attributes — what the caller would want to remember */
function callerSafePayload(payload, type) {
  switch (type) {
    case 'ordering':    return { items: payload.items, total: payload.total, pickup_time: payload.pickup_time };
    case 'appointment': return { service: payload.service, datetime: payload.datetime };
    case 'reservation': return { party_size: payload.party_size, datetime: payload.datetime };
    case 'quote':       return {};
    default:            return {};
  }
}
