import WebSocket from "ws";
import dotenv from "dotenv";
import { getTodayOrdersByPhone } from "../db/supabase.js";
import { SYSTEM_MESSAGE, SampleRestaurantData } from "../utils/constants.js";
import {
  endCall,
  locationSMS,
  transferCall,
  handleFinish,
  deleteOrderCall,
  updateOrderCall,
  formatPendingOrder,
  getCallerName,
  recordCallCompletion,
} from "../utils/utils.js";
// Import functionTools from functionDeclarations.js
import { functionTools } from "../utils/functionDeclarations.js";
// Import restaurant data cache from twilio service
import { restaurantDataCache } from "./twilio.js";


/**
 * Generates a dynamic system prompt using restaurant data
 * @param {Object} restaurantData - Complete restaurant data object
 * @returns {string} - Dynamic system prompt
 */
export function generateSystemPrompt(restaurantData) {
  const { restaurant: rawRestaurant = {}, locations = [], menuItems = [], customerData } =
    restaurantData || {};

  // Normalize restaurant fields
  const normalizePrepTime = (prep) => {
    if (!prep) return "Preparation time not specified";
    if (Array.isArray(prep)) {
      // Handle arrays of objects like { from, to, prep }
      const formatted = prep
        .map((p) => {
          if (p && typeof p === "object") {
            // If object resembles a time window with prep minutes
            const from = p.from || p.From;
            const to = p.to || p.To;
            const prepVal = p.prep ?? p.Prep ?? p.minutes ?? p.Minutes;
            if (from && to && (prepVal != null)) {
              const minutes = String(prepVal).trim();
              return `${from}–${to}: ${minutes} min`;
            }
            // Otherwise try common value holder or first value
            return p.value ?? p.Value ?? Object.values(p)[0] ?? null;
          }
          return p;
        })
        .filter((v) => v != null && v !== "")
        .join("; ");
      return formatted || "Preparation time not specified";
    }
    if (typeof prep === "object") {
      try {
        const from = prep.from || prep.From;
        const to = prep.to || prep.To;
        const prepVal = prep.prep ?? prep.Prep ?? prep.minutes ?? prep.Minutes;
        if (from && to && (prepVal != null)) {
          const minutes = String(prepVal).trim();
          return `${from}–${to}: ${minutes} min`;
        }
        const parts = Object.entries(prep)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        return parts || "Preparation time not specified";
      } catch {
        return String(prep);
      }
    }
    return String(prep);
  };

  const normalizeOpenTime = (openTime) => {
    if (!openTime) return "Hours not specified";
    const formatEntry = (e) => {
      if (!e || typeof e !== "object") return null;
      const day = e.Date || e.day || e.Day;
      const from = e.From || e.from;
      const to = e.To || e.to;
      if (!from || !to) return null;
      return day ? `${day}: ${from}–${to}` : `${from}–${to}`;
    };
    if (Array.isArray(openTime)) {
      const parts = openTime.map(formatEntry).filter(Boolean).join("; ");
      return parts || "Hours not specified";
    }
    const single = formatEntry(openTime);
    if (single) return single;
    try {
      return Object.entries(openTime)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ") || "Hours not specified";
    } catch {
      return String(openTime);
    }
  };

  const restaurant = {
    name: rawRestaurant.restaurant_name || rawRestaurant.name || "",
    description: rawRestaurant.description || "",
    tax_rate: rawRestaurant.tax ?? rawRestaurant.tax_rate ?? 6.75,
    prep_time: normalizePrepTime(rawRestaurant.prep_time),
  };

  // Build locations section
  const locationsText = (locations || [])
    .map((location) => {
      const cityLine = location.city
        ? ` (${location.city}, ${location.state}${location.zip_code ? ` ${location.zip_code}` : ""})`
        : "";
      return `– ${location.name || "Location"}: ${
        location.address || "Address not available"
      }${cityLine}`;
    })
    .join("\n    ");

  // Build menu text from structured categories if available: [{ category, items: [{ name, description, price }] }]
  let menuText = "";
  if (Array.isArray(menuItems) && menuItems.length > 0 && menuItems[0]?.items) {
    menuText = menuItems
      .map((cat) => {
        const title = cat.category || cat.name || "Menu";
        const items = Array.isArray(cat.items) ? cat.items : [];
        if (items.length === 0) return "";
        const itemsText = items
          .map((item, index) => {
            const priceNum = typeof item.price === "number" ? item.price : parseFloat(item.price);
            const price = isNaN(priceNum) ? "-" : String(priceNum);
            return `${index + 1}. ${item.name} ($${price}): ${item.description || "No description available"}.`;
          })
          .join("\n      ");
        return `    ${title}:\n      ${itemsText}`;
      })
      .filter(Boolean)
      .join("\n\n  ");
  } else if (Array.isArray(menuItems) && menuItems.length > 0) {
    // Fallback: attempt to group by 'category' field on each item
    const grouped = {};
    for (const item of menuItems) {
      const key = item.category || "Other";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    }
    menuText = Object.entries(grouped)
      .map(([category, items]) => {
        const itemsText = items
          .map((item, index) => {
            const priceNum = typeof item.price === "number" ? item.price : parseFloat(item.price);
            const price = isNaN(priceNum) ? "-" : String(priceNum);
            return `${index + 1}. ${item.name} ($${price}): ${item.description || "No description available"}.`;
          })
          .join("\n      ");
        return `    ${category}:\n      ${itemsText}`;
      })
      .join("\n\n  ");
  }

  const dynamicSystemPrompt = `
GENERAL RULES:
  - Before calling any function/tool, always say a brief sentence like "Let me check that for you..." so the user knows you're processing their request.
  - Catch the user's name in the first message and use it for the entire conversation.
  - Limit your max output words to 50 with clear, concise answer.
  - Keep the conversation natural and engaging without interrupting.

1. Role & Processes
  1.1) You are ${
    restaurant.name || "the restaurant"
  }'s AI assistant, providing professional and courteous service for the restaurant.
  1.2) Your responsibilities include answering questions and processing orders according to strict guidelines.

2. Info & Source
  2.1) Restaurant Information:
    • Restaurant Name: ${restaurant.name || "Restaurant Name Not Available"}
    • Description: ${restaurant.description || "No description available"}
    • Locations:
      ${locationsText || "No locations available"}
    • Preparation Time: ${restaurant.prep_time || "Preparation time not specified"}
    • Open Time: ${normalizeOpenTime(rawRestaurant.open_time)}

  2.2) [Food Menu] (Tax: ${restaurant.tax_rate || "6.75"}% added to all orders):
  ${menuText || "Menu items not available"}

  2.3) Limitations
    • Payment: You cannot process payments but will text orders to the restaurant.
    • Session: Each conversation is independent - do not retain information between sessions.
    • Allergen Warning: "We cannot guarantee against cross-contamination. We use gluten, tree nuts, onions, and other common allergens. Not recommended for those with severe allergies."
    • Other Scope Limitation: "I can only assist with restaurant-related questions and menu items. How can I help you?"

3. Special Notes
  3.1) Order Processing Protocol:
    • [New Order Protocol] Information Collection (REQUIRED FIELDS):
      a) Food Items: Verify all items exist on menu using [Food name]. Accept modifications if explicitly stated. Must confirm no additional items to order before proceeding.
      b) Preferred Location: Choose from available locations listed above.
      c) Time: Must be current day during operating hours. Acceptable formats: specific time (verify within hours), duration from now (calculate and verify). Reject invalid times with operating hour reminder.
    • [Pending Order Protocol] If the user has existing orders today - Catch all the information in [Previous Pending Order]:
      – If the user wants to update previous order:
        → Provide details of the previous order and update the details what the user wants to update.
      – If the user wants a new order:
        → If the user says they want to place a new order, you must start a completely new order and ignore any previous pending orders. Do not ask about updating or canceling the previous order again unless the user brings it up. Follow the [New Order Protocol].
      – If the user wants to cancel previous order:
        → Respond "Okay, you'd like to cancel your previous pending order. No problem at all! Is there anything else I can help you with?" and after that, proceed a function call [Delete Order].
    • Order Confirmation: Ensure all required fields are complete and valid. Recite customer name, itemized order ([Food name], [Price]), total (pre-tax), location, and time. Ask for confirmation. Handle modifications by restarting confirmation. Repeat until explicit confirmation.
    • Order Completion: Upon confirmation: Respond with "Your order is complete! Goodbye and [appropriate closing remark]". After the response, proceed a function call-[Handle Finish] if it's a new order completion, and proceed a function call-[Update Order] if it's an update of the previous order.

  3.2) Cancellation Protocol:
    • If the user extremely mentions any intent to finish the conversation (e.g. "Goodbye"):
      – Immediately stop all order processing
      – Do NOT proceed with order confirmation, request any additional information, or send any order-related SMS notifications
      - Return text response for closing like "I understand you'd like to cancel. No problem at all! Thank you for considering ${
        restaurant.name || "our restaurant"
      }. Please feel free to call back anytime if you change your mind. Have a wonderful day!" after that, process a function call [Ending Call].
  3.3) Location Protocol:
    • If the user requests details about a specific location, respond like "Okay, I'll send location details via text" and after that, process a function call [Location SMS].
  3.4) Human Transfer Protocol:
    • If the user requests human assistance and not proceed with AI, respond:
      "I'll connect you with our manager now. Please hold the line." and after that, proceed a function call [Transfer Call].

4. Function Callings
  4.1) [Ending Call]
   - Invoke a function call "end_call".
  4.2) [Location SMS]
   - Invoke a function call "location_sms (content)".
   - Send location details based on available locations.
  4.3) [Transfer Call]
   - Invoke a function call "transfer_call".
  4.4) [Get Caller Name]
   - Invoke a function call "get_caller_name(caller_name)" when the user provides their name.
   - This will create a customer record if they are a new caller, or retrieve existing customer information.
   - Use this function immediately when the user tells you their name for the first time.
  4.5) [Handle Finish]
   - Invoke a function call "handle_finish(customer_name, order_items, total_amount, location, order_time)".
   - Set customer's name to "customer_name" field.
   - Set "order_items" as an array of objects with "name", "price", and "count" for each item.
   - Set the total amount of the order before tax to "total_amount" field (number type).
   - Set the location which the user preferred to "location" field.
   - Set the time when the user wants to pick up the order to "order_time" field.
   - All fields are required, so take care about final confirmation for the order and find out all exact fields.
  4.6) [Delete Order]
   - Invoke a function call "delete_order".
  4.7) [Update Order]
   - Invoke a function call "update_order(customer_name, order_items, total_amount, location, order_time)".
   - Set updated customer's name to "customer_name" field. If no updated data, set previous customer's name to "customer_name" field.
   - Set "order_items" as an updated array of objects with "name", "price", and "count" for each item. If no updated data, set previous order_items to "order_items" field.
   - Set the updated total amount of the ordered foods before tax. If no updated data, set previous total_amount to "total_amount" field.
   - Set the updated location which the user preferred to "location" field. If no updated data, set previous location to "location" field.
   - Set the updated time when the user wants to pick up the order to "order_time" field. If no updated data, set previous order_time to "order_time" field.
   - All fields are required, so set all updated information correctly. If any fields aren't provided with updated data, then keep the fields with previous information.
`;

  return dynamicSystemPrompt;
}

