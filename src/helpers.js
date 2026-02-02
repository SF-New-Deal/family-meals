const airtable = require("airtable");
const twilio = require("twilio");

let at_base;
let twilioClient;

function initializeTwilioClient() {
    if (!twilioClient) {
        twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
    }
    return twilioClient;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function initializeAirtable() {
  if (!at_base) {
    at_base = new airtable({
      apiKey: process.env.AIRTABLE_API_KEY,
    }).base(process.env.AIRTABLE_BASE_KEY);
  }
  return at_base;
}

async function send_translated_msg(language, shortname) {
    let txt = await get_text(shortname, language);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(txt);
    return twiml;
}

function fallthrough(language) {
    return send_translated_msg(language, "Invalid Choice");
}

function send_msg(txt) {
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(txt);
    return twiml;
}

function send_multiple_msgs(messages_array) {
    const twiml = new twilio.twiml.MessagingResponse();
    const total = messages_array.length;
    messages_array.forEach((msg, index) => {
        const prefix = `(${index + 1}/${total}) `;
        twiml.message(prefix + msg);
    });
    return twiml;
}

async function send_multiple_msgs_with_delay(to_number, messages_array, delay_ms = 1500) {
    const client = initializeTwilioClient();
    const from_number = process.env.TWILIO_PHONE_NUMBER;
    const total = messages_array.length;

    for (let i = 0; i < messages_array.length; i++) {
        const prefix = `(${i + 1}/${total}) `;
        await client.messages.create({
            body: prefix + messages_array[i],
            from: from_number,
            to: to_number
        });

        // Add delay between messages (except after the last one)
        if (i < messages_array.length - 1) {
            await delay(delay_ms);
        }
    }

    // Return empty TwiML since we sent messages via REST API
    return new twilio.twiml.MessagingResponse();
}

function split_on_newline(text, limit = 320) {
    const messages = [];
    let remaining = text;
    while (remaining.length > limit) {
        let splitIndex = remaining.lastIndexOf('\n', limit);
        if (splitIndex === -1) splitIndex = limit;
        messages.push(remaining.substring(0, splitIndex).trim());
        remaining = remaining.substring(splitIndex).trim();
    }
    if (remaining) messages.push(remaining);
    return messages;
}

function format_string(s, d) {
    return s.replace(/\[([A-Z]+)\]/g, function(s,p) { return d[p] });
}

// Wraps text in Unicode bidirectional isolate characters to prevent RTL/LTR mixing issues
// FSI (First Strong Isolate) + text + PDI (Pop Directional Isolate)
function bidi_wrap(text) {
    if (!text) return text;
    return '\u2068' + text + '\u2069';
}

function getMenuItemWithFallback(record, itemNumber, language) {
    let item = record.get(`Menu Item #${itemNumber} ${language}`);
    if (!item && language !== "English") {
        item = record.get(`Menu Item #${itemNumber} English`);
    }
    return item || "";
}

async function get_text(shortname, language) {
    const base = initializeAirtable();
    let ts = base("Texting Script v3.0");
    let s = ts.select({filterByFormula: '{Short Name}="' + shortname + '"'});
    let a = s.all();
    let records = await a;
    if (!records || records.length === 0) {
        console.log(`[get_text] No record found for shortname: "${shortname}"`);
        return null;
    }
    let rv = records[0].get(language);
    console.log(`[get_text] shortname="${shortname}", language="${language}", value=${rv ? `"${rv.substring(0, 50)}..."` : "NULL/EMPTY"}`);
    if (rv) rv = rv.trim();
    if (!rv) {
        console.log(`[get_text] Falling back to English for shortname="${shortname}"`);
        rv = records[0].get("English");
    }
    return rv ? rv.trim() : null;
}

async function set_user_fields(user_record, new_fields) {
    const base = initializeAirtable();
    const record_id = user_record.id;
    await base("Families").update(record_id, new_fields);
}

async function set_phase(user_record, new_phase) {
    await set_user_fields(user_record, { Phase: new_phase });
}

async function reset_user(user_record) {
    await set_user_fields(user_record, {
        "Phase": 0,
        "Requested Meals": 0,
        "Menu Item #1 Amount": 0,
        "Menu Item #2 Amount": 0,
        "Menu Item #3 Amount": 0,
        "Menu Item #4 Amount": 0,
        "Restaurant Choice": null,
        "Menu Item #1": null,
        "Menu Item #2": null,
        "Menu Item #3": null,
        "Menu Item #4": null,
        "Neighborhoods Array": null,
        "Restaurants Array": null
    });
}

async function over_limit(language, renewal_date) {
    let template = await get_text("Over Limit", language);
    let formatted = format_string(template, {DATE: renewal_date});
    return send_msg(formatted);
}

async function get_restaurants() {
    const base = initializeAirtable();
    let r = base("Restaurants");
    let s = r.select({filterByFormula: 'AND({Available For Orders}="✅", {In Service}=TRUE())'});
    let a = s.all();
    let records = await a;
    return records;
}

async function get_restaurants_by_hood(hood) {
    const base = initializeAirtable();
    let r = base("Restaurants");
    let s = r.select({
        filterByFormula:
            `AND({Available For Orders}="✅",
            {Neighborhoods}="${hood}")`
        });
    let a = s.all();
    let records = await a;
    return records;
}

async function get_restaurant_by_name(name) {
    const base = initializeAirtable();
    let r = base("Restaurants");
    let s = r.select({filterByFormula: '{DBA Name}="' + name + '"'});
    let a = s.all();
    let records = await a;
    return records[0];
}

async function finish_order(phone_number, language) {
    let user_record = await get_family_record(phone_number);
    let menu_item_1_amt = user_record.get("Menu Item #1 Amount") || 0;
    let menu_item_1 = user_record.get("Menu Item #1");
    let menu_item_2_amt = user_record.get("Menu Item #2 Amount") || 0;
    let menu_item_2 = user_record.get("Menu Item #2");
    let menu_item_3_amt = user_record.get("Menu Item #3 Amount") || 0;
    let menu_item_3 = user_record.get("Menu Item #3");
    let menu_item_4_amt = user_record.get("Menu Item #4 Amount") || 0;
    let menu_item_4 = user_record.get("Menu Item #4");

    // Message 1 (1/3): Items 1-2
    let msg1_template = await get_text("Final Order Intro", language);
    let msg1 = format_string(msg1_template, {
        ITEMONEAMOUNT: menu_item_1_amt,
        ITEMONE: menu_item_1,
        ITEMTWOAMOUNT: menu_item_2_amt,
        ITEMTWO: menu_item_2
    });

    // Message 2 (2/3): Items 3-4
    let msg2_template = await get_text("Final Order 2", language);
    let msg2 = format_string(msg2_template, {
        ITEMTHREEAMOUNT: menu_item_3_amt,
        ITEMTHREE: menu_item_3,
        ITEMFOURAMOUNT: menu_item_4_amt,
        ITEMFOUR: menu_item_4
    });

    // Message 3 (3/3): Confirmation prompt
    let msg3 = await get_text("Final Order 3", language);

    return [msg1, msg2, msg3];
}

async function save_order_log(user_record) {
    const base = initializeAirtable();
    let n = user_record.get("Restaurant Choice");
    let r = await get_restaurant_by_name(n);
    let o = base("Order Log");
    await o.create({
        "Previous Vouchers Remaining": user_record.get("Vouchers Remaining"),
        "Timestamp": new Date(),
        "Family": [ user_record.id ],
        "Restaurants": [ r.id ],
        "Menu Item #1 Amount": user_record.get("Menu Item #1 Amount"),
        "Menu Item #2 Amount": user_record.get("Menu Item #2 Amount"),
        "Menu Item #3 Amount": user_record.get("Menu Item #3 Amount"),
        "Menu Item #4 Amount": user_record.get("Menu Item #4 Amount")
    });
}

async function getHoods(restaurants) {
    let hoods = [];
    restaurants.forEach(function (r) {
        let h = r.get("Neighborhoods");
        hoods.push(h)
    });
    uniq = [...new Set(hoods)]
    return uniq;
}

async function get_family_record(phone_number) {
    const base = initializeAirtable();
    let c = base("Families");
    let s = c.select({
        filterByFormula: `OR({Phone number}="${phone_number}", {Secondary Phone number}="${phone_number}")`
    });
    let a = s.all();
    let records = await a;
    let match;

    records.forEach(function (r) {
        let primary = r.get("Phone number");
        let secondary = r.get("Secondary Phone number");
        if (phone_number == primary || phone_number == secondary) {
            match = r;
        }
    });

    return match;
}

// Hardcoded translations for "Why Unenrolled?" reasons
const unenrolledReasons = {
    "Aged out": {
        English: "Aged out",
        Spanish: "Envejecido",
        Chinese: "超齡",
        Arabic: "تم الوصول إلى حد العمر"
    },
    "Left the school/site": {
        English: "Left the school/site",
        Spanish: "Dejó la escuela/sitio",
        Chinese: "已離開學校/站點",
        Arabic: "ترك المدرسة / الموقع"
    },
    "Been inactive": {
        English: "Been inactive",
        Spanish: "Estado inactivo",
        Chinese: "沒有參與",
        Arabic: "كان غير نشط"
    },
    "Insufficient eligibility": {
        English: "Insufficient eligibility",
        Spanish: "Elegibilidad insuficiente",
        Chinese: "不符合資格要求",
        Arabic: "غير مؤهل"
    },
    "Become food secure": {
        English: "Become food secure",
        Spanish: "Seguridad alimentaria",
        Chinese: "食品安全問題得到解決",
        Arabic: "كن آمنا غذائيا"
    },
    "No longer wishes to participate": {
        English: "No longer wishes to participate",
        Spanish: "No desea seguir participando",
        Chinese: "不希望再參加活動",
        Arabic: "لم تعد ترغب في المشاركة"
    },
    "Been temporary unenrolled": {
        English: "Been temporary unenrolled",
        Spanish: "Temporalmente no inscrito",
        Chinese: "臨時被移出活動",
        Arabic: "تم إلغاء تسجيلك مؤقتًا"
    },
    "Repeated meal overages": {
        English: "Repeated meal overages",
        Spanish: "Pedidos excesivos de comidas",
        Chinese: "持續超額領餐",
        Arabic: "وجبات متكررة ما استخدمت"
    },
    "Reason unknown": {
        English: "Reason unknown",
        Spanish: "Razón desconocida",
        Chinese: "未知原因",
        Arabic: "السبب غير معروف"
    }
};

function getTranslatedReason(reason, language) {
    if (unenrolledReasons[reason] && unenrolledReasons[reason][language]) {
        return unenrolledReasons[reason][language];
    }
    // Fallback to English if translation not found, or original reason if not in lookup
    if (unenrolledReasons[reason]) {
        return unenrolledReasons[reason].English;
    }
    return reason;
}

// Hardcoded translations for "Dietary Restriction" values
const dietaryRestrictions = {
    "No dietary restrictions": {
        English: "No dietary restrictions",
        Spanish: "Sin restricciones dietéticas",
        Chinese: "沒有飲食禁忌",
        Arabic: "لا يوجد قيود غذائية"
    },
    "No Restrictions": {
        English: "No Restrictions",
        Spanish: "Sin restricciones dietéticas",
        Chinese: "沒有飲食禁忌",
        Arabic: "لا يوجد قيود غذائية"
    },
    "Vegetarian": {
        English: "Vegetarian",
        Spanish: "Vegetariano",
        Chinese: "素食",
        Arabic: "نباتي"
    },
    "Vegan": {
        English: "Vegan",
        Spanish: "Vegano",
        Chinese: "全素食，不含蛋奶",
        Arabic: "نباتي"
    },
    "Nut Allergy": {
        English: "Nut Allergy",
        Spanish: "Alergia (Nueces)",
        Chinese: "堅果過敏",
        Arabic: "حساسية المكسرات"
    },
    "Seafood Allergy": {
        English: "Seafood Allergy",
        Spanish: "Alergia (Mariscos)",
        Chinese: "海鮮過敏",
        Arabic: "حساسية من المأكولات البحرية"
    },
    "Lactose Intolerant": {
        English: "Lactose Intolerant",
        Spanish: "Intolerante a Lactosa",
        Chinese: "乳糖不耐受",
        Arabic: "عدم تحمل اللاكتوز"
    },
    "Diabetic": {
        English: "Diabetic",
        Spanish: "Diabético",
        Chinese: "糖尿病患者",
        Arabic: "سكري"
    },
    "No Pork": {
        English: "No Pork",
        Spanish: "Sin Cerdo",
        Chinese: "不要豬肉",
        Arabic: "لا لحم خنزير"
    },
    "Halal": {
        English: "Halal",
        Spanish: "Halal",
        Chinese: "清真",
        Arabic: "حلال"
    },
    "Citrus Allergy": {
        English: "Citrus Allergy",
        Spanish: "Alergia (Cítricos)",
        Chinese: "柑橘類過敏",
        Arabic: "حساسية الحمضيات"
    },
    "Gluten Allergy": {
        English: "Gluten Allergy",
        Spanish: "Alergia (Gluten)",
        Chinese: "麩質過敏",
        Arabic: "حساسية الغلوتين"
    },
    "No Egg": {
        English: "No Egg",
        Spanish: "Sin Huevo",
        Chinese: "不要雞蛋",
        Arabic: "لا بيضة"
    },
    "Soy Allergy": {
        English: "Soy Allergy",
        Spanish: "Alergia (Soja)",
        Chinese: "豆製品過敏",
        Arabic: "حساسية الصويا"
    },
    "Avocado Allergy": {
        English: "Avocado Allergy",
        Spanish: "Alergia (Aguacate)",
        Chinese: "牛油果過敏",
        Arabic: "حساسية الأفوكادو"
    },
    "Scallop Allergy": {
        English: "Scallop Allergy",
        Spanish: "Alergia (Vieiras)",
        Chinese: "扇貝過敏",
        Arabic: "حساسية البطلينوس"
    },
    "Cinnamon Allergy": {
        English: "Cinnamon Allergy",
        Spanish: "Alergia (Canela)",
        Chinese: "肉桂過敏",
        Arabic: "حساسية القرفة"
    },
    "Grapeseed Oil Allergy": {
        English: "Grapeseed Oil Allergy",
        Spanish: "Alergia (Aceite de Semilla de Uva)",
        Chinese: "葡萄籽油過敏",
        Arabic: "حساسية زيت بذور العنب"
    },
    "Pineapple Allergy": {
        English: "Pineapple Allergy",
        Spanish: "Alergia (Piña)",
        Chinese: "菠蘿過敏",
        Arabic: "حساسية الأناناس"
    },
    "Honey Allergy": {
        English: "Honey Allergy",
        Spanish: "Alergia (Miel)",
        Chinese: "蜂蜜過敏",
        Arabic: "حساسية العسل"
    },
    "Fava Beans Allergy": {
        English: "Fava Beans Allergy",
        Spanish: "Alergia (Habas)",
        Chinese: "蠶豆",
        Arabic: "حساسية الفول الفارسي"
    },
    "Tomato Allergy": {
        English: "Tomato Allergy",
        Spanish: "Alergia (Tomate)",
        Chinese: "番茄過敏",
        Arabic: "حساسية الطماطم"
    },
    "Other Allergy": {
        English: "Other Allergy",
        Spanish: "Otras Alergias",
        Chinese: "其他過敏",
        Arabic: "حساسية الأخرى"
    }
};

function getTranslatedRestriction(restriction, language) {
    if (!restriction) return restriction;

    let parts;

    // Handle if Airtable returns an array (multi-select field)
    if (Array.isArray(restriction)) {
        parts = restriction;
    } else {
        // Convert to string if needed
        const restrictionStr = String(restriction);
        // Handle multiple comma variants: ASCII comma, full-width comma, ideographic comma
        const commaRegex = /[,，、]/;
        if (commaRegex.test(restrictionStr)) {
            parts = restrictionStr.split(commaRegex).map(r => r.trim());
        } else {
            parts = [restrictionStr];
        }
    }

    return parts.map(r => translateSingleRestriction(r.trim(), language)).join(', ');
}

function translateSingleRestriction(restriction, language) {
    // First try exact match
    if (dietaryRestrictions[restriction] && dietaryRestrictions[restriction][language]) {
        return dietaryRestrictions[restriction][language];
    }
    if (dietaryRestrictions[restriction]) {
        return dietaryRestrictions[restriction].English;
    }

    // Handle bilingual format like "Other Allergy/其他過敏"
    // The format is "English/Chinese" - extract the appropriate part
    if (restriction && restriction.includes('/')) {
        const parts = restriction.split('/');
        const englishPart = parts[0].trim();
        const chinesePart = parts[1] ? parts[1].trim() : null;

        // Try to match the English part in our lookup table
        if (dietaryRestrictions[englishPart] && dietaryRestrictions[englishPart][language]) {
            return dietaryRestrictions[englishPart][language];
        }
        if (dietaryRestrictions[englishPart]) {
            return dietaryRestrictions[englishPart].English;
        }

        // If no lookup match, return the appropriate language part directly
        if (language === 'Chinese' && chinesePart) {
            return chinesePart;
        }
        return englishPart;
    }

    // Fallback to original if no match found
    return restriction;
}

async function unenrolled_check(rec) {
    if (rec.get("Unenrolled")) {
        let language = rec.get("Language") || "English";
        let reason = rec.get("Why Unenrolled?");
        let translatedReason = getTranslatedReason(reason, language);
        let text = await get_text("Unenrolled", language);
        let formatted = format_string(text, {VAR: translatedReason});
        return send_msg(formatted);
    }
    return null;
}

async function redemption_check(rec) {
    if (rec.get("Redemption Card") && rec.get("CBO Text") != "SFND QC") {
        let language = rec.get("Language");
        let id = rec.get("Family ID")
        let text = await get_text("Redemption Card Delivered", language);
        let formatted = format_string(text, {FAMILYID: id})
        return send_msg(formatted);
    }
    return null;
}

module.exports = {
    fallthrough,
    send_msg,
    send_multiple_msgs,
    send_multiple_msgs_with_delay,
    split_on_newline,
    format_string,
    get_text,
    getMenuItemWithFallback,
    send_translated_msg,
    set_user_fields,
    set_phase,
    reset_user,
    get_family_record,
    unenrolled_check,
    redemption_check,
    over_limit,
    get_restaurants,
    get_restaurant_by_name,
    get_restaurants_by_hood,
    finish_order,
    save_order_log,
    getHoods,
    bidi_wrap,
    getTranslatedRestriction
};