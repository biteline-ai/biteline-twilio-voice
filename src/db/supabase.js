import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import moment from "moment-timezone";

// Load environment variables
dotenv.config();

// Supabase configuration
const { SUPABASE_URL, SUPABASE_KEY } = process.env;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Adds a new order to the Supabase database
 * @param {string} userId - Restaurant user ID
 * @param {string} customerId - Customer ID
 * @param {Array} orderItems - Array of order items with name, price, count
 * @param {number} totalAmount - Total order amount
 * @param {string} orderTime - Order time
 * @param {string} location - Restaurant location
 * @param {string} phone - Customer phone number
 * @returns {Promise<void>}
 */
export async function addOrder(
  userId,
  customerId,
  orderItems,
  totalAmount,
  orderTime,
  location,
  phone
) {
  try {
    // Insert order data into the database
    const { data, error } = await supabase
      .from("orders")
      .insert([
        {
          user_id: userId,
          customer_id: customerId,
          order_items: orderItems, // JSONB array with name, price, count
          total_amount: totalAmount,
          order_time: orderTime,
          location: location,
          phone: phone,
        },
      ])
      .select();

    if (error) {
      console.error(`[Supabase] Error adding order: ${error.message}`);
      throw error;
    }

    const insertedId = data[0]?.id;
    console.log(`[Supabase] Order added successfully. ID: ${insertedId}`);
  } catch (error) {
    console.error(`[Supabase] Unexpected error: ${error.message}`);
    throw error;
  }
}

/**
 * Updates an existing order in the Supabase database
 * @param {object} oldOrder - The existing order object (must include ID)
 * @param {string} userId - Restaurant user ID
 * @param {string} customerId - Customer ID
 * @param {Array} orderItems - Updated order items with name, price, count
 * @param {number} totalAmount - Updated total amount
 * @param {string} orderTime - Updated order time
 * @param {string} location - Updated location
 * @param {string} phone - Customer phone number
 * @returns {Promise<void>}
 */
export async function updateOrder(
  oldOrder,
  userId,
  customerId,
  orderItems,
  totalAmount,
  orderTime,
  location,
  phone
) {
  try {
    const orderId = oldOrder?.id;

    if (!orderId) {
      throw new Error("Invalid order object: missing ID");
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        user_id: userId,
        customer_id: customerId,
        order_items: orderItems, // JSONB array with name, price, count
        total_amount: totalAmount,
        order_time: orderTime,
        location: location,
        phone: phone,
      })
      .eq("id", orderId)
      .select();

    if (error) {
      console.error(
        `[Supabase] Error updating order ID ${orderId}: ${error.message}`
      );
      throw error;
    }

    console.log(`[Supabase] Order updated successfully. ID: ${orderId}`);
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error during update: ${error.message}`
    );
    throw error;
  }
}

/**
 * Deletes an existing order from the Supabase database
 * @param {object} order - The order object to delete (must include ID)
 * @returns {Promise<void>}
 */
export async function deleteOrder(order) {
  try {
    const orderId = order?.id;

    if (!orderId) {
      throw new Error("Invalid order object: missing ID");
    }

    const { error } = await supabase.from("orders").delete().eq("id", orderId);

    if (error) {
      console.error(
        `[Supabase] Error deleting order ID ${orderId}: ${error.message}`
      );
      throw error;
    }

    console.log(`[Supabase] Order deleted successfully. ID: ${orderId}`);
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error during deletion: ${error.message}`
    );
    throw error;
  }
}

/**
 * Fetches all orders placed today
 * @returns {Promise<Array>} - List of today's orders
 */
