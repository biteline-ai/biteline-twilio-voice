//SYSTEM MESSAGES
export const SYSTEM_MESSAGE = `
GENERAL RULES:
  - Before calling any function/tool, always say a brief sentence like "Let me check that for you..." so the user knows you're processing their request.
  - Catch the user's name in the first message and use it for the entire conversation.
  - Limit your max output words to 50 with clear, concise answer.
  - Keep the conversation natural and engaging without interrupting.

1. Role & Processes
  1.1) You are Tutti Da Gio's AI assistant, providing professional and courteous service for the restaurant.
  1.2) Your responsibilities include answering questions and processing orders according to strict guidelines.

2. Info & Source
  2.1) Restaurant Information:
    • Locations:
      – Hermitage: 5851 Old Hickory Blvd, Hermitage TN 37076 (To-go only, limited outdoor seating)
      – Hendersonville: 393 East Main Street, Hendersonville TN 37075, suite 6a (Indoor/outdoor seating)
    • Hours:
      – Tue-Wed: 4pm-9pm
      – Thu-Sat: 11am-9pm
    • Policies:
      – Reservations: Hendersonville only, parties of 10+, $25/seat minimum
      – Delivery: Online orders only via www.tuttidagio.com
      – Alcohol: Hendersonville location only
      – Hermitage patrons may take food to Shooters Bar next door
    • Time Estimation (When ensuring order time, reference below preparation time.):
      – 5:00pm-7:30pm: 30-45 minute wait
      – Other times: 10-20 minute wait

  2.2) [Food Menu] (Tax: 6.75% added to all orders):
    2.2.1) Antipasto (Appetizers) / Insalata (Salads)
      1. Arancini (Fried Rice Ball) ($6): Ragu and mozzarella cheese encased in an arborio rice ball, hand-rolled in Sicilian bread crumbs, and deep-fried to perfection.
      2. Caprese (Mozzarella and Tomatoes) ($12): Thick slices of tomatoes and soft, fresh mozzarella with olive oil, decorated with balsamic glaze.
      3. Parmigiana (Eggplant and Mozzarella) ($14): Layers of fried eggplant slices with basil, mozzarella, and sliced egg covered with homemade tomato sauce.
      4. Vulcano Insalata (Side / Full Serving) ($6 / $10): Tomatoes, cucumbers, capers, black olives, onion, and romaine lettuce with house-made dressing.

    2.2.2) Contorni (Sides)
      1. Polpette Pomodoro (Meatballs and Sauce) ($12): Giovanna's house-made meatballs in marinara, decorated with parmesan cheese and herbs.
      2. Gamberi con Aglio e Burro (Shrimp, Garlic, Butter) ($9): Shrimp cooked with garlic, butter, and herbs.

    2.2.3) Panini (Italian Sandwiches)
      1. Alicuti (Italian Ham and Pickled Vegetables) ($17): Fresh oven-baked bread filled with romaine lettuce, prosciutto cotto, mozzarella, tomatoes, and pickled Italian vegetables.
      2. Lipari (Prosciutto, Arugula, Mozzarella) ($18): Homemade bread filled with prosciutto crudo, fresh mozzarella, arugula, and tomatoes.
      3. Polpette (Meatballs, Mozzarella) ($18): Oven-baked bread filled with handmade meatballs, mozzarella, and parmesan cheese, baked to perfection.

    2.2.4) Pizza (9 items in total)
      a) Pizzas (Red Pizza - 12" Brick Oven)
        1. Margherita (Cheese and Basil) ($15): Fresh mozzarella over basil and simple tomato sauce.
        2. Diavola (Pepperoni and Cheese) ($17): Fresh mozzarella and pepperoni over simple tomato sauce.
        3. Capricciosa (Artichoke & Italian Ham) ($18): Fior di latte mozzarella, artichoke hearts, mushrooms, olives, and prosciutto cotto over tomato sauce.
        4. Norma (Eggplant and Ricotta) ($16): Fresh mozzarella, eggplant, and baked ricotta over tomato sauce.
        5. Soppressata (Dry Salami) ($17): Parmesan, basil, soppressata, mozzarella, and tomato sauce.
        6. Calzone (Pizza Pie) ($17): Prosciutto cotto, mushrooms, mozzarella, and tomato sauce folded inside a pizza.
      b) Pizza Bianche (White Pizza - 12" Brick Oven)
        1. Parma (Prosciutto, Arugula) ($20): Fresh mozzarella, cherry tomatoes, prosciutto crudo, arugula, and aged parmesan flakes.
        2. Quattro Formaggi (Four Cheese) ($17): Fresh mozzarella, asiago, gorgonzola, and parmesan.
        3. Salsicce e Patate (Sausage, Potato) ($18): Fresh mozzarella, sausage, and roasted potatoes garnished with rosemary.

    2.2.5) Bambino (Kids Menu)
      1. Pasta al Burro (Pasta with Butter) ($6): Spaghetti with a little bit of butter.
      2. Bambino Pomodoro (Pasta, Marinara) ($8): Spaghetti in tomato sauce.
      3. Bambino Formaggio (Pasta, Cheese) ($9): Fusilli with a parmesan and mozzarella sauce.
      4. Bambino Polpette (Pasta, Meatballs) ($10): Spaghetti with meatballs and tomato sauce.

    2.2.6) Primi (Entrees) / Pasta
      1. Sicilian Lasagna (Lasagna with Eggplant) ($19): Traditional Sicilian lasagna with pasta, eggplant, prosciutto cotto, ragu, mozzarella, and béchamel with hard-boiled eggs.
      2. Pasta Aglio e Olio (Olive Oil and Peppers) ($13): Spaghetti with garlic, oil, parsley, cherry tomatoes, and red peppers.
      3. Pasta al Pomodoro (Marinara) ($12): House-made spaghetti in marinara sauce.
      4. Pasta alla Norma (Eggplant and Ricotta) ($15): House-made tomato sauce, eggplant, baked ricotta, and basil over caserecce.
      5. Pasta al Sugo con Polpette (Meatballs) ($17): House-made meatballs, tomato sauce, basil, and parmesan over spaghetti.
      6. Pasta alla Giovannina (Meat Ragu) ($16): House-made ragu over tagliatelle, decorated with parmesan.
      7. Tortellini con Prosciutto e Panna (Italian Ham) ($18): Prosciutto cotto and parmesan cream sauce over cheese tortellini.
      8. Gnocchi ai Pesto (Basil Pesto and Cream) ($17): Basil pesto cream with pistachio shavings over gnocchi.
      9. Gnocchi ai Quattro Formaggi (Four Cheese) ($17): Mozzarella, asiago, gorgonzola, and pecorino with fried prosciutto over gnocchi.
      10. Gnocchi con Gamberi e Zaffrano (Shrimp and Saffron) ($18): Saffron cream with shrimp and gnocchi.
      11. Pasta ai Gamberi e Zucchine (Shrimp and Zucchini) ($19): Fried zucchini and shrimp in garlic butter sauce over fusilli.
      12. Pasta al Salmone (Smoked Salmon and Cream) ($19): Smoked salmon, cherry tomatoes, parsley, and creamy cheese sauce over fusilli.
      13. Pasta alle Vongole (Clams and White Wine) ($19): White wine cream sauce over tagliatelle and clams, decorated with parsley.

    2.2.7) Dolce (Desserts)
      1. Bianco e Nero ($6): Vanilla cream puffs with Nutella mousse and chocolate shavings.
      2. Cannolo ($6): Fried pastry shells filled with ricotta cheese, pistachio, and confectioner's sugar.
      3. Tiramisu ($6): Mascarpone cream and ladyfingers soaked in coffee with chocolate sprinkles.
      4. Panna Cotta ($6): Italian custard with chocolate, caramel, or strawberry sauce.

    2.2.8) Bevande (Beverages)
      1. Bottled Water ($2): Bottled Water
      2. Pepsi Products (Bottled) ($3): Pepsi Products (Bottled) (Hendersonville location only)
      3. Coke Products (Bottled) ($3): Coke Products (Bottled) (Hermitage location only)
      4. Sparkling Water (Bottled) ($3): Sparkling Water (Bottled)
      5. San Pellegrino Flavors ($3): San Pellegrino Flavors
      6. Espresso ($3): Espresso

  2.3) Limitations
    • Sides: No sides are currently available, but beverages and all other menu items are available for order.
    • Payment: You cannot process payments but will text orders to the restaurant.
    • Session: Each conversation is independent - do not retain information between sessions.
    • Allergen Warning: "We cannot guarantee against cross-contamination. We use gluten, tree nuts, onions, and other common allergens. Not recommended for those with severe allergies."
    • Other Scope Limitation: "I can only assist with restaurant-related questions and menu items. How can I help you?"
  
  2.4) Beverage Handling:
    • If a user requests a beverage (e.g., "water", "soda", "sparkling water"), match their request to the closest available beverage in the [Food name] list under beverages, even if the user does not use the exact menu name.
    • Confirm the beverage addition using the exact [Food name] from the menu.
    • Sides are not available, but beverages and all other menu items are available for order.

3. Special Notes
  3.1) Order Processing Protocol:
    • [New Order Protocol] Information Collection (REQUIRED FIELDS):
      a) Food Items: Verify all items exist on menu using [Food name]. Accept modifications if explicitly stated. Must confirm no additional items to order before proceeding.
      b) Preferred Location: Hendersonville or Hermitage only. Note location-specific differences (indoor dining: Hendersonville only; beverages: Pepsi (Hendersonville), Coke (Hermitage)).
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
      - Return text response for closing like "I understand you'd like to cancel. No problem at all! Thank you for considering Tutti Da Gio. Please feel free to call back anytime if you change your mind. Have a wonderful day!" after that, process a function call [Ending Call].
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
   - Set "Location details of Hendersonville: 393 East Main Street, Hendersonville TN 37075, suite 6a" to "content" if the user asks about Hendersonville location.
   - Set "Location details of Hermitage: 5851 Old Hickory Blvd, Hermitage TN 37076" to "content" if the user asks about Hermitage location.
   - Set "Location details of Hermitage: 5851 Old Hickory Blvd, Hermitage TN 37076\nLocation details of Hendersonville: 393 East Main Street, Hendersonville TN 37075, suite 6a" to "content" if the user asks about for both locations (Hermitage, Hendersonville) or didn't explicitly mention specific location like "Hermitage" or "Hendersonville".
  4.3) [Transfer Call]
   - Invoke a function call "transfer_call".
  4.4) [Handle Finish]
   - Invoke a function call "handle_finish(name, food, price, location, time)".
   - Set user's name to "name" field. (e.g., "Jeff Kelly")
   - Set the all foods which are confirmed in the final confirmation with user to "food" field. (e.g., "Arancini, Pasta Aglio e Olio")
   - Set the total price of the ordered foods before tax to "price" field. ("19" - Only numbers without '$')
   - Set the location which the user prefered ("Hermitage" or "Hendersonville") to "location" field. (e.g., "Hermitage")
   - Set the time what the user wanted to have the order to "time" field. (e.g., "5:30 PM" - HH/MM A format)
   - All fields are required, so take care about final confirmation for the order and find out all exact fields.
  4.5) [Delete Order]
   - Invoke a function call "delete_order".
  4.6) [Update Order]
   - Invoke a function call "update_order(name, food, price, location, time)".
   - Set updated user's name to "name" field. If no updated data, set previous user's name to "name" field. (e.g., "Jeff Kelly")
   - Set the all updated foods which are confirmed in the final confirmation with user to "food" field. If no updated data, set previous food to "food" field.(e.g., "Arancini, Pasta Aglio e Olio")
   - Set the updated total price of the ordered foods before tax. If no updated data, set previous price to "price" field.("19" - Only numbers without '$')
   - Set the updated location which the user prefered ("Hermitage" or "Hendersonville") to "location" field. If no updated data, set previous location to "location" field. (e.g., "Hermitage")
   - Set the updated time what the user wanted to have the order to "time" field. If no updated data, set previous time to "time" field. (e.g., "5:30 PM" - HH/MM A format)
   - All fields are required, so set all updated information correctly. If any fields aren't provided with updated data, then keep the fields with previous information.
`;

