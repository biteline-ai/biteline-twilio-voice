import Fastify from "fastify";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import { setupTwilioRoutes } from "./src/services/twilio.js";
import { setupOpenAIWebSocket} from "./src/services/openai.js";

// Load environment variables from .env file
dotenv.config();

// Initialize Fastify
const fastify = Fastify({
  logger: true,
});

// Register plugins
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);
fastify.register(fastifyMultipart);

// Register rate limiting - protects against DoS attacks and abuse
fastify.register(fastifyRateLimit, {
  max: 100, // Maximum 100 requests
  timeWindow: '1 minute', // Per minute per IP
  ban: 5, // Ban for 5 minutes after exceeding limit
  cache: 10000, // Keep track of 10k IPs
  allowList: (req) => {
    // Allow requests from Twilio (based on signature validation)
    // This is handled in the route itself
    return false;
  },
  skipOnError: true, // Don't rate limit if there's an error checking
  keyGenerator: (request) => {
    // Use IP address as key
    return request.ip || request.headers['x-forwarded-for'] || 'unknown';
  },
  errorResponseBuilder: (request, context) => {
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.after / 1000)} seconds.`,
      expiresIn: Math.ceil(context.after / 1000)
    };
  }
});

// Setup Twilio routes
setupTwilioRoutes(fastify);
// Setup OpenAI WebSocket
setupOpenAIWebSocket(fastify);

// Start the server
const PORT = process.env.PORT || 5050;
fastify.get("/", (req, res) => {
  res.send("Hello World");
});

fastify.listen({ port: PORT, host: "0.0.0.0" }, async (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is listening on port ${PORT}`);
  // Simple test logic for Supabase DB functions

  // Run tests after server starts
  // (async () => {
  //   try {
  //     console.log("=== Supabase DB Test Logic ===");

  //     // 1. Test getUserIdByPhone
  //     const userId = await getUserIdByPhone(testPhone);
  //     console.log(`getUserIdByPhone("${testPhone}") =>`, userId);

  //     // 2. Test getRestaurantsByUserId
  //     if (userId || testUserId) {
  //       const effectiveUserId = userId || testUserId;
  //       const restaurants = await getRestaurantsByUserId(effectiveUserId);
  //       console.log(
  //         `getRestaurantsByUserId("${effectiveUserId}") =>\n` +
  //           JSON.stringify(restaurants, null, 2)
  //       );

  //       // 3. Test getRestaurantLocationsByRestaurantId
  //       if (restaurants && restaurants.length > 0) {
  //         const restaurantId =
  //           testRestaurantId || restaurants[0].id || restaurants[0].restaurant_id;
  //         const [locations, menuItemsByCategory] = await Promise.all([
  //           getRestaurantLocationsByRestaurantId(restaurantId),
  //           getMenuItemsByRestaurantId(restaurantId),
  //         ]);
  //         console.log(
  //           `getRestaurantLocationsByRestaurantId("${restaurantId}") =>`,
  //           locations
  //         );

  //         // Build and log full restaurantData used for system prompt
  //         let customerData = null;
  //         try {
  //           customerData = await getCustomerNameByUserIdAndPhone(
  //             effectiveUserId,
  //             testCallerPhone
  //           );
  //         } catch (_) {}

  //         const primary = restaurants[0];
  //         const restaurantData = {
  //           userId: effectiveUserId,
  //           // Pass full raw restaurant so prompt generator can normalize fields like prep_time and open_time
  //           restaurant: primary,
  //           locations: locations || [],
  //           // [{ category: string, items: [{ name, description, price }] }]
  //           menuItems: menuItemsByCategory || [],
  //           customerData,
  //         };

  //         console.log("=== restaurantData for system prompt ===\n" + JSON.stringify(restaurantData, null, 2));
  //         console.log("---------------Generating system prompt-----------------");
  //         console.log("generatedSystemPrompt: ", generateSystemPrompt(restaurantData));
  //       } else if (testRestaurantId) {
  //         const locations = await getRestaurantLocationsByRestaurantId(
  //           testRestaurantId
  //         );
  //         console.log(
  //           `getRestaurantLocationsByRestaurantId("${testRestaurantId}") =>`,
  //           locations
  //         );
  //       } else {
  //         console.log("No restaurants found to test locations.");
  //       }
  //     }
  //     else {
  //       console.log("No userId found to test getRestaurantsByUserId.");
  //     }
  //   } catch (err) {
  //     console.error("Error during Supabase DB test logic:", err);
  //   }
  // })();
});