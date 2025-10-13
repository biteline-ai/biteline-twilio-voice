import {
  addOrder,
  updateOrder,
  deleteOrder,
  addNewCustomer,
  addCallRecord,
} from "../db/supabase.js";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const managerNumber = process.env.MANAGER_NUMBER;
const messagingServiceSid = process.env.MESSAGING_SERVICE_SID;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

/**
 * Ends the call by closing the WebSocket connection.
 * @param {object} connection - WebSocket connection object
 */
export function endCall(connection) {
  if (connection && connection.close) {
    setTimeout(() => {
      connection.close(1000, "Normal closure");
    }, 7000);
  }
}

/**
 * Sends a content SMS to the user.
 * @param {string} content
 * @param {string} callerNumber - Customer's phone number
 */
export async function locationSMS(content, callerNumber) {
  await client.messages.create({
    body: content,
    messagingServiceSid: messagingServiceSid,
    to: callerNumber,
  });
}

/**
 * Transfers the call to the manager using Twilio.
 * @param {string} callSid - The Twilio call SID
 */
export async function transferCall(callSid) {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Dial callerId="${twilioPhoneNumber}">${managerNumber}</Dial>\n</Response>`;
  await client.calls(callSid).update({ twiml: twimlResponse });
}

/**
 * Handles order completion (new order).
 * @param {object} orderData - { customer_name, order_items, total_amount, location, order_time }
 * @param {string} callerNumber - Customer's phone number
 * @param {string} userId - Restaurant user ID
 * @param {string} customerId - Customer ID
 */
export async function handleFinish(
  orderData,
  callerNumber,
  userId,
  customerId
) {
  // Format order items for display
  const itemsText = orderData.order_items
    .map((item) => `${item.count}x ${item.name} ($${item.price} each)`)
    .join(", ");

  const user_message = `
    Thank you, ${orderData.customer_name}, for your order!
    Order Details:
    - Items: ${itemsText}
    - Total: $${orderData.total_amount}
    - Location: ${orderData.location}
    - Pickup Time: ${orderData.order_time}
    We appreciate your business and look forward to serving you. If you have any questions, please reply to this message.`;

  const manager_message = `
      New order: ${orderData.customer_name} ordered ${itemsText} (Total: $${orderData.total_amount}) at ${orderData.location} for ${orderData.order_time}.`;

  await client.messages.create({
    body: user_message,
    messagingServiceSid: messagingServiceSid,
    to: callerNumber,
  });

  await client.messages.create({
    body: manager_message,
    messagingServiceSid: messagingServiceSid,
    to: managerNumber,
  });

  try {
    await addOrder(
      userId,
      customerId,
      orderData.order_items,
      orderData.total_amount,
      orderData.order_time,
      orderData.location,
      callerNumber
    );
  } catch (error) {
    console.error("Failed to add order:", error);
  }
}

/**
 * Deletes an order.
 * @param {object} order - The order object (must include id)
 */
export async function deleteOrderCall(order) {
  await deleteOrder(order);
}

/**
 * Updates an order.
 * @param {object} oldOrder - The existing order object (must include id)
 * @param {object} newData - { customer_name, order_items, total_amount, location, order_time }
 * @param {string} callerNumber - Customer's phone number
 * @param {string} userId - Restaurant user ID
 * @param {string} customerId - Customer ID
 */
export async function updateOrderCall(
  oldOrder,
  newData,
  callerNumber,
  userId,
  customerId
) {
  // Format order items for display
  const itemsText = newData.order_items
    .map((item) => `${item.count}x ${item.name} ($${item.price} each)`)
    .join(", ");

  const user_message = `
    Thank you, ${newData.customer_name}, for your updated order!
    Updated Order Details:
    - Items: ${itemsText}
    - Total: $${newData.total_amount}
    - Location: ${newData.location}
    - Pickup Time: ${newData.order_time}
    We appreciate your business and look forward to serving you. If you have any questions, please reply to this message.`;

  const manager_message = `
      Updated order: ${newData.customer_name} ordered ${itemsText} (Total: $${newData.total_amount}) at ${newData.location} for ${newData.order_time}.`;

  await client.messages.create({
    body: user_message,
    messagingServiceSid: messagingServiceSid,
    to: callerNumber,
  });

  await client.messages.create({
    body: manager_message,
    messagingServiceSid: messagingServiceSid,
    to: managerNumber,
  });

  try {
    await updateOrder(
      oldOrder,
      userId,
      customerId,
      newData.order_items,
      newData.total_amount,
      newData.order_time,
      newData.location,
      callerNumber
    );
  } catch (error) {
    console.error("Failed to update order:", error);
  }
}

/**
 * Returns formatted order as a string
 * @param {object} order - Object to be formatted with new schema
 */
export const formatPendingOrder = (order) => {
  // Format order items for display
  const itemsText = order.order_items
    .map((item) => `${item.count}x ${item.name} ($${item.price} each)`)
    .join(", ");

  // Format location - handle both string and object formats
  let locationText = order.location;
  if (typeof order.location === "object" && order.location !== null) {
    const { name, address, city, state, zip_code } = order.location;
    locationText = `${name || "Location"}: ${
      address || "Address not available"
    }${city ? ` (${city}, ${state}${zip_code ? ` ${zip_code}` : ""})` : ""}`;
  }

  return `Items: ${itemsText}
Pickup Time: ${order.order_time}
Location: ${locationText}
Total Price: $${order.total_amount}`;
};

/**
 * Handles getting caller's name and creating new customer record if needed
 * @param {string} callerName - The caller's name
 * @param {string} callerPhone - The caller's phone number
 * @param {string} userId - The restaurant's user ID
 * @returns {Promise<Object>} - The customer object (existing or newly created) with id
 */
export async function getCallerName(callerName, callerPhone, userId) {
  try {
    console.log(
      `[Utils] Processing caller name: ${callerName} for phone: ${callerPhone}`
    );

    // Add new customer (function will check if exists first)
    const customer = await addNewCustomer(userId, callerPhone, callerName);

    console.log(
      `[Utils] Customer processed successfully: ${customer.customer_name} (ID: ${customer.id})`
    );
    return customer;
  } catch (error) {
    console.error(`[Utils] Error processing caller name: ${error.message}`);
    throw error;
  }
}

/**
 * Records a call completion in the database
 * @param {string} userId - Restaurant user ID
 * @param {string} customerId - Customer ID (can be null)
 * @param {string} phone - Customer phone number
 * @param {number} duration - Call duration in seconds
 * @param {string} status - Call status ('completed' or 'failed')
 */
export async function recordCallCompletion(
  userId,
  customerId,
  phone,
  duration,
  status
) {
  try {
    console.log(
      `[Utils] Recording call completion: ${status} (${duration}s) for ${phone}`
    );
    await addCallRecord(userId, customerId, phone, duration, status);
  } catch (error) {
    console.error(`[Utils] Error recording call completion: ${error.message}`);
    // Don't throw error - call recording failure shouldn't break the call flow
  }
}