// Load environment variables
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const setupOpenAIWebSocket = (fastify) => {
  fastify.register(async (fastify) => {
    fastify.get("/media-stream", { websocket: true }, (connection, req) => {
      // WebSocket state variables
      let streamSid = null;
      let latestMediaTimestamp = 0;
      let lastAssistantItem = null;
      let markQueue = [];
      let responseStartTimestampTwilio = null;
      let callerNumber;
      let callSid = null;
      let pendingOrders;
      let restaurantData = SampleRestaurantData;
      let customerId = null;
      let callStartTime = null;
      let hasSentInitialGreeting = false;
      let callStatusRecorded = false;
      let functionCallBuffer = new Map(); // Buffer for incomplete function call arguments

      // Helper function to record call completion
      const recordCallEnd = async (status) => {
        if (callStatusRecorded) {
          console.log(`[Utils] Call status already recorded, skipping duplicate: ${status}`);
          return;
        }
        if (callStartTime && restaurantData && restaurantData.userId) {
          const duration = Math.floor((Date.now() - callStartTime) / 1000); // Duration in seconds
          await recordCallCompletion(
            restaurantData.userId,
            customerId,
            callerNumber,
            duration,
            status
          );
          callStatusRecorded = true;
        }
      };

      // Initialize OpenAI WebSocket connection
      const openAiWs = new WebSocket(
        "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2025-06-03",
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "OpenAI-Beta": "realtime=v1",
          },
        }
      );

      openAiWs.on("open", () => {
        console.log("[WebSocket] Connected to OpenAI Realtime API");
        // Don't initialize session immediately - wait for restaurant data
      });

      const initializeSession = () => {
        console.log("[WebSocket] ===== INITIALIZING SESSION =====");
        
        // Generate dynamic system prompt if restaurant data is available
        const systemPrompt = restaurantData
          ? generateSystemPrompt(restaurantData) +
            ". Please keep your responses concise and limit them to 4096 tokens."
          : SYSTEM_MESSAGE +
            ". Please keep your responses concise and limit them to 4096 tokens.";

        // console.log("=================System Prompt=================");
        // console.log(systemPrompt.substring(0, 500) + "... (truncated)");
        
        const sessionUpdate = {
          type: "session.update",
          session: {
            turn_detection: { type: "server_vad" },
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: "sage",
            instructions: systemPrompt,
            modalities: ["text", "audio"],
            temperature: 1,
            tools: functionTools,
            tool_choice: "auto",
          },
        };

        if (openAiWs.readyState === WebSocket.OPEN) {
          console.log("[WebSocket] Sending session.update to OpenAI");
          openAiWs.send(JSON.stringify(sessionUpdate));
          console.log("[WebSocket] Sending initial conversation item");
          sendInitialConversationItem();
        } else {
          console.warn("[WebSocket] Cannot initialize session: WebSocket not open (state:", openAiWs.readyState, ")");
        }
      };

      const sendInitialConversationItem = () => {
        if (hasSentInitialGreeting) return;
        // Generate dynamic greeting based on restaurant data
        const greeting = restaurantData
          ? `Greet the user with "${
              restaurantData.customerData?.customer_name
                ? `Hello ${
                    restaurantData.customerData.customer_name
                  }! Thank you for calling ${
                    restaurantData.restaurant?.name || "our restaurant"
                  }, I am your friendly virtual assistant here to take your order or to answer your questions. If at any point you would like to speak with our manager, simply press 0 or say connect me to the manager. I see you're a returning customer!`
                : `Hello there! Thank you for calling ${
                    restaurantData.restaurant?.name || "our restaurant"
                  }, I am your friendly virtual assistant here to take your order or to answer your questions. If at any point you would like to speak with our manager, simply press 0 or say connect me to the manager. Could I get your name, please?`
            }"`
          : 'Greet the user with "Hello there! Thank you for calling Tutti Da Gio, I am your friendly virtual assistant here to take your order or to answer your questions. If at any point you would like to speak with our manager, simply press 0 or say connect me to the manager. Could I get your name, please?"';

        const initialConversationItem = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: greeting,
              },
            ],
          },
        };

        if (openAiWs.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify(initialConversationItem));
          openAiWs.send(JSON.stringify({ type: "response.create" }));
          hasSentInitialGreeting = true;
        } else {
          console.warn("[WebSocket] Cannot send initial conversation item: WebSocket not open (state:", openAiWs.readyState, ")");
        }
      };

      const sendPreviousOrderContext = (pendingOrders) => {
        if (pendingOrders?.length > 0) {
          const lastOrder = pendingOrders[0];
          console.log("Previous Order:", lastOrder);

          // Format the order in a clear, structured way for the model
          const formattedOrder = formatPendingOrder(lastOrder);

          const contextInjection = {
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `[SYSTEM CONTEXT]: The caller has a previous order from today that you can access, modify, or delete. Here are the complete order details:\n\n${formattedOrder}\n\nYou have access to these functions: delete_order() to delete this order, update_order() to modify it, or handle_finish() to complete the order. Use these functions when the caller requests changes to their existing order.`,
                },
              ],
            },
          };
          
          // Check WebSocket state before sending
          if (openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify(contextInjection));
          } else {
            console.warn("[WebSocket] Cannot send previous order context: WebSocket not open (state:", openAiWs.readyState, ")");
          }
        }
      };

      // Handle interruption when the caller's speech starts
      const handleSpeechStartedEvent = () => {
        if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
          const elapsedTime =
            latestMediaTimestamp - responseStartTimestampTwilio;

          if (lastAssistantItem) {
            const truncateEvent = {
              type: "conversation.item.truncate",
              item_id: lastAssistantItem,
              content_index: 0,
              audio_end_ms: elapsedTime,
            };
            if (openAiWs.readyState === WebSocket.OPEN) {
              openAiWs.send(JSON.stringify(truncateEvent));
            } else {
              console.warn("[WebSocket] Cannot send truncate event: WebSocket not open (state:", openAiWs.readyState, ")");
            }
          }

          connection.send(
            JSON.stringify({
              event: "clear",
              streamSid: streamSid,
            })
          );

          // Reset
          markQueue = [];
          lastAssistantItem = null;
          responseStartTimestampTwilio = null;
        }
      };

      const sendMark = (connection, streamSid) => {
        if (streamSid) {
          const markEvent = {
            event: "mark",
            streamSid: streamSid,
            mark: { name: "responsePart" },
          };
          connection.send(JSON.stringify(markEvent));
          markQueue.push("responsePart");
        }
      };

      openAiWs.on("message", async (data) => {
        try {
          const response = JSON.parse(data);

          if (response.type === "response.audio.delta" && response.delta) {
            const audioDelta = {
              event: "media",
              streamSid: streamSid,
              media: {
                payload: Buffer.from(response.delta, "base64").toString(
                  "base64"
                ),
              },
            };
            connection.send(JSON.stringify(audioDelta));
            if (!responseStartTimestampTwilio) {
              responseStartTimestampTwilio = latestMediaTimestamp;
            }
            if (response.item_id) {
              lastAssistantItem = response.item_id;
            }
            sendMark(connection, streamSid);
          }

          if (response.type === "input_audio_buffer.speech_started") {
            handleSpeechStartedEvent();
          }

          // --- Function Call Detection for GPT-4o Realtime API ---
          if (
            response.type === "conversation.item.created" &&
            response.item &&
            response.item.type === "function_call"
          ) {
            const functionName = response.item.name;
            console.log("✅ Function call detected");
            console.log("🔧 Function name:", functionName);
          }

          // Handle function call arguments that might come in chunks
          if (response.type === "response.function_call_arguments.delta") {
            const callId = response.id;
            if (!functionCallBuffer.has(callId)) {
              functionCallBuffer.set(callId, "");
            }
            functionCallBuffer.set(callId, functionCallBuffer.get(callId) + (response.delta || ""));
          }

          if (response.type === "response.function_call_arguments.done") {
            // console.log("✅ RESPONSE FUNCTION CALL DONE - ID:", response.id);
            console.log(
              "✅ RESPONSE FUNCTION CALL DONE - NAME:",
              response.name
            );

            // Get the complete arguments (either from buffer or direct)
            const callId = response.id;
            let completeArguments = response.arguments;
            
            // If we have buffered data, use it
            if (functionCallBuffer.has(callId)) {
              completeArguments = functionCallBuffer.get(callId);
              functionCallBuffer.delete(callId); // Clean up buffer
              console.log("🔍 Using buffered arguments for call ID:", callId);
            }
            
            console.log(
              "✅ RESPONSE FUNCTION CALL DONE - ARGUMENTS:",
              completeArguments
            );

            let args = {};
            try {
              // Log the raw arguments to debug JSON issues
              console.log("🔍 Raw arguments string:", JSON.stringify(completeArguments));
              console.log("🔍 Arguments length:", completeArguments?.length);
              
              // Validate arguments before parsing
              if (!completeArguments || typeof completeArguments !== 'string') {
                console.error("❌ Invalid arguments format:", typeof completeArguments);
                throw new Error("Arguments is not a string");
              }
              
              // Check for incomplete JSON (common issue with streaming)
              const trimmedArgs = completeArguments.trim();
              if (!trimmedArgs.startsWith('{') || !trimmedArgs.endsWith('}')) {
                console.error("❌ Incomplete JSON detected:", trimmedArgs);
                throw new Error("Incomplete JSON arguments");
              }
              
              args = JSON.parse(trimmedArgs);
              // Handle the function call based on the function name
              switch (response.name) {
                case "location_sms":
                  console.log(
                    "📍 Handling location_sms with content:",
                    args.content
                  );
                  locationSMS(args.content, callerNumber);
                  break;
                case "transfer_call":
                  console.log("🔄 Handling transfer_call");
                  transferCall(callSid);
                  break;
                case "end_call":
                  console.log("📞 Handling end_call with reason:", args.reason);
                  await recordCallEnd("failed"); // No order placed
                  endCall(connection);
                  break;
                case "handle_finish":
                  console.log("✅ Handling handle_finish with data:", args);
                  if (restaurantData && restaurantData.customerData) {
                    customerId = restaurantData.customerData.id;
                  }
                  if (restaurantData && restaurantData.userId && customerId) {
                    handleFinish(
                      args,
                      callerNumber,
                      restaurantData.userId,
                      customerId
                    );
                    await recordCallEnd("completed"); // Order placed successfully
                  } else {
                    console.error(
                      "[OpenAI] Cannot handle finish: restaurant data or customer ID not available"
                    );
                    await recordCallEnd("failed"); // Failed to place order
                  }
                  setTimeout(() => {
                    endCall(connection);
                  }, 7000);
                  break;
                case "delete_order":
                  console.log("🗑️ Handling delete_order");
                  await deleteOrderCall(pendingOrders[0]);
                  break;
                case "update_order":
                  console.log("🔄 Handling update_order with data:", args);
                  if (restaurantData && restaurantData.customerData) {
                    customerId = restaurantData.customerData.id;
                  }
                  if (restaurantData && restaurantData.userId && customerId) {
                    await updateOrderCall(
                      pendingOrders[0],
                      args,
                      callerNumber,
                      restaurantData.userId,
                      customerId
                    );
                    await recordCallEnd("completed"); // Order updated successfully
                  } else {
                    console.error(
                      "[OpenAI] Cannot update order: restaurant data or customer ID not available"
                    );
                    await recordCallEnd("failed"); // Failed to update order
                  }
                  setTimeout(() => {
                    endCall(connection);
                  }, 7000);
                  break;
                case "get_caller_name":
                  console.log("👤 Handling get_caller_name with data:", args);
                  if (restaurantData && restaurantData.userId) {
                    try {
                      const customer = await getCallerName(
                        args.caller_name,
                        callerNumber,
                        restaurantData.userId
                      );
                      customerId = customer?.id || null; // Store the customer ID for use in orders
                      console.log(
                        `[OpenAI] Customer record processed for: ${args.caller_name} (ID: ${customerId})`
                      );
                      // After capturing caller name, inject a short system context to avoid repeating greeting
                      const contextAfterName = {
                        type: "conversation.item.create",
                        item: {
                          type: "message",
                          role: "user",
                          content: [
                            {
                              type: "input_text",
                              text: "[SYSTEM CONTEXT]: You have captured the caller's name. Do not repeat the full initial greeting again. Proceed by asking what they'd like to order or how you can help, referencing the menu if useful.",
                            },
                          ],
                        },
                      };
                      if (openAiWs.readyState === WebSocket.OPEN) {
                        openAiWs.send(JSON.stringify(contextAfterName));
                      } else {
                        console.warn("[WebSocket] Cannot send context after name: WebSocket not open (state:", openAiWs.readyState, ")");
                      }
                    } catch (error) {
                      console.error(
                        `[OpenAI] Error processing caller name: ${error.message}`
                      );
                    }
                  } else {
                    console.error(
                      "[OpenAI] Cannot process caller name: restaurant data not available"
                    );
                  }
                  break;
                default:
                  console.log("❓ Unknown function call:", response.name);
              }
            } catch (e) {
              console.error("❌ Error parsing function call arguments:", e.message);
              console.error("❌ Raw arguments that failed:", response.arguments);
              
              // For handle_finish, we can't proceed without valid arguments
              if (response.name === "handle_finish") {
                console.error("❌ Cannot handle finish without valid order data");
                // Record call as failed since we can't complete the order
                await recordCallEnd("failed");
                setTimeout(() => {
                  endCall(connection);
                }, 3000);
                return;
              }
              
              // For other functions, we might be able to continue
              console.error("❌ Skipping function call due to parsing error");
            }
            // After handling a function call, prompt the model to continue its turn
            try {
              if (openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify({ type: "response.create" }));
              }
            } catch (err) {
              console.error("[OpenAI] Failed to request next response:", err);
            }
          }
        } catch (error) {
          console.error(
            "Error processing OpenAI message:",
            error,
            "Raw message:",
            data
          );
        }
      });

      connection.on("message", async (message) => {
        try {
          const data = JSON.parse(message);

          switch (data.event) {
            case "media":
              latestMediaTimestamp = data.media.timestamp;

              if (openAiWs.readyState === WebSocket.OPEN) {
                const audioAppend = {
                  type: "input_audio_buffer.append",
                  audio: data.media.payload,
                };
                openAiWs.send(JSON.stringify(audioAppend));
              }
              break;
            case "start":
              streamSid = data.start.streamSid;
              callerNumber = data.start.customParameters.caller;
              callSid = data.start.callSid;
              responseStartTimestampTwilio = null;
              latestMediaTimestamp = 0;
              callStartTime = Date.now(); // Record call start time

              // Retrieve restaurant data from server-side cache using CallSid
              try {
                console.log(`[WebSocket] Looking up restaurant data for CallSid: ${callSid}`);
                
                // First try to get from cache
                const cachedData = restaurantDataCache.get(callSid);
                
                if (cachedData) {
                  restaurantData = cachedData;
                  console.log("[WebSocket] Restaurant data loaded from cache:", {
                    restaurantName: restaurantData.restaurant?.restaurant_name,
                    locationsCount: restaurantData.locations?.length,
                    menuCategoriesCount: restaurantData.menuItems?.length,
                    customerName: restaurantData.customerData?.customer_name,
                  });
                } else {
                  console.log(
                    "[WebSocket] No restaurant data in cache, using SampleRestaurantData"
                  );
                  restaurantData = SampleRestaurantData;
                }
              } catch (error) {
                console.error(
                  "[WebSocket] Error retrieving restaurant data from cache, using SampleRestaurantData:",
                  error
                );
                restaurantData = SampleRestaurantData;
              }

              pendingOrders = await getTodayOrdersByPhone(callerNumber);

              // Initialize session with restaurant data
              console.log(`[WebSocket] OpenAI WebSocket state: ${openAiWs.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
              
              if (openAiWs.readyState === WebSocket.OPEN) {
                console.log(`[WebSocket] OpenAI is ready, initializing session in 100ms`);
                setTimeout(() => {
                  initializeSession();
                  // Send previous order context after session is initialized
                  setTimeout(() => {
                    sendPreviousOrderContext(pendingOrders);
                  }, 200);
                }, 100);
              } else {
                console.log(`[WebSocket] OpenAI not ready yet, will initialize when connection opens`);
                // Wait for OpenAI WebSocket to open, then initialize
                const initWhenReady = () => {
                  if (openAiWs.readyState === WebSocket.OPEN) {
                    console.log(`[WebSocket] OpenAI now ready, initializing session`);
                    initializeSession();
                    setTimeout(() => {
                      sendPreviousOrderContext(pendingOrders);
                    }, 200);
                  } else {
                    console.log(`[WebSocket] Still waiting for OpenAI... (state: ${openAiWs.readyState})`);
                    setTimeout(initWhenReady, 100);
                  }
                };
                setTimeout(initWhenReady, 100);
              }
              break;
            case "mark":
              if (markQueue.length > 0) {
                markQueue.shift();
              }
              break;
            case "dtmf":
              // Handle DTMF input - only '0' key press transfers to manager
              if (data.dtmf.digit === "0") {
                console.log("DTMF 0 received, transferring to manager");
                transferCall(callSid);
              }
              break;
            default:
              console.log("Received non-media event:");
              break;
          }
        } catch (error) {
          console.error("Error parsing message:", error, "Message:", message);
        }
      });

      connection.on("close", async () => {
        // Clean up function call buffer
        functionCallBuffer.clear();
        
        // Record call as failed if it ended without completion
        if (callStartTime) {
          await recordCallEnd("failed");
        }
        if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      });

      openAiWs.on("close", () => {
        console.log("[WebSocket] Disconnected from OpenAI Realtime API");
      });

      openAiWs.on("error", (error) => {
        console.error(`[WebSocket] Error: ${error.message}`);
      });
    });
  });
};
