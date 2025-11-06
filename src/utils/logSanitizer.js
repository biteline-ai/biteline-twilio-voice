/**
 * Log sanitization utility to protect PII and sensitive data
 * Helps with GDPR, PCI-DSS, and other compliance requirements
 */

/**
 * Masks a phone number for logging
 * Example: +14155551234 becomes +1415***1234
 * @param {string} phoneNumber - Phone number to mask
 * @returns {string} - Masked phone number
 */
export function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return '[invalid-phone]';
  }

  // Keep first 5 and last 4 digits, mask the middle
  if (phoneNumber.length >= 9) {
    const start = phoneNumber.slice(0, 5);
    const end = phoneNumber.slice(-4);
    const middle = '*'.repeat(Math.max(phoneNumber.length - 9, 3));
    return `${start}${middle}${end}`;
  }

  // For shorter numbers, mask all but last 2
  if (phoneNumber.length > 2) {
    return '*'.repeat(phoneNumber.length - 2) + phoneNumber.slice(-2);
  }

  return '***';
}

/**
 * Masks a customer name for logging
 * Example: "John Doe" becomes "J*** D***"
 * @param {string} name - Customer name to mask
 * @returns {string} - Masked name
 */
export function maskCustomerName(name) {
  if (!name || typeof name !== 'string') {
    return '[anonymous]';
  }

  const parts = name.trim().split(/\s+/);
  return parts.map(part => {
    if (part.length <= 1) return part;
    return part[0] + '***';
  }).join(' ');
}

/**
 * Masks order items for logging (keeps item names but masks prices/counts if needed)
 * @param {Array} orderItems - Array of order items
 * @returns {Array} - Sanitized order items
 */
export function maskOrderItems(orderItems) {
  if (!Array.isArray(orderItems)) {
    return [];
  }

  return orderItems.map(item => ({
    name: item.name || '[item]',
    count: item.count || 0,
    // Don't log exact prices in sensitive contexts
    price: '[redacted]'
  }));
}

/**
 * Creates a sanitized log message for incoming calls
 * @param {string} caller - Caller phone number
 * @param {string} destination - Destination phone number
 * @param {string} callSid - Call SID
 * @returns {string} - Sanitized log message
 */
export function sanitizeCallLog(caller, destination, callSid) {
  return `Incoming call from: ${maskPhoneNumber(caller)} to: ${maskPhoneNumber(destination)}, CallSid: ${callSid}`;
}

/**
 * Creates a sanitized log message for customer information
 * @param {string} customerName - Customer name
 * @param {string} customerPhone - Customer phone
 * @returns {string} - Sanitized log message
 */
export function sanitizeCustomerLog(customerName, customerPhone) {
  return `Customer: ${maskCustomerName(customerName)} (${maskPhoneNumber(customerPhone)})`;
}

/**
 * Sanitizes function call arguments that might contain PII
 * @param {Object} args - Function call arguments
 * @returns {Object} - Sanitized arguments
 */
export function sanitizeFunctionArgs(args) {
  if (!args || typeof args !== 'object') {
    return args;
  }

  const sanitized = { ...args };

  // Mask customer names
  if (sanitized.customer_name) {
    sanitized.customer_name = maskCustomerName(sanitized.customer_name);
  }
  if (sanitized.caller_name) {
    sanitized.caller_name = maskCustomerName(sanitized.caller_name);
  }

  // Mask order items prices
  if (sanitized.order_items) {
    sanitized.order_items = maskOrderItems(sanitized.order_items);
  }

  // Keep location and time as-is (not PII)
  return sanitized;
}

/**
 * Generic sanitizer for any string that might contain phone numbers
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Regex to find phone numbers (various formats)
  const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  return text.replace(phonePattern, (match) => maskPhoneNumber(match));
}

/**
 * Determines if logging level should include sensitive data
 * Set ENABLE_SENSITIVE_LOGS=true in .env for debugging only
 * @returns {boolean} - Whether sensitive logging is enabled
 */
export function isSensitiveLoggingEnabled() {
  return process.env.ENABLE_SENSITIVE_LOGS === 'true';
}