export async function getTodayOrders() {
  try {
    const startOfDay = moment().utc().startOf("day").toISOString();
    const endOfDay = moment().utc().endOf("day").toISOString();
    // console.log(startOfDay, endOfDay)

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .gte("updated_at", startOfDay)
      .lte("updated_at", endOfDay)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(
        `[Supabase] Error fetching today's orders: ${error.message}`
      );
      throw error;
    }

    return data;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in getTodayOrders: ${error.message}`
    );
    throw error;
  }
}

/**
 * Fetches today's orders for a specific phone number
 * @param {string} phone - Customer's phone number
 * @param {string} timezone - Timezone to use for date calculations (e.g., "America/Chicago")
 * @returns {Promise<Array>} - List of today's orders for this caller
 */
export async function getTodayOrdersByPhone(
  phone,
  timezone = "America/Chicago"
) {
  try {
    console.log(phone);
    const startOfDay = moment
      .tz(timezone)
      .startOf("day")
      .format("YYYY-MM-DDT00:00:00.000[Z]");
    const endOfDay = moment
      .tz(timezone)
      .endOf("day")
      .format("YYYY-MM-DDT23:59:59.999[Z]");
    console.log(startOfDay, endOfDay);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("phone", phone)
      .gte("updated_at", startOfDay)
      .lte("updated_at", endOfDay)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error(
        `[Supabase] Error fetching today's orders for ${phone}: ${error.message}`
      );
      throw error;
    }
    return data;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in getTodayOrdersByPhone: ${error.message}`
    );
    throw error;
  }
}

/**
 * Fetches user_id from ai_phones table by phone number
 * @param {string} phone - Phone number to search for
 * @returns {Promise<string|null>} - User ID or null if not found
 */
export async function getUserIdByPhone(phone) {
  try {
    const { data, error } = await supabase
      .from("ai_phones")
      .select("user_id")
      .eq("phone_number", phone)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        console.log(`[Supabase] No user found for phone: ${phone}`);
        return null;
      }
      console.error(
        `[Supabase] Error fetching user_id for phone ${phone}: ${error.message}`
      );
      throw error;
    }

    console.log(
      `[Supabase] Found user_id: ${data.user_id} for phone: ${phone}`
    );
    return data.user_id;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in getUserIdByPhone: ${error.message}`
    );
    throw error;
  }
}

/**
 * Fetches all restaurants for a specific user_id
 * @param {string} userId - User ID to search for
 * @returns {Promise<Array>} - List of restaurants
 */
export async function getRestaurantsByUserId(userId) {
  try {
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error(
        `[Supabase] Error fetching restaurants for user_id ${userId}: ${error.message}`
      );
      throw error;
    }

    console.log(
      `[Supabase] Found ${data.length} restaurants for user_id: ${userId}`
    );
    return data;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in getRestaurantsByUserId: ${error.message}`
    );
    throw error;
  }
}

/**
 * Fetches all restaurant locations for a specific restaurant_id
 * @param {string} restaurantId - Restaurant ID to search for
 * @returns {Promise<Array>} - List of restaurant locations
 */
export async function getRestaurantLocationsByRestaurantId(restaurantId) {
  try {
    const { data, error } = await supabase
      .from("restaurant_locations")
      .select("*")
      .eq("restaurant_id", restaurantId);

    if (error) {
      console.error(
        `[Supabase] Error fetching restaurant locations for restaurant_id ${restaurantId}: ${error.message}`
      );
      throw error;
    }

    console.log(
      `[Supabase] Found ${data.length} locations for restaurant_id: ${restaurantId}`
    );
    return data;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in getRestaurantLocationsByRestaurantId: ${error.message}`
    );
    throw error;
  }
}

/**
 * Fetches all menu items for a specific restaurant_id
 * @param {string} restaurantId - Restaurant ID to search for
 * @returns {Promise<Array>} - List of menu items
 */
