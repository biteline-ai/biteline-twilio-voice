import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM_NUMBER          = process.env.TWILIO_PHONE_NUMBER;
const MESSAGING_SERVICE_SID = process.env.MESSAGING_SERVICE_SID;

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
  const itemsText = (engagement.items || [])
    .map((i) => `${i.qty}x ${i.name} ($${i.price} each)`)
    .join(', ');

  const customerMsg = [
    `Thank you, ${engagement.customer_name || 'valued customer'}, for your order!`,
    `Items: ${itemsText}`,
    `Total: $${engagement.total}`,
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
 */
export async function sendBookingConfirmation({ callerPhone, businessPhone, engagement }) {
  const customerMsg = [
    `Your booking is confirmed!`,
    `Name: ${engagement.customer_name}`,
    `Date/Time: ${engagement.scheduled_at}`,
    `Service: ${engagement.service_name || 'Appointment'}`,
    engagement.notes ? `Notes: ${engagement.notes}` : null,
    `Reply CANCEL to cancel.`,
  ].filter(Boolean).join('\n');

  const businessMsg = [
    `New booking: ${engagement.customer_name}`,
    `Time: ${engagement.scheduled_at} | Service: ${engagement.service_name || 'Appointment'}`,
    `Phone: (masked)`,
  ].join('\n');

  await Promise.all([
    sendSMS(callerPhone, customerMsg),
    businessPhone ? sendSMS(businessPhone, businessMsg) : Promise.resolve(),
  ]);
}
