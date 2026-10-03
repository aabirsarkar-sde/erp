// A tiny fake Odoo JSON-RPC server with a handful of records, for testing scripts/odoo-import.ts offline.
import http from "node:http";

const D = (s) => s; // Odoo datetime strings (UTC)
export const DATA = {
  "res.users": [
    { id: 2, name: "Aarti Patil", login: "aarti@raybon.local", email: "aarti@raybon.local" },
    { id: 7, name: "Old Salesman", login: "old.sales@raybonchemicals.com", email: "old.sales@raybonchemicals.com" },
  ],
  "res.partner": [
    { id: 101, name: "Odoo Test Industries Ltd.", is_company: true, parent_id: false, email: "info@odootest.example", phone: "0265 2333444", street: "Plot 12, GIDC", street2: false, city: "Vadodara", zip: "390010", state_id: [588, "Gujarat (IN)"], vat: "24ABCDE1234F1Z5", comment: "<p>Key account</p>", function: false, active: true },
    { id: 102, name: "Mahesh Joshi", is_company: false, parent_id: [101, "Odoo Test Industries Ltd."], email: "mahesh@odootest.example", mobile: "+91 98250 77777", phone: false, function: "Plant Head", active: true },
  ],
  "crm.stage": [{ id: 1, name: "New", sequence: 1, is_won: false, fold: false }, { id: 4, name: "Won", sequence: 70, is_won: true, fold: false }],
  "crm.tag": [{ id: 5, name: "Hot" }, { id: 6, name: "Pharma" }],
  "crm.lead": [
    { id: 501, name: "Odoo Test — 300 KLD ZLD", type: "opportunity", partner_id: [101, "Odoo Test Industries Ltd."], partner_name: "Odoo Test Industries Ltd.", contact_name: "Mahesh Joshi", email_from: "mahesh@odootest.example", phone: "+91 98250 77777", mobile: false, street: "Plot 12, GIDC", street2: false, city: "Vadodara", expected_revenue: 32500000, probability: 40, priority: "2", tag_ids: [5, 6], description: "<p>RO + MEE + ATFD</p>", stage_id: [1, "New"], user_id: [2, "Aarti Patil"], date_deadline: "2026-12-31", create_date: D("2026-06-01 05:30:00"), date_closed: false, active: true, lost_reason_id: false, source_id: [3, "Exhibition"] },
    { id: 502, name: "Odoo Test — RO spares", type: "opportunity", partner_id: [101, "Odoo Test Industries Ltd."], expected_revenue: 450000, probability: 100, priority: "0", tag_ids: [], description: false, stage_id: [4, "Won"], user_id: [7, "Old Salesman"], create_date: D("2026-03-01 05:30:00"), date_closed: D("2026-04-10 05:30:00"), active: true },
    { id: 503, name: "Odoo Test — lost STP", type: "lead", partner_id: false, partner_name: "Walk-in Co", expected_revenue: 900000, probability: 0, stage_id: [1, "New"], user_id: false, create_date: D("2026-02-01 05:30:00"), date_closed: D("2026-02-20 05:30:00"), active: false, lost_reason_id: [1, "Too expensive"] },
  ],
  "mail.message": [
    { id: 9001, model: "crm.lead", res_id: 501, message_type: "comment", body: "<p>Visited site, met <b>Mahesh</b>.<br/>Jar test next week.</p>", date: D("2026-06-10 06:00:00"), author_id: [3, "Aarti Patil"], subject: false, subtype_id: [2, "Note"], email_from: false },
    { id: 9002, model: "crm.lead", res_id: 501, message_type: "email", body: "<p>Please send the revised offer.</p>", date: D("2026-06-20 06:00:00"), author_id: [102, "Mahesh Joshi"], subject: "Re: Offer", subtype_id: [1, "Discussions"], email_from: "mahesh@odootest.example" },
    { id: 9101, model: "helpdesk.ticket", res_id: 301, message_type: "email", body: "<p>Pump is tripping again</p>", date: D("2026-05-01 05:00:00"), author_id: [102, "Mahesh Joshi"], email_from: "mahesh@odootest.example", subtype_id: [1, "Discussions"] },
    { id: 9003, model: "crm.lead", res_id: 501, message_type: "notification", body: "<p>Stage changed</p>", date: D("2026-06-21 06:00:00"), author_id: false },
  ],
  "mail.activity": [{ id: 7001, res_model: "crm.lead", res_id: 501, activity_type_id: [2, "Call"], summary: "Call about jar test results", note: false, date_deadline: "2026-10-10", user_id: [2, "Aarti Patil"] }],
  "sale.order": [{ id: 801, name: "S00999", partner_id: [101, "Odoo Test Industries Ltd."], opportunity_id: [501, "x"], date_order: D("2026-06-25 06:00:00"), validity_date: "2026-07-25", state: "sent", user_id: [2, "Aarti Patil"], amount_untaxed: 1000000, amount_tax: 180000, amount_total: 1180000, note: "<p>Ex-works Vadodara</p>" }],
  "sale.order.line": [{ id: 1, order_id: [801, "S00999"], name: "ROSERVE RO Plant 50 KLD", product_uom_qty: 1, price_unit: 1000000, sequence: 1, display_type: false }],
  "ir.model": [{ id: 1, model: "sale.order" }, { id: 2, model: "helpdesk.ticket" }],
  "helpdesk.ticket": [
    { id: 301, name: "RO high pressure pump tripping", description: "<p>Pump trips every 2 hours</p>", partner_id: [101, "Odoo Test Industries Ltd."], partner_name: "Mahesh Joshi", partner_email: "mahesh@odootest.example", partner_phone: "9825077777", team_id: [1, "Dahej"], user_id: [2, "Aarti Patil"], stage_id: [3, "Solved"], priority: "2", create_date: D("2026-05-01 04:30:00"), close_date: D("2026-05-02 08:30:00"), tag_ids: [], ticket_type_id: [1, "Mechanical"] },
    { id: 302, name: "Membrane fouling", partner_id: [101, "x"], team_id: false, user_id: false, stage_id: [1, "New"], priority: "1", create_date: D("2026-09-01 04:30:00"), close_date: false },
  ],
  "ir.attachment": [],
};

