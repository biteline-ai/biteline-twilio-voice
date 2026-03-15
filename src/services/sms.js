import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM_NUMBER          = process.env.TWILIO_PHONE_NUMBER;
const MESSAGING_SERVICE_SID = process.env.MESSAGING_SERVICE_SID;

if (!FROM_NUMBER && !MESSAGING_SERVICE_SID) {
  console.warn(
    '[SMS] Neither TWILIO_PHONE_NUMBER nor MESSAGING_SERVICE_SID is set — ' +
    'all SMS sends will fail until one is configured.'
  );
}

/**
 * Send an SMS message.
 * Uses MessagingServiceSid when available (preferred), falls back to From number.
 *
 * @param {string} to      - E.164 phone number of recipient
 * @param {string} body    - Message body
 */
export async function sendSMS(to, body) {
  const params = { to, body };
  if (MESSAGING_SERVICE_SID) {
    params.messagingServiceSid = MESSAGING_SERVICE_SID;
  } else {
    params.from = FROM_NUMBER;
  }
  return client.messages.create(params);
}

/**
 * Send a location detail SMS to the caller.
 * @param {string} callerPhone
 * @param {string} content     - Pre-formatted location text
 */
export async function sendLocationSMS(callerPhone, content) {
  await sendSMS(callerPhone, content);
}

/**
 * Send an order confirmation SMS to the caller and a notification SMS to
 * the business (manager) phone.
 *
 * @param {object} opts
 * @param {string} opts.callerPhone
 * @param {string} opts.businessPhone  - Business/manager phone number
 * @param {object} opts.engagement     - { customer_name, items, total, location, pickup_time }
 */
export async function sendOrderConfirmation({ callerPhone, businessPhone, engagement }) {
  const fmtPrice = (p) => Number(p || 0).toFixed(2);
  const itemsText = (engagement.items || [])
    .map((i) => `${i.qty}x ${i.name} ($${fmtPrice(i.price)} each)`)
    .join(', ');

  const customerMsg = [
    `Thank you, ${engagement.customer_name || 'valued customer'}, for your order!`,
    `Items: ${itemsText}`,
    `Total: $${fmtPrice(engagement.total)}`,
    `Location: ${engagement.location}`,
    `Pickup: ${engagement.pickup_time}`,
    `We look forward to serving you!`,
  ].join('\n');

  const businessMsg = [
    `New order: ${engagement.customer_name} ordered ${itemsText}`,
    `Total: $${engagement.total} | Location: ${engagement.location} | Time: ${engagement.pickup_time}`,
  ].join('\n');

  await Promise.all([
    sendSMS(callerPhone, customerMsg),
    businessPhone ? sendSMS(businessPhone, businessMsg) : Promise.resolve(),
  ]);
}

/**
 * Send an appointment/reservation confirmation SMS.
 * engagement payload fields: name/guest_name, date_time/reserved_for, service, notes
 */
export async function sendBookingConfirmation({ callerPhone, businessPhone, engagement }) {
  const name     = engagement.name || engagement.guest_name || engagement.customer_name || 'valued customer';
  const dateTime = engagement.date_time || engagement.reserved_for || engagement.scheduled_at || '';
  const service  = engagement.service || engagement.service_name || 'Appointment';

  const customerMsg = [
    `Your booking is confirmed!`,
    `Name: ${name}`,
    dateTime ? `Date/Time: ${dateTime}` : null,
    `Service: ${service}`,
    engagement.notes ? `Notes: ${engagement.notes}` : null,
    `Questions? Call us back anytime.`,
  ].filter(Boolean).join('\n');

  const businessMsg = [
    `New booking: ${name}`,
    dateTime ? `Time: ${dateTime}` : null,
    `Service: ${service}`,
  ].filter(Boolean).join(' | ');

  await Promise.all([
    sendSMS(callerPhone, customerMsg),
    businessPhone ? sendSMS(businessPhone, businessMsg) : Promise.resolve(),
  ]);
}
