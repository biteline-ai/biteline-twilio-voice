export const functionTools = [
  {
    type: "function",
    name: "end_call",
    description:
      "End the current phone call when the user wants to hang up or the conversation is complete",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "The reason for ending the call",
        },
      },
      required: ["reason"],
    },
  },
  {
    type: "function",
    name: "location_sms",
    description:
      "Send SMS if the user asks about specific locations of the restaurant.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Detailed Information about restaurant location",
        },
      },
      required: ["content"],
    },
  },
  {
    type: "function",
    name: "transfer_call",
    description:
      "Transfer the call to the manager if the user wants to speak with human, not AI assistant.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "handle_finish",
    description:
      "After the conversation finishes by getting all relevant information for an order, end the call and send SMS messages for both user and manager.",
    parameters: {
      type: "object",
      properties: {
        customer_name: {
          type: "string",
          description: "Customer name who is ordering in the call.",
        },
        order_items: {
          type: "array",
          description:
            "Array of ordered items with name, price, and count for each item.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Name of the food item",
              },
              price: {
                type: "number",
                description: "Price of the individual item",
              },
              count: {
                type: "number",
                description: "Quantity of this item ordered",
              },
            },
            required: ["name", "price", "count"],
          },
        },
        total_amount: {
          type: "number",
          description: "Total amount of the order before tax.",
        },
        location: {
          type: "string",
          description: "Restaurant location where the order will be picked up.",
        },
        order_time: {
          type: "string",
          description: "Time when the customer wants to pick up the order.",
        },
      },
      required: [
        "customer_name",
        "order_items",
        "total_amount",
        "location",
        "order_time",
      ],
    },
  },
  {
    type: "function",
    name: "delete_order",
    description:
      "If the user wants to delete or cancel previous pending order, delete previous pending order from supabase.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "update_order",
    description:
      "Update an existing order with new information after the conversation finishes.",
    parameters: {
      type: "object",
      properties: {
        customer_name: {
          type: "string",
          description: "Updated customer name for the order.",
        },
        order_items: {
          type: "array",
          description:
            "Updated array of ordered items with name, price, and count for each item.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Name of the food item",
              },
              price: {
                type: "number",
                description: "Price of the individual item",
              },
              count: {
                type: "number",
                description: "Quantity of this item ordered",
              },
            },
            required: ["name", "price", "count"],
          },
        },
        total_amount: {
          type: "number",
          description: "Updated total amount of the order before tax.",
        },
        location: {
          type: "string",
          description:
            "Updated restaurant location where the order will be picked up.",
        },
        order_time: {
          type: "string",
          description:
            "Updated time when the customer wants to pick up the order.",
        },
      },
      required: [
        "customer_name",
        "order_items",
        "total_amount",
        "location",
        "order_time",
      ],
    },
  },
  {
    type: "function",
    name: "get_caller_name",
    description:
      "Get the caller's name when they provide it during the conversation. This will be used to create a new customer record if they are a new caller.",
    parameters: {
      type: "object",
      properties: {
        caller_name: {
          type: "string",
          description:
            "The caller's name as they provided it during the conversation.",
        },
      },
      required: ["caller_name"],
    },
  },
];