export async function getMenuItemsByRestaurantId(restaurantId) {
  try {
    // 1) Fetch menu categories first (ordered)
    const { data: categories, error: catErr } = await supabase
      .from("menu_categories")
      .select("*")
      .eq("restaurant_id", restaurantId);

    if (catErr) {
      console.error(
        `[Supabase] Error fetching menu categories for restaurant_id ${restaurantId}: ${catErr.message}`
      );
      throw catErr;
    }

    console.log(
      `[Supabase] Found ${categories.length} menu categories for restaurant_id: ${restaurantId}`
    );

    // 2) For each category, fetch its menu items
    const result = await Promise.all(
      categories.map(async (category) => {
        const { data: items, error: itemsErr } = await supabase
          .from("menu_items")
          .select("name, description, price, id, category_id")
          .eq("restaurant_id", restaurantId)
          .eq("category_id", category.id);

        if (itemsErr) {
          console.error(
            `[Supabase] Error fetching items for category ${category.id}: ${itemsErr.message}`
          );
          throw itemsErr;
        }
        return {
          category: category.name || category.category || "",
          items: (items || []).map((it) => ({
            name: it.name,
            description: it.description,
            price: it.price,
          })),
        };
      })
    );

    // Return as array of { category, items: [...] }
    return result;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in getMenuItemsByRestaurantId: ${error.message}`
    );
    throw error;
  }
}

/**
 * Fetches customer name from customers table by user_id and customer_phone
 * @param {string} userId - User ID to search for
 * @param {string} customerPhone - Customer phone number to search for
 * @returns {Promise<string|null>} - Customer name or null if not found
 */
export async function getCustomerNameByUserIdAndPhone(userId, customerPhone) {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", userId)
      .eq("customer_phone", customerPhone)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        console.log(
          `[Supabase] No customer found for user_id: ${userId} and phone: ${customerPhone}`
        );
        return null;
      }
      console.error(
        `[Supabase] Error fetching customer name for user_id ${userId} and phone ${customerPhone}: ${error.message}`
      );
      throw error;
    }

    console.log(
      `[Supabase] Found customer: ${data.customer_name} for user_id: ${userId} and phone: ${customerPhone}`
    );
    return data;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in getCustomerNameByUserIdAndPhone: ${error.message}`
    );
    throw error;
  }
}

/**
 * Adds a new customer to the customers table
 * @param {string} userId - User ID (restaurant owner)
 * @param {string} customerPhone - Customer's phone number
 * @param {string} customerName - Customer's name
 * @returns {Promise<Object>} - The created customer object
 */
export async function addNewCustomer(userId, customerPhone, customerName) {
  try {
    // First check if customer already exists
    const { data: existingCustomer, error: checkError } = await supabase
      .from("customers")
      .select("id, customer_name")
      .eq("user_id", userId)
      .eq("customer_phone", customerPhone)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 means no rows found, which is what we want for new customers
      console.error(
        `[Supabase] Error checking existing customer: ${checkError.message}`
      );
      throw checkError;
    }

    if (existingCustomer) {
      console.log(
        `[Supabase] Customer already exists: ${existingCustomer.customer_name} (${customerPhone})`
      );
      return existingCustomer;
    }

    // Insert new customer
    const { data, error } = await supabase
      .from("customers")
      .insert([
        {
          user_id: userId,
          customer_phone: customerPhone,
          customer_name: customerName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(`[Supabase] Error adding new customer: ${error.message}`);
      throw error;
    }

    console.log(
      `[Supabase] New customer added successfully: ${customerName} (${customerPhone})`
    );
    return data;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in addNewCustomer: ${error.message}`
    );
    throw error;
  }
}

/**
 * Updates an existing customer's name
 * @param {string} customerId - Customer ID
 * @param {string} newName - New customer name
 * @returns {Promise<Object>} - The updated customer object
 */
export async function updateCustomerName(customerId, newName) {
  try {
    const { data, error } = await supabase
      .from("customers")
      .update({
        customer_name: newName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId)
      .select()
      .single();

    if (error) {
      console.error(
        `[Supabase] Error updating customer name for ID ${customerId}: ${error.message}`
      );
      throw error;
    }

    console.log(
      `[Supabase] Customer name updated successfully: ${newName} (ID: ${customerId})`
    );
    return data;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in updateCustomerName: ${error.message}`
    );
    throw error;
  }
}

/**
 * Adds a call record to the calls table
 * @param {string} userId - Restaurant user ID
 * @param {string} customerId - Customer ID (can be null if customer not identified)
 * @param {string} phone - Customer phone number
 * @param {number} duration - Call duration in seconds
 * @param {string} status - Call status ('completed' if order placed, 'failed' if no order)
 * @returns {Promise<Object>} - The created call record
 */
export async function addCallRecord(
  userId,
  customerId,
  phone,
  duration,
  status
) {
  try {
    const { data, error } = await supabase
      .from("calls")
      .insert([
        {
          user_id: userId,
          customer_id: customerId,
          phone: phone,
          duration: duration,
          status: status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(`[Supabase] Error adding call record: ${error.message}`);
      throw error;
    }

    console.log(
      `[Supabase] Call record added successfully: ${status} (${duration}s) for ${phone}`
    );
    return data;
  } catch (error) {
    console.error(
      `[Supabase] Unexpected error in addCallRecord: ${error.message}`
    );
    throw error;
  }
}
