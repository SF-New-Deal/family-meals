const {
    fallthrough,
    send_msg,
    send_multiple_msgs,
    split_on_newline,
    format_string,
    get_text,
    send_translated_msg,
    set_user_fields,
    set_phase,
    reset_user,
    get_family_record,
    over_limit,
    get_restaurants,
    get_restaurant_by_name,
    get_restaurants_by_hood,
    finish_order,
    unenrolled_check,
    redemption_check,
    save_order_log,
    getHoods
} = require('./helpers');

async function handle(phone_number, incoming_msg, event) {
    if(incoming_msg.toString().toLowerCase()== "help") {
        return send_msg(null);
    }
    let user_record = await get_family_record(phone_number);

    if (!user_record || user_record.get("Waitlist") ) {
        return send_translated_msg("English", "No Number Found");
    }

    let unenrolledResult = await unenrolled_check(user_record);
    if (unenrolledResult) return unenrolledResult;

    let redemptionResult = await redemption_check(user_record);
    if (redemptionResult) return redemptionResult;

    let familyId = user_record.get("Family ID");
    let phase = user_record.get("Phase") || 0;

    // Check for 30-minute reset
    let current_time = Math.floor(Date.now()/60000);
    let start_time = user_record.get("Start");
    if (current_time - start_time > 30) {
        phase = 0;
        await reset_user(user_record);
    }

    let vouchers_remaining = user_record.get("Vouchers Remaining");
    let language = user_record.get("Language")
    let renewal_date = user_record.get("Friendly Renewal Date")

    // HARD-CODED RESET WORDS
    let reset_words = ["reset", "إعادة التشغيل", "重置", "重新開始", "reiniciar"];

    console.log(String(incoming_msg));
    if (reset_words.includes(String(incoming_msg).toLowerCase()) || reset_words.includes(String(incoming_msg))) {
        phase = 0;
        await reset_user(user_record)
    }

    // **********************************************
    // Phase 0 signals new interaction
    if (phase == 0 || null) {
        if (vouchers_remaining <= 0 || null) {
            return await over_limit(language, renewal_date);
        }

        let time_stamp = Math.floor(Date.now()/60000);
        await set_user_fields(user_record, {"Start": time_stamp});
        let text = (vouchers_remaining == 1) ? "Number of Meals 1" : "Number of Meals Multiple";
        let template = await get_text(text, language);
        let formatted = format_string(template, {
            MEALS: vouchers_remaining,
            DATE: renewal_date,
            FAMILYID: familyId
        });
        await set_phase(user_record, 1);
        return send_msg(formatted);
    }

    // **********************************************
    // Phase 1 Assumption: User is sending in number of meals
    if (phase == 1) {
        let requested_meals = parseInt(incoming_msg);
        if (isNaN(requested_meals)) {
            let text = await get_text("Invalid Meal Number", language);
            return send_msg(text);
        }

        await set_user_fields(user_record, { "Requested Meals": requested_meals });

        if (requested_meals == 0) {
            await set_phase(user_record, 0);
            return send_translated_msg(language, "0 Requested");
        }

        // Check for request greater than remaining and reroute
        if (requested_meals > vouchers_remaining) {
            let template = await get_text("Requested > Remaining", language);
            let formatted = format_string(template, {
                REQUESTED: requested_meals,
                REMAINING: vouchers_remaining,
                DATE: renewal_date
            });
            return send_msg(formatted);
        }

        let restaurants = await get_restaurants();

        // Reroute for no restos open
        if (!restaurants.length) {
            let text = await get_text("No Restaurants Open", language);
            await set_phase(user_record, 0);
            return send_msg(text);
        }

        // Message 1: Header (1/2)
        let select_hood_header = await get_text("Select Hood", language);

        // Message 2+: List of neighborhoods (2/2)
        // Build list items without repeating prefix/footer
        let n = 0;
        let hoods = await getHoods(restaurants);
        await set_user_fields(user_record, {"Neighborhoods Array": hoods.toString()})

        let hood_list = "(2/2) ";
        hoods.forEach(function (h) {
            n++;
            hood_list += `Text "${n}" for ${h}\n\n`;
        });
        hood_list += 'To start over text "RESET".';

        await set_phase(user_record, 2);
        let messages = [select_hood_header];
        let list_chunks = split_on_newline(hood_list.trim());
        messages = messages.concat(list_chunks);
        return send_multiple_msgs(messages);
    }

    // **********************************************
    // Phase 2: Incoming msg is neighborhood selection
    if (phase == 2) {
        // Retreive previous list of neighborhoods
        let h = user_record.get("Neighborhoods Array");
        let hood_arr = h.split(',')

        let neighborhood_choice = parseInt(incoming_msg);
        await set_user_fields(user_record, {"neighborhood_choice": neighborhood_choice})

        // Check for if value is NaN
        if (isNaN(neighborhood_choice)) {
            let text = await get_text("Invalid Choice", language);
            return send_msg(text);
        }

        // Check if too high of a number was input
        if (neighborhood_choice > hood_arr.length || neighborhood_choice == 0) {
            return fallthrough(language);
        }

        let n = hood_arr[neighborhood_choice - 1];

        await set_user_fields(user_record, {"Neighborhood Choice": n});
        let restaurants = await get_restaurants_by_hood(n);

        // Message 1: Header (1/2)
        let resto_header = await get_text("Select Restaurant", language);

        // Message 2+: List of restaurants (2/2)
        // Build list items without repeating prefix/footer
        n = 0;
        let resto_arr=[];
        let resto_list = "(2/2) ";

        restaurants.forEach(function (r) {
            n++;
            let r_name = r.get("DBA Name");
            resto_arr.push(r_name);
            resto_list += `Text "${n}" for ${r_name} (${r.get("Cuisine Type")}): ${r.get("Texting Script Address")} ${r.get("Open")} - ${r.get("Close")}\n\n`;
        });
        resto_list += 'To start over text "RESET". To select a different neighborhood text "BACK".';

        await set_phase(user_record, 3);
        await set_user_fields(user_record, {"Restaurants Array": resto_arr.toString()});
        let messages = [resto_header];
        let list_chunks = split_on_newline(resto_list.trim());
        messages = messages.concat(list_chunks);
        return send_multiple_msgs(messages);
    }

    // **********************************************
    // Phase 3: Incoming msg is restaurant selection
    if (phase == 3) {
        // Check to see if user wants to go back
        let back_words = ["back", "رجع", "atrás", "atras", "返回", "Quay lại"];
        if (back_words.includes(String(incoming_msg).toLowerCase()) || back_words.includes(String(incoming_msg))) {

            // Send to "phase 1 logic"
            let restaurants = await get_restaurants();

            // Reroute for no restos open
            if (!restaurants.length) {
                let text = await get_text("No Restaurants Open", language);
                await set_phase(user_record, 0);
                return send_msg(text);
            }

            // Message 1: Header (1/2)
            let select_hood_header = await get_text("Select Hood", language);

            // Message 2+: List of neighborhoods (2/2)
            // Build list items without repeating prefix/footer
            let n = 0;
            let hoods = await getHoods(restaurants);
            await set_user_fields(user_record, {"Neighborhoods Array": hoods.toString()})

            let hood_list = "(2/2) ";
            hoods.forEach(function (h) {
                n++;
                hood_list += `Text "${n}" for ${h}\n\n`;
            });
            hood_list += 'To start over text "RESET".';

            await set_phase(user_record, 2);
            let messages = [select_hood_header];
            let list_chunks = split_on_newline(hood_list.trim());
            messages = messages.concat(list_chunks);
            return send_multiple_msgs(messages);
        }

        let arr = user_record.get("Restaurants Array");
        let restaurants = arr.split(",");
        let restaurant_choice = parseInt(incoming_msg);

        // Check for if value is NaN
        if (isNaN(restaurant_choice)) {
            let text = await get_text("Invalid Choice", language);
            return send_msg(text);
        }

        // Check if too high of a number was input
        if (restaurant_choice > restaurants.length || restaurant_choice == 0) {
            return fallthrough(language);
        }

        let r_txt = restaurants[restaurant_choice-1];
        let r = await get_restaurant_by_name(r_txt);

        let r_name = r.get("DBA Name");
        let menu_item_1 = r.get(`Menu Item #1 ${language}`);
        let menu_item_2 = r.get(`Menu Item #2 ${language}`);
        let menu_item_3 = r.get(`Menu Item #3 ${language}`);
        let menu_item_4 = r.get(`Menu Item #4 ${language}`);
        await set_user_fields(
            user_record, {
                "Restaurant Choice": r_name,
                "Menu Item #1": menu_item_1,
                "Menu Item #2": menu_item_2,
                "Menu Item #3": menu_item_3,
                "Menu Item #4": menu_item_4,
            }
        );

        let requested_meals = user_record.get("Requested Meals");
        let restriction = user_record.get("Dietary Restriction");

        let messages = [];

        // Message 1 (1/4): Dietary restrictions (if applicable)
        if (restriction) {
            let restrictions_template = await get_text("Restrictions", language);
            let msg1 = format_string(restrictions_template, { RESTRICTION: restriction });
            messages.push(msg1);
        }

        // Message 2 (2/4): Menu items 1-2
        let menu_items_1_2_template = await get_text("Display Menu (Items 1-2)", language);
        let msg2 = format_string(menu_items_1_2_template, {
            RESTAURANT: r_name,
            ONE: menu_item_1,
            TWO: menu_item_2
        });
        messages.push(msg2);

        // Message 3 (3/4): Menu items 3-4
        let menu_items_3_4_template = await get_text("Display Menu (Items 3-4)", language);
        let msg3 = format_string(menu_items_3_4_template, {
            THREE: menu_item_3,
            FOUR: menu_item_4
        });
        messages.push(msg3);

        // Message 4 (4/4): Item 1 amount prompt
        let item1_prompt_template = await get_text("Item 1 Amount", language);
        let msg4 = format_string(item1_prompt_template, { REQUESTED: requested_meals });
        messages.push(msg4);

        await set_phase(user_record, 4);
        return send_multiple_msgs(messages);
    }

    // **********************************************
    // Phase 4: Incoming msg is total number of Item 1
    if (phase == 4) {
        // Check to seee if user wants to. goback to resto selection
        let back_words = ["back", "رجع", "atrás", "atras", "返回", "Quay lại"];
        if (back_words.includes(String(incoming_msg).toLowerCase()) || back_words.includes(String(incoming_msg))) {

            // Send to phase 2 logic
            // Retreive previous list of neighborhoods
            let h = user_record.get("Neighborhoods Array");
            let hood_arr = h.split(',')

            let neighborhood_choice = user_record.get("neighborhood_choice");

            let n = hood_arr[neighborhood_choice - 1];

            let restaurants = await get_restaurants_by_hood(n);

            // Message 1: Header (1/2)
            let resto_header = await get_text("Select Restaurant", language);

            // Message 2+: List of restaurants (2/2)
            // Build list items without repeating prefix/footer
            n = 0;
            let resto_arr=[];
            let resto_list = "(2/2) ";

            restaurants.forEach(function (r) {
                n++;
                let r_name = r.get("DBA Name");
                resto_arr.push(r_name);
                resto_list += `Text "${n}" for ${r_name} (${r.get("Cuisine Type")}): ${r.get("Texting Script Address")} ${r.get("Open")} - ${r.get("Close")}\n\n`;
            });
            resto_list += 'To start over text "RESET". To select a different neighborhood text "BACK".';

            await set_phase(user_record, 3);
            await set_user_fields(user_record, {"Restaurants Array": resto_arr.toString()});
            let messages = [resto_header];
            let list_chunks = split_on_newline(resto_list.trim());
            messages = messages.concat(list_chunks);
            return send_multiple_msgs(messages);
        }

        let item_1_amount = parseInt(incoming_msg);
        let requested = user_record.get("Requested Meals");

        // Check for msg that isn't an integer
        if (isNaN(item_1_amount)) {
            let text = await get_text("Invalid Meal Number", language);
            return send_msg(text);
        }

        // Check for too large of an order
        if (item_1_amount > requested) {
            let template = await get_text("Too Many - Item 1", language);
            let formatted = format_string(template, {
                AMOUNT: item_1_amount,
                REQUESTED: requested
            });
            return send_msg(formatted);
        }

        await set_user_fields(user_record, {"Menu Item #1 Amount": item_1_amount})

        // Check if they want all of the first item
        if (item_1_amount == requested) {
            // Function: END GAME!
            let messages = await finish_order(phone_number, language);
            await set_phase(user_record, 98);
            return send_multiple_msgs(messages);
        }

        user_record = await get_family_record(phone_number);
        let remaining = user_record.get("Remaining")
        let template = await get_text("Item 2 Amount", language);
        let formatted = format_string(template, {
            REMAINING: remaining
        });
        await set_phase(user_record, 5);
        return send_msg(formatted);
    }

    // **********************************************
    // Phase 5: Incoming msg is total number of Item 2
    if (phase == 5) {
        let item_2_amount = parseInt(incoming_msg);
        user_record = await get_family_record(phone_number);
        remaining = user_record.get("Remaining")

        // Check for too large of an order
        if (item_2_amount > remaining) {
            let template = await get_text("Too Many - Item 2", language);
            let formatted = format_string(template, {
                REMAINING: remaining
            });
            return send_msg(formatted);
        }

        // Check for msg that isn't an integer
        if (isNaN(item_2_amount)) {
            let text = await get_text("Invalid Meal Number", language);
            return send_msg(text);
        }

        await set_user_fields(user_record, {"Menu Item #2 Amount": item_2_amount})

        // Check if they want only all of their items to be 1+2
        if (remaining - item_2_amount == 0) {
            // Function: END GAME!
            let messages = await finish_order(phone_number, language);
            await set_phase(user_record, 98);
            return send_multiple_msgs(messages);
        }

        user_record = await get_family_record(phone_number);
        remaining = user_record.get("Remaining")
        let template = await get_text("Item 3 Amount", language);
        let formatted = format_string(template, {
                REMAINING: remaining
        })
        await set_phase(user_record, 6);
        return send_msg(formatted);
    }

    // **********************************************
    // Phase 6: Incoming msg is total number of Item 3
    if(phase == 6) {
        let item_3_amount = parseInt(incoming_msg);
        user_record = await get_family_record(phone_number);
        remaining = user_record.get("Remaining")

        // Check for msg that isn't an integer
        if (isNaN(item_3_amount)) {
            let text = await get_text("Invalid Meal Number", language);
            return send_msg(text);
        }

        // Check for too large of an order
        if (item_3_amount > remaining) {
            let template = await get_text("Too Many - Item 3", language);
            let formatted = format_string(template, {
                REMAINING: remaining
            });
            return send_msg(formatted);
        }

        await set_user_fields(user_record, {"Menu Item #3 Amount": item_3_amount})

        // Check if they want only all of their items to be 1+2+3
        if (remaining - item_3_amount == 0) {
            // Function: END GAME!
            let messages = await finish_order(phone_number, language);
            await set_phase(user_record, 98);
            return send_multiple_msgs(messages);
        }
        // Assumption: the remaining will be item #4
        // Function: END GAME!
        remaining = remaining - item_3_amount;
        await set_user_fields(user_record, {"Menu Item #4 Amount": remaining, "Phase": 98});
        let messages = await finish_order(phone_number, language);
        return send_multiple_msgs(messages);
    }

    // **********************************************
    // Phase 98: Incoming msg is confirmation
    if (phase == 98) {
        let confirmation = parseInt(incoming_msg);
        if (confirmation == 1) {
            user_record = await get_family_record(phone_number);
            let new_remaining = user_record.get("Vouchers Remaining") - user_record.get("Order Total");
            let renewal_date = user_record.get("Friendly Renewal Date");

            // Message 1: Order confirmed
            let amt = user_record.get("Order Total") > 6 ? " > 6" : " <= 6";
            let confirm_template = await get_text(`Finish Order${amt}`, language);
            let confirm_msg = format_string(confirm_template, {
                FAMILYID: user_record.get("Family ID"),
                REMAINING: new_remaining,
                RESTAURANT: user_record.get("Restaurant Choice"),
                DATE: renewal_date
            });

            // Message 2: After confirmation info
            let after_template = await get_text("After Confirmation", language);
            let after_msg = format_string(after_template, {
                REMAINING: new_remaining,
                DATE: renewal_date
            });

            await save_order_log(user_record);
            await set_user_fields(user_record, {
                "Phase": 0,
                "Restaurant Choice": "",
                "Requested Meals": 0,
                "Menu Item #1 Amount": 0,
                "Menu Item #1": "",
                "Menu Item #2 Amount": 0,
                "Menu Item #2": "",
                "Menu Item #3 Amount": 0,
                "Menu Item #3": "",
                "Menu Item #4 Amount": 0,
                "Menu Item #4": "",
                "Vouchers Remaining": new_remaining
            });
            return send_multiple_msgs([confirm_msg, after_msg]);
        }

        if (confirmation != 1) {
            let text = await get_text("Not Confirmed", language);
            return send_msg(text);
        }
    }
}

exports.lambdaHandler = async (event, context) => {
    try {
        console.log('Received event:', JSON.stringify(event, null, 2));

        // Parse form data from Twilio webhook
        const body = event.body;
        const params = new URLSearchParams(body);

        const phone_number = params.get('From');
        const incoming_msg = params.get('Body').toLowerCase().trim();

        console.log(`Processing SMS from ${phone_number}: ${incoming_msg}`);

        const twimlResponse = await handle(phone_number, incoming_msg, event);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/xml'
            },
            body: twimlResponse.toString()
        };

    } catch (error) {
        console.error('Error processing request:', error);

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'text/xml'
            },
            body: '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, there was an error processing your request. Please try again.</Message></Response>'
        };
    }
};