function match(rec, dom) {
  // prefix-notation domain: implicit AND, with "|" / "&" taking the next two terms
  const terms = [...dom];
  const evalTerm = () => {
    const t = terms.shift();
    if (t === "|") { const a = evalTerm(), b = evalTerm(); return a || b; }
    if (t === "&") { const a = evalTerm(), b = evalTerm(); return a && b; }
    const [f, op, v] = t; let x = rec[f];
    if (Array.isArray(x) && typeof x[0] === "number" && typeof x[1] === "string") x = x[0];
    if (x === undefined) x = false;
    if (op === "=") return x === v;
    if (op === "!=") return x !== v;
    if (op === "in") return v.includes(x);
    if (op === ">=") return String(x) >= String(v);
    return true;
  };
  let ok = true;
  while (terms.length) ok = evalTerm() && ok;
  return ok;
}

export function start(port = 8069) {
  const srv = http.createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    const { params } = JSON.parse(body || "{}");
    const out = (result) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result })); };
    if (params.service === "common") return out(params.method === "login" ? (params.args[2] === "secret" ? 2 : false) : { server_version: "17.0-mock" });
    const [, , , model, method, a = [], kw = {}] = params.args;
    const rows = DATA[model] ?? [];
    if (method === "fields_get") return out(Object.fromEntries([...new Set(rows.flatMap((r) => Object.keys(r)))].map((k) => [k, { type: "char" }])));
    if (method === "search_count") return out(rows.filter((r) => match(r, a[0] ?? [])).length);
    if (method === "search_read") {
      const hit = rows.filter((r) => match(r, a[0] ?? [])).slice(kw.offset ?? 0, (kw.offset ?? 0) + (kw.limit ?? 1e9));
      return out(hit.map((r) => Object.fromEntries([["id", r.id], ...(kw.fields ?? Object.keys(r)).map((f) => [f, r[f] ?? false])])));
    }
    if (method === "read") return out(rows.filter((r) => a[0].includes(r.id)));
    out(false);
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}
