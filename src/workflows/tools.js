/**
 * AI function tool declarations.
 *
 * Tools are grouped by capability:
 *  - COMMON:       available in every workflow
 *  - ORDERING:     food ordering specific
 *  - APPOINTMENT:  appointment booking specific
 *  - RESERVATION:  table/venue reservation specific
 *  - QUOTE:        lead capture / quote request
 *
 * buildTools(workflowType) returns the tool list for the given vertical.
 */

// ── Common tools ──────────────────────────────────────────────────────────────

const tool_end_call = {
  type: 'function',
  name: 'end_call',
  description: 'End the phone call. Use when the conversation is complete or the caller says goodbye.',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Brief reason the call is ending.' },
    },
    required: ['reason'],
  },
};

const tool_transfer_call = {
  type: 'function',
  name: 'transfer_call',
  description: 'Transfer the caller to a human staff member when they request it.',
  parameters: { type: 'object', properties: {} },
};

const tool_location_sms = {
  type: 'function',
  name: 'location_sms',
  description: 'Send a text message with location details when the caller asks for an address.',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Location details to send via SMS.' },
    },
    required: ['content'],
  },
};

const tool_get_caller_name = {
  type: 'function',
  name: 'get_caller_name',
  description: "Capture the caller's name when they first introduce themselves. This saves or retrieves their customer record.",
  parameters: {
    type: 'object',
    properties: {
      caller_name: { type: 'string', description: "The caller's name as they stated it." },
    },
    required: ['caller_name'],
  },
};

const tool_update_caller_name = {
  type: 'function',
  name: 'update_caller_name',
  description: "Update the caller's name if they correct it during the conversation.",
  parameters: {
    type: 'object',
    properties: {
      new_name: { type: 'string', description: 'The corrected name.' },
    },
    required: ['new_name'],
  },
};

// ── Draft / engagement lifecycle tools ────────────────────────────────────────

const tool_save_draft = {
  type: 'function',
  name: 'save_draft_engagement',
  description: [
    'IMPORTANT: Call this BEFORE reciting the confirmation summary to the caller.',
    'It persists their order/booking to the database so it is safe even if the call drops.',
    'The caller will not know this was called — it is a silent background action.',
    'For appointment/reservation bookings, always include the slot_id from check_availability in the payload.',
  ].join(' '),
  parameters: {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        description: [
          'The complete engagement data collected so far.',
          'For bookings: include slot_id (from check_availability), date_time, party_size/guest_name/name as applicable.',
          'For orders: include items array, total, pickup_time.',
        ].join(' '),
      },
    },
    required: ['payload'],
  },
};

const tool_confirm_engagement = {
  type: 'function',
  name: 'confirm_engagement',
  description: [
    'Call AFTER the caller explicitly confirms their order/booking.',
    'This promotes the draft to a confirmed engagement and triggers confirmation SMS.',
    'Only call this after save_draft_engagement has already been called.',
  ].join(' '),
  parameters: {
    type: 'object',
    properties: {},
  },
};

const tool_cancel_engagement = {
  type: 'function',
  name: 'cancel_engagement',
  description: 'Cancel an existing draft or confirmed engagement when the caller requests it.',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Reason for cancellation.' },
    },
    required: ['reason'],
  },
};

// ── Ordering-specific tools ───────────────────────────────────────────────────

const tool_update_order = {
  type: 'function',
  name: 'update_draft_order',
  description: 'Update the items, location, or pickup time of the current draft order.',
  parameters: {
    type: 'object',
    properties: {
      payload: {
        type: 'object',
        description: 'Updated order fields.',
        properties: {
          customer_name: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name:  { type: 'string' },
                price: { type: 'number' },
                qty:   { type: 'number' },
              },
              required: ['name', 'price', 'qty'],
            },
          },
          total:       { type: 'number' },
          location:    { type: 'string' },
          pickup_time: { type: 'string' },
        },
      },
    },
    required: ['payload'],
  },
};

// ── Appointment / reservation tools ──────────────────────────────────────────

const tool_check_availability = {
  type: 'function',
  name: 'check_availability',
  description: [
    'Check available time slots for a given date.',
    'Returns a list of slots, each with a slot_id, time, and open spots.',
    'When the caller chooses a slot, include that slot_id in the payload when calling save_draft_engagement.',
  ].join(' '),
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: "Date to check in YYYY-MM-DD format, or 'today', 'tomorrow'.",
      },
      service_name: {
        type: 'string',
        description: 'Name of the service/appointment type requested (optional).',
      },
    },
    required: ['date'],
  },
};

// ── Knowledge search tool ─────────────────────────────────────────────────────

const tool_search_knowledge = {
  type: 'function',
  name: 'search_knowledge',
  description: [
    'Search the business knowledge base for detailed information the caller is asking about.',
    'Use this when the system prompt does not have enough detail to answer — FAQs, policies, product specs, ingredient lists, etc.',
    'Do NOT use for availability checks (use check_availability instead).',
  ].join(' '),
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural-language question to search for.',
      },
    },
    required: ['query'],
  },
};

// ── Tool sets per workflow type ───────────────────────────────────────────────

const COMMON = [
  tool_end_call,
  tool_transfer_call,
  tool_location_sms,
  tool_get_caller_name,
  tool_update_caller_name,
  tool_save_draft,
  tool_confirm_engagement,
  tool_cancel_engagement,
];

const TOOL_SETS = {
  ordering:    [...COMMON, tool_update_order],
  appointment: [...COMMON, tool_check_availability],
  reservation: [...COMMON, tool_check_availability],
  quote:       [...COMMON],
};

/**
 * Return the tool list for a given workflow type and ai_config flags.
 *
 * @param {string}  workflowType        - 'ordering' | 'appointment' | 'reservation' | 'quote'
 * @param {object}  [aiConfig={}]       - Business ai_config row
 * @param {boolean} [aiConfig.draft_engagement_enabled] - When false, removes draft/confirm/cancel tools
 * @param {boolean} [aiConfig.kn_enabled]               - When true, adds the search_knowledge tool
 * @returns {Array}
 */
export function buildTools(workflowType, aiConfig = {}) {
  let tools = [...(TOOL_SETS[workflowType] ?? COMMON)];

  // Remove draft lifecycle tools when draft_engagement_enabled is explicitly false
  if (aiConfig.draft_engagement_enabled === false) {
    const draftTools = new Set(['save_draft_engagement', 'confirm_engagement', 'cancel_engagement', 'update_draft_order']);
    tools = tools.filter((t) => !draftTools.has(t.name));
  }

  // Add knowledge search only when KN is enabled for this business
  if (aiConfig.kn_enabled) {
    tools.push(tool_search_knowledge);
  }

  return tools;
}
