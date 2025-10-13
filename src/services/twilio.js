import {
  getUserIdByPhone,
  getRestaurantsByUserId,
  getRestaurantLocationsByRestaurantId,
  getMenuItemsByRestaurantId,
  getCustomerNameByUserIdAndPhone,
} from "../db/supabase.js";
// import { generateSystemPrompt } from "./openai.js";

// In-memory cache for restaurant data to avoid passing large data via Twilio parameters
// Key: callSid, Value: restaurantData
export const restaurantDataCache = new Map();

/**
 * Fetches complete restaurant data for system prompt generation
 * @param {string} destinationNumber - The destination phone number (Twilio number)
 * @param {string} callerNumber - The caller's phone number
 * @returns {Promise<Object>} - Complete restaurant data object
 */
export async function fetchRestaurantData(destinationNumber, callerNumber) {
  try {
    console.log("=== Supabase DB Test Logic ===");

    // 1. Test getUserIdByPhone
    const userId = await getUserIdByPhone(destinationNumber);
    console.log(`getUserIdByPhone("${destinationNumber}") =>`, userId);

    // 2. Test getRestaurantsByUserId
    if (userId) {
      const effectiveUserId = userId;
      const restaurants = await getRestaurantsByUserId(effectiveUserId);
      console.log(
        `getRestaurantsByUserId("${effectiveUserId}") =>\n` +
          JSON.stringify(restaurants, null, 2)
      );

      // 3. Test getRestaurantLocationsByRestaurantId
      if (restaurants && restaurants.length > 0) {
        const restaurantId =
          restaurants[0].id || restaurants[0].restaurant_id;
        const [locations, menuItemsByCategory] = await Promise.all([
          getRestaurantLocationsByRestaurantId(restaurantId),
          getMenuItemsByRestaurantId(restaurantId),
        ]);
        console.log(
          `getRestaurantLocationsByRestaurantId("${restaurantId}") =>`,
          locations
        );

        // Build and log full restaurantData used for system prompt
        let customerData = null;
        try {
          customerData = await getCustomerNameByUserIdAndPhone(
            effectiveUserId,
            callerNumber
          );
        } catch (_) {}

        const primary = restaurants[0];
        const restaurantData = {
          userId: effectiveUserId,
          // Pass full raw restaurant so prompt generator can normalize fields like prep_time and open_time
          restaurant: primary,
          locations: locations || [],
          // [{ category: string, items: [{ name, description, price }] }]
          menuItems: menuItemsByCategory || [],
          customerData,
        };

        console.log("=== restaurantData for system prompt ===\n" + JSON.stringify(restaurantData, null, 2));
        // console.log("---------------Generating system prompt-----------------");
        // console.log("generatedSystemPrompt: ", generateSystemPrompt(restaurantData));
        
        // Return the restaurant data
        return restaurantData;
      } else {
        console.log("No restaurants found to test locations.");
        return null;
      }
    }
    else {
      console.log("No userId found to test getRestaurantsByUserId.");
      return null;
    }
  } catch (err) {
    console.error("Error during Supabase DB test logic:", err);
    return null;
  }
}

/**
 * Sets up Twilio routes for handling incoming calls
 * @param {FastifyInstance} fastify - Fastify server instance
 */
export const setupTwilioRoutes = (fastify) => {
  // Route for Twilio to handle incoming calls
  fastify.all("/incoming-call", async (request, reply) => {
    try {
      const callerNumber = request.body.From;
      const destinationNumber = request.body.To;
      const callSid = request.body.CallSid;
      
      console.log(
        `[Twilio] Incoming call from: ${callerNumber} to: ${destinationNumber}, CallSid: ${callSid}`
      );

      // Fetch complete restaurant data for system prompt generation
      const restaurantData = await fetchRestaurantData(
        destinationNumber,
        callerNumber
      );

      console.log(`[Twilio] Restaurant data fetched successfully:`, restaurantData ? 'Yes' : 'No');

      // Store restaurant data in server-side cache using CallSid as key
      // This avoids Twilio's parameter size limitations
      if (callSid) {
        restaurantDataCache.set(callSid, restaurantData);
        console.log(`[Twilio] Cached restaurant data for CallSid: ${callSid}`);
        
        // Auto-cleanup cache after 10 minutes to prevent memory leaks
        setTimeout(() => {
          restaurantDataCache.delete(callSid);
          console.log(`[Twilio] Cleaned up cache for CallSid: ${callSid}`);
        }, 10 * 60 * 1000);
      }

      // Generate TwiML response - only pass minimal data via parameters
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
              <Pause length="1"/>
              <Connect>
                  <Stream url="wss://${request.headers.host}/media-stream">
                    <Parameter name="caller" value="${callerNumber}"/>
                    <Parameter name="destination" value="${destinationNumber}"/>
                  </Stream>
              </Connect>
          </Response>`;

      console.log(`[Twilio] Sending TwiML response`);
      console.log(`[Twilio] WebSocket URL: wss://${request.headers.host}/media-stream`);
      
      reply.type("text/xml").send(twimlResponse);
    } catch (error) {
      console.error(`[Twilio] Error handling incoming call:`, error);
      console.error(`[Twilio] Error stack:`, error.stack);

      // Fallback TwiML response in case of error
      const fallbackResponse = `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
              <Say>Sorry, we're experiencing technical difficulties. Please try again later.</Say>
              <Hangup/>
          </Response>`;

      reply.type("text/xml").send(fallbackResponse);
    }
  });
};