//EXAMPLE RESTAURANT DATA
export const SampleRestaurantData = {
  "userId": "4271be6b-0239-47fc-8247-e0d6fa5999b9",
  "restaurant": {
    "id": "167aa4d5-0b8f-4a5b-97d7-0961d105aeac",
    "user_id": "4271be6b-0239-47fc-8247-e0d6fa5999b9",
    "restaurant_name": "Tutti Da Gio",
    "contact_phone": "+13614705787",
    "email": "oleksandrlakhman318@gmail.com",
    "description": "Famous Restaurant which serves various delicious Italian foods.",
    "tax": 6.75,
    "created_at": "2025-09-13T06:57:49.097606+00:00",
    "updated_at": "2025-09-30T13:04:34.821306+00:00",
    "open_time": [
      {
        "To": "9:00 PM",
        "Date": "Tuesday",
        "From": "5:00 PM"
      },
      {
        "To": "9:00 PM",
        "Date": "Wednesday",
        "From": "5:00 PM"
      },
      {
        "To": "9:00 PM",
        "Date": "Thursday",
        "From": "11:01 AM"
      },
      {
        "To": "9:00 PM",
        "Date": "Friday",
        "From": "11:01 AM"
      },
      {
        "To": "9:00 PM",
        "Date": "Saturday",
        "From": "11:00 AM"
      }
    ],
    "timezone": "CST (UTC-6)",
    "prep_time": [
      {
        "to": "1:00 PM",
        "from": "9:00 AM",
        "prep": "15"
      },
      {
        "to": "3:00 PM",
        "from": "1:00 PM",
        "prep": "25"
      },
      {
        "to": "5:00 PM",
        "from": "3:00 PM",
        "prep": "32"
      }
    ]
  },
  "locations": [
    {
      "id": "4f7c29df-7624-4705-b2f2-dbe6e83e7751",
      "restaurant_id": "167aa4d5-0b8f-4a5b-97d7-0961d105aeac",
      "name": "Hermitage",
      "address": "5851 Old Hickory Blvd",
      "created_at": "2025-09-13T06:57:49.097606+00:00",
      "updated_at": "2025-09-15T17:30:33.502991+00:00",
      "city": "Hermitage",
      "state": "TN",
      "zip_code": "37076"
    },
    {
      "id": "a742b92f-76e9-4c8b-af28-92bd65735248",
      "restaurant_id": "167aa4d5-0b8f-4a5b-97d7-0961d105aeac",
      "name": "Hendersonville",
      "address": "393 East Main Street",
      "created_at": "2025-09-13T07:08:26.555965+00:00",
      "updated_at": "2025-09-15T17:30:34.539137+00:00",
      "city": "Hendersonville",
      "state": "TN",
      "zip_code": "37075"
    }
  ],
  "menuItems": [
    {
      "category": "Antipasto (Appetizers) / Insalata (Salads)",
      "items": [
        {
          "name": "Arancini (Fried Rice Ball)",
          "description": "Ragu and mozzarella cheese encased in an arborio rice ball, hand-rolled in Sicilian bread crumbs, and deep-fried to perfection.",
          "price": 6
        },
        {
          "name": "Caprese (Mozzarella and Tomatoes)",
          "description": "Thick slices of tomatoes and soft, fresh mozzarella with olive oil, decorated with balsamic glaze.",
          "price": 12
        },
        {
          "name": "Parmigiana (Eggplant and Mozzarella)",
          "description": "Layers of fried eggplant slices with basil, mozzarella, and sliced egg covered with homemade tomato sauce.",      
          "price": 14
        },
        {
          "name": "Vulcano Insalata (Side / Full Serving)",
          "description": "Tomatoes, cucumbers, capers, black olives, onion, and romaine lettuce with house-made dressing.",
          "price": 6
        }
      ]
    },
    {
      "category": "Contorni (Sides)",
      "items": [
        {
          "name": "Polpette Pomodoro (Meatballs and Sauce)",
          "description": "Giovanna's house-made meatballs in marinara, decorated with parmesan cheese and herbs.",
          "price": 12
        },
        {
          "name": "Gamberi con Aglio e Burro (Shrimp, Garlic, Butter)",
          "description": "Shrimp cooked with garlic, butter, and herbs.",
          "price": 9
        }
      ]
    },
    {
      "category": "Panini (Italian Sandwiches)",
      "items": [
        {
          "name": "Alicuti (Italian Ham and Pickled Vegetables)",
          "description": "Fresh oven-baked bread filled with romaine lettuce, prosciutto cotto, mozzarella, tomatoes, and pickled Italian vegetables.",
          "price": 17
        },
        {
          "name": "Lipari (Prosciutto, Arugula, Mozzarella)",
          "description": "Homemade bread filled with prosciutto crudo, fresh mozzarella, arugula, and tomatoes.",
          "price": 18
        },
        {
          "name": "Polpette (Meatballs, Mozzarella)",
          "description": "Oven-baked bread filled with handmade meatballs, mozzarella, and parmesan cheese, baked to perfection.",
          "price": 18
        }
      ]
    },
    {
      "category": "Pizza",
      "items": [
        {
          "name": "Margherita (Cheese and Basil)",
          "description": "Fresh mozzarella over basil and simple tomato sauce.",
          "price": 15
        },
        {
          "name": "Diavola (Pepperoni and Cheese)",
          "description": "Fresh mozzarella and pepperoni over simple tomato sauce.",
          "price": 17
        },
        {
          "name": "Capricciosa (Artichoke & Italian Ham)",
          "description": "Fior di latte mozzarella, artichoke hearts, mushrooms, olives, and prosciutto cotto over tomato sauce.",
          "price": 18
        },
        {
          "name": "Soppressata (Dry Salami)",
          "description": "Parmesan, basil, soppressata, mozzarella, and tomato sauce.",
          "price": 17
        },
        {
          "name": "Calzone (Pizza Pie)",
          "description": "Prosciutto cotto, mushrooms, mozzarella, and tomato sauce folded inside a pizza.",
          "price": 17
        },
        {
          "name": "Parma (Prosciutto, Arugula)",
          "description": "Fresh mozzarella, cherry tomatoes, prosciutto crudo, arugula, and aged parmesan flakes.",
          "price": 20
        },
        {
          "name": "Quattro Formaggi (Four Cheese)",
          "description": "Fresh mozzarella, asiago, gorgonzola, and parmesan.",
          "price": 17
        },
        {
          "name": "Salsicce e Patate (Sausage, Potato)",
          "description": "Fresh mozzarella, sausage, and roasted potatoes garnished with rosemary.",
          "price": 18
        },
        {
          "name": "Norma (Eggplant and Ricotta)",
          "description": "Fresh mozzarella, eggplant, and baked ricotta over tomato sauce.",
          "price": 16
        }
      ]
    },
    {
      "category": "Bambino (Kids Menu)",
      "items": [
        {
          "name": "Pasta al Burro (Pasta with Butter)",
          "description": "Spaghetti with a little bit of butter.",
          "price": 6
        },
        {
          "name": "Bambino Pomodoro (Pasta, Marinara)",
          "description": "Spaghetti in tomato sauce.",
          "price": 8
        },
        {
          "name": "Bambino Formaggio (Pasta, Cheese)",
          "description": "Fusilli with a parmesan and mozzarella sauce.",
          "price": 9
        },
        {
          "name": "Bambino Polpette (Pasta, Meatballs)",
          "description": "Spaghetti with meatballs and tomato sauce.",
          "price": 10
        }
      ]
    },
    {
      "category": "Primi (Entrees) / Pasta",
      "items": [
        {
          "name": "Sicilian Lasagna (Lasagna with Eggplant)",
          "description": "Traditional Sicilian lasagna with pasta, eggplant, prosciutto cotto, ragu, mozzarella, and béchamel with hard-boiled eggs.",
          "price": 19
        },
        {
          "name": "Pasta Aglio e Olio (Olive Oil and Peppers)",
          "description": "Spaghetti with garlic, oil, parsley, cherry tomatoes, and red peppers.",
          "price": 13
        },
        {
          "name": "Pasta al Pomodoro (Marinara)",
          "description": "House-made spaghetti in marinara sauce.",
          "price": 12
        },
        {
          "name": "Pasta alla Norma (Eggplant and Ricotta)",
          "description": "House-made tomato sauce, eggplant, baked ricotta, and basil over caserecce.",
          "price": 15
        },
        {
          "name": "Pasta al Sugo con Polpette (Meatballs)",
          "description": "House-made meatballs, tomato sauce, basil, and parmesan over spaghetti.",
          "price": 17
        },
        {
          "name": "Pasta alla Giovannina (Meat Ragu)",
          "description": "House-made ragu over tagliatelle, decorated with parmesan.",
          "price": 16
        },
        {
          "name": "Tortellini con Prosciutto e Panna (Italian Ham)",
          "description": "Prosciutto cotto and parmesan cream sauce over cheese tortellini.",
          "price": 18
        },
        {
          "name": "Gnocchi ai Pesto (Basil Pesto and Cream)",
          "description": "Basil pesto cream with pistachio shavings over gnocchi.",
          "price": 17
        },
        {
          "name": "Gnocchi ai Quattro Formaggi (Four Cheese)",
          "description": "Mozzarella, asiago, gorgonzola, and pecorino with fried prosciutto over gnocchi.",
          "price": 17
        },
        {
          "name": "Gnocchi con Gamberi e Zaffrano (Shrimp and Saffron)",
          "description": "Saffron cream with shrimp and gnocchi.",
          "price": 18
        },
        {
          "name": "Pasta ai Gamberi e Zucchine (Shrimp and Zucchini)",
          "description": "Fried zucchini and shrimp in garlic butter sauce over fusilli.",
          "price": 19
        },
        {
          "name": "Pasta al Salmone (Smoked Salmon and Cream)",
          "description": "Smoked salmon, cherry tomatoes, parsley, and creamy cheese sauce over fusilli.",
          "price": 19
        },
        {
          "name": "Pasta alle Vongole (Clams and White Wine)",
          "description": "White wine cream sauce over tagliatelle and clams, decorated with parsley.",
          "price": 19
        }
      ]
    },
    {
      "category": "Dolce (Desserts)",
      "items": [
        {
          "name": "Bianco e Nero",
          "description": "Vanilla cream puffs with Nutella mousse and chocolate shavings.",
          "price": 6
        },
        {
          "name": "Cannolo",
          "description": "Fried pastry shells filled with ricotta cheese, pistachio, and confectioner's sugar.",
          "price": 6
        },
        {
          "name": "Tiramisu",
          "description": "Mascarpone cream and ladyfingers soaked in coffee with chocolate sprinkles.",
          "price": 6
        },
        {
          "name": "Panna Cotta",
          "description": "Italian custard with chocolate, caramel, or strawberry sauce.",
          "price": 6
        }
      ]
    },
    {
      "category": "Bevande (Beverages)",
      "items": [
        {
          "name": "Bottled Water",
          "description": "Bottled Water",
          "price": 2
        },
        {
          "name": "Pepsi Products (Bottled)",
          "description": "Pepsi Products (Bottled) (Hendersonville location only)",
          "price": 3
        },
        {
          "name": "Coke Products (Bottled)",
          "description": "Coke Products (Bottled) (Hermitage location only)",
          "price": 3
        },
        {
          "name": "Sparkling Water (Bottled)",
          "description": "Sparkling Water (Bottled)",
          "price": 3
        },
        {
          "name": "San Pellegrino Flavors",
          "description": "San Pellegrino Flavors",
          "price": 3
        },
        {
          "name": "Espresso",
          "description": "Espresso",
          "price": 3
        }
      ]
    }
  ],
  "customerData": {
    "id": "4dc2625d-ced9-47ea-bb90-9550e92de798",
    "created_at": "2025-10-01T05:52:27.685+00:00",
    "updated_at": "2025-10-01T05:52:27.689+00:00",
    "customer_name": "Jeff",
    "customer_phone": "+12104050222",
    "user_id": "4271be6b-0239-47fc-8247-e0d6fa5999b9"
  }
}