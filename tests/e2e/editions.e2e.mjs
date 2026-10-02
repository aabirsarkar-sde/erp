// The two products: node tests/e2e/editions.e2e.mjs <crm|helpdesk>
// Run against a build made with that APP_EDITION and its own seeded database. See tests/README.md.
import { BASE, OUT, launch } from "./env.mjs";
const ED = process.argv[2];
const browser = await launch();
const errs = [];
const ok = (label, cond) => { console.log((cond ? "✓ " : "✗ FAIL ") + label); if (!cond) errs.push("FAIL " + label); };
async function tryLogin(email, pw = "raybon123", vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  // pages stream in behind a loading skeleton: let each navigation finish before reading the page
  const goto = p.goto.bind(p); p.goto = async (...args) => { const r = await goto(...args); await p.waitForLoadState("networkidle").catch(() => {}); return r; };
  p.on("pageerror", e => errs.push(email + ": " + e.message)); p.on("console", m => m.type() === "error" && !m.text().includes("404") && errs.push(email + ": " + m.text()));
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click("button");
  await Promise.race([p.waitForURL(BASE + "/"), p.locator("p.bg-red-50").waitFor()]);
  return { ctx, p, in: p.url() === BASE + "/" };
}
const status = async (p, path) => (await p.request.get(BASE + path, { maxRedirects: 0 })).status();
const crm = ED === "crm";

const brandText = crm ? "Raybon Sales CRM" : "Raybon O&M Helpdesk";
const anon = await (await browser.newContext()).newPage();
await anon.goto(BASE + "/login");
ok("login page branded " + brandText, (await anon.locator("main").innerText()).includes(brandText));
await anon.screenshot({ path: `${OUT}/split-${ED}-login.png` });
ok("public complaint portal " + (crm ? "absent" : "present"), (await status(anon, "/complaint")) === (crm ? 404 : 200));

// the other department's people can't sign in
const outsider = await tryLogin(crm ? "rakesh@raybon.local" : "gaurang@raybon.local");
ok("other department's user is refused", !outsider.in);

const a = await tryLogin("aarti@raybon.local");
ok("aarti signs in", a.in);
const nav = (await a.p.locator("aside nav").first().innerText()).replace(/\n+/g, " | ");
console.log("nav:", nav);
ok("nav has only this product", crm ? nav.includes("Opportunities") && !nav.includes("Tickets") && !nav.includes("Plants") : nav.includes("Tickets") && !nav.includes("Opportunities") && !nav.includes("Quotations"));
ok("sidebar shows product name", (await a.p.locator("aside").first().innerText()).includes(brandText));
const primary = await a.p.locator("aside a.btn-primary").first().innerText();
ok("primary button fits product: " + primary.trim(), crm ? primary.includes("activity") : primary.includes("complaint"));
await a.p.screenshot({ path: `${OUT}/split-${ED}-home.png` });

const own = crm ? ["/crm", "/crm/leads", "/activities", "/quotations", "/sales-reports", "/calendar/activity"] : ["/tickets", "/helpdesk", "/plants", "/reports", "/tickets/new"];
const other = crm ? ["/tickets", "/tickets/1", "/helpdesk", "/plants", "/reports", "/print/tickets", "/api/export/tickets"] : ["/crm", "/crm/1", "/crm/leads", "/activities", "/quotations", "/sales-reports", "/calendar/activity", "/api/export/sales"];
for (const u of own) ok(`own route ${u} → 200`, (await status(a.p, u)) === 200);
for (const u of other) ok(`other product's route ${u} → 404`, (await status(a.p, u)) === 404);
for (const u of ["/calendar", "/discuss", "/documents", "/customers", "/insights", "/settings", "/settings/import"]) {
  const r = await a.p.goto(BASE + u);
  await a.p.waitForLoadState("networkidle");
  if ((r && r.status() !== 200) || (await a.p.locator("main").innerText()).includes("Not found")) ok(`shared ${u} loads`, false);
}
await a.p.goto(BASE + "/calendar");
ok("calendar buttons fit product", crm ? (await a.p.locator("a:has-text('Activity / visit')").count()) === 1 && (await a.p.locator("main a:has-text('Complaint'), a[href^='/tickets/new']").count()) === 0 : (await a.p.locator("a:has-text('Activity / visit')").count()) === 0);
await a.p.screenshot({ path: `${OUT}/split-${ED}-calendar.png` });
await a.p.goto(BASE + "/customers");
ok("customer cards count " + (crm ? "opportunities" : "tickets"), (await a.p.getByText(crm ? "total opportunities" : "total tickets").count()) > 0);
await a.p.click("a[href^='/customers/']:not([href='/customers/new'])"); await a.p.waitForURL(/customers\/\d+/);
const cust = await a.p.locator("main").innerText();
ok("customer page shows only this product", crm ? !cust.includes("Tickets (") : !cust.includes("Opportunities (") && !cust.includes("Activity history"));
await a.p.goto(BASE + "/insights");
const ins = await a.p.locator("main").innerText();
ok("insights only this product", crm ? !ins.includes("Open tickets") : !ins.includes("Open pipeline"));

const adm = await tryLogin("admin@raybon.local", "admin123");
await adm.p.goto(BASE + "/settings");
const st = await adm.p.locator("main").innerText();
ok("settings only this product", crm ? !st.includes("Helpdesk/O&M") && !st.includes("Zones (") && st.includes("Sales/CRM") : !st.includes("Sales/CRM") && st.includes("Zones ("));
await adm.p.goto(BASE + "/settings/import");
const imp = await adm.p.locator("main").innerText();
ok("import kinds fit product", crm ? !imp.includes("Helpdesk tickets") && imp.includes("CRM opportunities") : imp.includes("Helpdesk tickets") && !imp.includes("CRM opportunities"));

// updating a user from Settings must not wipe their (hidden) other-department access
// (checked indirectly: aarti saved in this app can still sign in afterwards)
await adm.p.goto(BASE + "/settings");
const row = adm.p.locator("li:has-text('aarti@raybon.local') form");
await row.locator("input[name=title]").fill("Sales & O&M lead");
await row.locator("button:has-text('Save')").click(); await adm.p.waitForTimeout(800);
const a2 = await tryLogin("aarti@raybon.local");
ok("aarti still signs in after edit", a2.in);

// mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await a.ctx.storageState() });
const mp = await m.newPage(); await mp.goto(BASE + "/"); await mp.screenshot({ path: `${OUT}/split-${ED}-mobile.png` });
console.log("errors:", errs);
await browser.close();
if (errs.length) process.exit(1);
