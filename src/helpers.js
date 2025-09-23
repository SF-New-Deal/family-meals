const airtable = require("airtable");
const twilio = require("twilio");

let at_base;

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

function format_string(s, d) {
    return s.replace(/\[([A-Z]+)\]/g, function(s,p) { return d[p] });
}

async function get_text(shortname, language) {
    const base = initializeAirtable();
    let ts = base("Texting Script v2.0");
    let s = ts.select({filterByFormula: '{Short Name}="' + shortname + '"'});
    let a = s.all();
    let records = await a;
    let rv = records[0].get(language);
    if (rv) rv = rv.trim();
    if (!rv) rv = records[0].get("English");
    return rv.trim();
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
    let template = await get_text("Final Order Intro", language);
    let menu_item_1_amt = user_record.get("Menu Item #1 Amount");
    let menu_item_1 = user_record.get("Menu Item #1");
    let menu_item_2_amt = user_record.get("Menu Item #2 Amount");
    let menu_item_2 = user_record.get("Menu Item #2");
    let menu_item_3_amt = user_record.get("Menu Item #3 Amount");
    let menu_item_3 = user_record.get("Menu Item #3");
    let menu_item_4_amt = user_record.get("Menu Item #4 Amount");
    let menu_item_4 = user_record.get("Menu Item #4");
    let text = format_string(template, {
        ITEMONEAMOUNT: menu_item_1_amt,
        ITEMONE: menu_item_1,
        ITEMTWOAMOUNT: menu_item_2_amt,
        ITEMTWO: menu_item_2,
        ITEMTHREEAMOUNT: menu_item_3_amt,
        ITEMTHREE: menu_item_3,
        ITEMFOURAMOUNT: menu_item_4_amt,
        ITEMFOUR: menu_item_4
    });
    return text;
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

async function unenrolled_check(rec) {
    if (rec.get("Unenrolled")) {
        let language = rec.get("Language");
        let reason = rec.get("Why Unenrolled?")
        let text = await get_text("Unenrolled", language);
        let formatted = format_string(text, {VAR: reason})
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
    format_string,
    get_text,
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
    getHoods
};