/**
 * Dynamic system prompt generator.
 *
 * Takes the session's business data and active workflow config and produces
 * a tailored system prompt for the AI agent.  The custom system_prompt field
 * in ai_config can fully override, or the generated prompt is used.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatHours(hours) {
  if (!hours || typeof hours !== 'object') return 'Contact us for hours.';
  return Object.entries(hours)
    .map(([day, h]) => `${day}: ${h.open}–${h.close}`)
    .join(', ');
}

function formatLocations(locations) {
  if (!locations?.length) return 'Contact us for location details.';
  return locations
    .map((l) => {
      const parts = [l.name, l.address, l.city, l.state, l.zip].filter(Boolean);
      return `• ${parts.join(', ')}${l.phone ? ` (${l.phone})` : ''}`;
    })
    .join('\n');
}

function formatMenuCategories(services) {
  if (!services?.length) return 'See our website for our full menu.';
  // Group by category_name
  const byCategory = {};
  for (const item of services) {
    const cat = item.category_name || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }
  return Object.entries(byCategory)
    .map(([cat, items]) => {
      const itemLines = items
        .filter((i) => i.is_available !== false)
        .map((i) => `  – ${i.name}${i.price ? ` ($${i.price})` : ''}${i.description ? ': ' + i.description : ''}`)
        .join('\n');
      return `${cat}:\n${itemLines}`;
    })
    .join('\n\n');
}

function formatSpecials(specials) {
  if (!specials?.length) return '';
  const lines = specials.map(
    (s) => `  ★ ${s.name}${s.price ? ` ($${s.price})` : ''}${s.description ? ' — ' + s.description : ''}`
  ).join('\n');
  return `TODAY'S SPECIALS:\n${lines}`;
}

function formatServices(services) {
  if (!services?.length) return 'Contact us for available services.';
  return services
    .filter((s) => s.is_available !== false)
    .map((s) => {
      const parts = [`• ${s.name}`];
      if (s.duration_minutes) parts.push(`(${s.duration_minutes} min)`);
      if (s.price) parts.push(`– $${s.price}`);
      if (s.description) parts.push(`— ${s.description}`);
      return parts.join(' ');
    })
    .join('\n');
}

// ── Prompt sections shared across all verticals ────────────────────────────────

function commonRules(business, customer) {
  const greeting = customer?.name
    ? `Welcome back, ${customer.name}!`
    : 'Welcome!';
  return `
GROUND RULES:
- Keep responses concise — 50 words or fewer unless explaining something complex.
- Speak naturally, like a knowledgeable human assistant.
- Before running any background tool, briefly acknowledge the caller ("Let me check that for you.").
- ${greeting} Use the caller's name once you know it.
- If you don't know something, say so honestly — never make up information.
`.trim();
}

function draftResumeSection(draft) {
  if (!draft) return '';
  let payload;
  try {
    payload = typeof draft.payload === 'string' ? JSON.parse(draft.payload) : draft.payload;
  } catch {
    payload = {};
  }
  return `
RETURNING CALLER — DRAFT ENGAGEMENT:
The caller has an incomplete session from a previous call. Here are the details:
${JSON.stringify(payload, null, 2)}

Greet them warmly, let them know you have their previous session, and ask if they'd like to continue it, modify it, or start fresh.
`.trim();
}

// ── Vertical-specific prompt builders ─────────────────────────────────────────

function orderingPrompt({ business, locations, services, specials, activeMenu, customer, draft, workflowConfig }) {
  const cfg = workflowConfig?.config || {};
  const menuLabel = activeMenu?.name ? `${activeMenu.name} Menu` : 'Menu';
  const specialsSection = formatSpecials(specials);
  return `
You are ${business.name}'s AI phone ordering assistant. You help callers place, update, or cancel food orders.

${commonRules(business, customer)}

${draftResumeSection(draft)}

BUSINESS INFO:
Name: ${business.name}
Locations:
${formatLocations(locations)}

${menuLabel.toUpperCase()}:
${formatMenuCategories(services)}
${specialsSection ? '\n' + specialsSection : ''}

TAX: ${cfg.tax_pct || 0}% added to all orders.

ORDER PROTOCOL:
1. Capture caller's name (use get_caller_name tool).
2. Collect all items (confirm each is on the menu), pickup location, and pickup time.
3. Confirm no more items to add.
4. BEFORE reading the order summary: call save_draft_engagement with the full order payload.
5. Read the complete order summary: name, itemized list with prices, total (pre-tax), location, time.
6. Ask for explicit confirmation ("Does everything look correct?").
7. If confirmed: call confirm_engagement, then say "Your order is confirmed! Goodbye." and call end_call.
8. If caller wants changes: update items, re-save draft, re-read summary.

CANCELLATION: If the caller wants to cancel an existing order, use cancel_engagement.

TRANSFER: If the caller wants to speak with a person, use transfer_call.
`.trim();
}

function appointmentPrompt({ business, locations, services, customer, draft, workflowConfig }) {
  return `
You are ${business.name}'s AI appointment scheduling assistant.

${commonRules(business, customer)}

${draftResumeSection(draft)}

BUSINESS INFO:
Name: ${business.name}
Locations:
${formatLocations(locations)}

SERVICES:
${formatServices(services)}

BOOKING PROTOCOL:
1. Capture caller's name (use get_caller_name tool).
2. Ask which service they'd like to book.
3. Ask for preferred date and time.
4. Check availability (use check_availability tool) — the response includes slot_id for each slot.
5. Present the available times to the caller naturally ("I have 9 AM with 3 spots or 10 AM with 2 spots…").
6. Once the caller picks a time, note its slot_id from the check_availability response.
7. BEFORE reading the summary: call save_draft_engagement with the full payload including slot_id, date_time, service name, and party/guest details.
8. Read the booking summary: name, service, date/time, location.
9. Ask for explicit confirmation.
10. If confirmed: call confirm_engagement, then say "Your appointment is booked! Goodbye." and call end_call.

CANCELLATIONS: Use cancel_engagement when a caller wants to cancel.
`.trim();
}

function reservationPrompt({ business, locations, services, customer, draft, workflowConfig }) {
  const cfg = workflowConfig?.config || {};
  return `
You are ${business.name}'s AI reservation assistant.

${commonRules(business, customer)}

${draftResumeSection(draft)}

BUSINESS INFO:
Name: ${business.name}
Locations:
${formatLocations(locations)}

${cfg.reservation_policy ? `RESERVATION POLICY:\n${cfg.reservation_policy}\n` : ''}

BOOKING PROTOCOL:
1. Capture caller's name (use get_caller_name tool).
2. Ask for party size, preferred date, and time.
3. Check availability (use check_availability tool) — the response includes slot_id for each slot.
4. Present the available times to the caller naturally ("I have 7 PM with 4 spots or 7:30 PM with 2 spots…").
5. Once the caller picks a time, note its slot_id from the check_availability response.
6. BEFORE reading the summary: call save_draft_engagement with the full payload including slot_id, date_time, party_size, and guest name.
7. Read the reservation summary: name, party size, date/time, location.
8. Ask for explicit confirmation.
9. If confirmed: call confirm_engagement, then say "Your reservation is confirmed!" and call end_call.
`.trim();
}

function quotePrompt({ business, locations, services, customer, draft, workflowConfig }) {
  const cfg = workflowConfig?.config || {};
  const questions = cfg.questions || [
    'What service are you interested in?',
    'What is the best way to reach you?',
    'What is your timeline?',
  ];
  return `
You are ${business.name}'s AI lead capture assistant. Your goal is to gather information for a quote or service inquiry.

${commonRules(business, customer)}

${draftResumeSection(draft)}

BUSINESS INFO:
Name: ${business.name}

INFORMATION TO COLLECT:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

PROTOCOL:
1. Capture caller's name (use get_caller_name tool).
2. Walk through the questions naturally — don't make it feel like a form.
3. BEFORE summarizing: call save_draft_engagement with all collected info.
4. Read back the summary.
5. Ask for confirmation and call confirm_engagement.
6. Thank the caller and let them know someone will follow up. Call end_call.
`.trim();
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate a system prompt for the given session context.
 * If aiConfig.system_prompt is set, it takes full precedence.
 *
 * @param {object} session - Full call session object from store
 * @returns {string}
 */
export function generateSystemPrompt(session) {
  const { business, locations, services, specials, activeMenu, aiConfig, activeWorkflow, customer, draft } = session;

  // Custom prompt override
  if (aiConfig?.system_prompt?.trim()) {
    return aiConfig.system_prompt;
  }

  const workflowType   = activeWorkflow?.type || 'ordering';
  const workflowConfig = activeWorkflow;

  const args = { business, locations, services, specials, activeMenu, customer, draft, workflowConfig };

  switch (workflowType) {
    case 'ordering':    return orderingPrompt(args);
    case 'appointment': return appointmentPrompt(args);
    case 'reservation': return reservationPrompt(args);
    case 'quote':       return quotePrompt(args);
    default:            return orderingPrompt(args);
  }
}
