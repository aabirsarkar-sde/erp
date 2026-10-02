// Access control (own/all, zones, 404s), helpdesk form & stages, leads → opportunity, proposals,
// calendar activities with visit reports, sales reports & exports.
// Run against a COMBINED build (APP_EDITION unset) with fresh seed data. See tests/README.md.
import ExcelJS from "exceljs";
import { BASE, OUT, FIXTURES, launch, clickUntil } from "./env.mjs";
const browser = await launch();
const errs = [];
// Pages stream behind a loading skeleton, so a hidden record renders the "Not found" screen
// (HTTP status stays 200 once streaming has started). Check what the user actually sees.
const notFound = async (p, path) => { await p.goto(BASE + path); return (await p.locator("main").innerText()).includes("Not found"); };

const ok = (label, cond) => { console.log((cond ? "✓ " : "✗ FAIL ") + label); if (!cond) errs.push("FAIL " + label); };
async function login(email, pw = "raybon123", vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const p = await ctx.newPage();
  // pages stream in behind a loading skeleton: let each navigation finish before reading the page
  const goto = p.goto.bind(p); p.goto = async (...args) => { const r = await goto(...args); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(1000); return r; };
  p.on("pageerror", e => errs.push(email + ": " + e.message)); p.on("console", m => m.type() === "error" && !m.text().includes("404") && errs.push(email + ": " + m.text()));
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click("button"); await p.waitForURL(BASE + "/");
  return { ctx, p };
}
const navText = async (p) => (await p.locator("aside nav").first().innerText()).replace(/\n+/g, " | ");

// ---------- ACCESS CONTROL ----------
const g = await login("gaurang@raybon.local");
const nv = await navText(g.p); console.log("gaurang nav:", nv);
ok("gaurang has no helpdesk in nav", !nv.includes("Tickets"));
ok("gaurang /tickets → 404", await notFound(g.p, "/tickets"));
await g.p.goto(BASE + "/crm?owner=all&view=list");
const gIds = await g.p.locator("tbody a[href^='/crm/']").evaluateAll(as => as.map(a => a.getAttribute("href")));
const a = await login("aarti@raybon.local");
await a.p.goto(BASE + "/crm?owner=all&view=list");
const aIds = await a.p.locator("tbody a[href^='/crm/']").evaluateAll(as => as.map(a => a.getAttribute("href")));
console.log("opps visible: gaurang", gIds.length, "aarti", aIds.length);
ok("gaurang sees fewer opportunities than aarti", gIds.length > 0 && gIds.length < aIds.length);
const foreign = aIds.find(h => !gIds.includes(h));
ok("gaurang direct URL to aarti's opp → 404", await notFound(g.p, foreign));
// aarti adds gaurang as follower → now visible
await a.p.goto(BASE + foreign);
await a.p.selectOption("form:has(select[name=role]) select[name=userId]", { label: "Gaurang Doshi" });
await a.p.click("form:has(select[name=role]) button:has-text('Add')");
await a.p.locator("section:has(h3:text('Assigned & followers')) li:has-text('Gaurang Doshi')").waitFor();
ok("follower can now open it", !(await notFound(g.p, foreign)));

const r = await login("rakesh@raybon.local");
const rn = await navText(r.p); console.log("rakesh nav:", rn);
ok("rakesh has no sales in nav", !rn.includes("Opportunities"));
ok("rakesh /crm → 404", await notFound(r.p, "/crm"));
await r.p.goto(BASE + "/tickets?stage=all&view=list");
const rZones = await r.p.locator("tbody tr, ul li a[href^='/tickets/']").count();
await a.p.goto(BASE + "/tickets?stage=all&view=list");
const aT = await a.p.locator("tbody tr, ul li a[href^='/tickets/']").count();
console.log("tickets visible: rakesh", rZones, "aarti", aT);
ok("rakesh sees only a subset of tickets", rZones > 0 && rZones < aT);
await r.p.goto(BASE + "/tickets/new");
const zoneOpts = await r.p.locator("select[name=teamId] option").allTextContents();
console.log("rakesh zone options:", zoneOpts);
ok("rakesh can only pick his zone", zoneOpts.length === 2);

// ---------- HELPDESK FORM PER SPEC ----------
await a.p.goto(BASE + "/tickets/new");
await a.p.click("button:has-text('Submit complaint')"); // html validation blocks
ok("still on form after empty submit", a.p.url().endsWith("/tickets/new"));
await a.p.selectOption("select[name=teamId]", { index: 1 });
await a.p.locator("ul button").first().click();
const plantCard = await a.p.locator("text=Plant serial no.").locator("..").locator("..").innerText();
console.log("plant card:", plantCard.replace(/\n/g, " | "));
await a.p.click("button:has-text('Instrumentation')");
await a.p.click("button:text-is('High')");
await a.p.selectOption("select[name=assigneeId]", { label: "Haridutt Solanki" });
await a.p.fill("input[name=tags]", "AMC");
await a.p.fill("textarea[name=description]", "Conductivity meter on permeate line showing erratic readings.");
await a.p.click("button:has-text('Submit complaint')");
await a.p.waitForURL(/\/tickets\/\d+$/);
const tid = a.p.url().split("/").pop();
const props = await a.p.locator("select[name=stage]").locator("option").allTextContents();
console.log("ticket", tid, "stage options:", props);
ok("stages are New/In process/Awaiting/Done", JSON.stringify(props) === JSON.stringify(["New", "In process", "Awaiting", "Done"]));
ok("assigned to Haridutt", (await a.p.locator("form:has(select[name=stage]) select[name=assigneeId]").locator("option:checked").textContent()) === "Haridutt Solanki");
await a.p.screenshot({ path: `${OUT}/v7-ticket.png`, fullPage: true });
await a.p.goto(BASE + "/tickets?view=board&stage=all");
const cols = await a.p.locator(".snap-start .text-sm.font-semibold").allTextContents();
console.log("board columns:", cols);
ok("board has 4 columns", cols.length === 4);

// ---------- LEADS → OPPORTUNITY ----------
await a.p.goto(BASE + "/crm/new?kind=lead");
await a.p.fill("input[name=title]", "E2E Lead - Deepak Nitrite enquiry");
await a.p.click("button:has-text('New company')"); await a.p.fill("input[name=companyName]", "Deepak Nitrite Ltd.");
await a.p.fill("input[name=contactName]", "Mehul Shah");
await a.p.fill("input[name=product]", "ROSERVE RO Plant");
await a.p.click("button:has-text('Create')");
await a.p.waitForURL(/\/crm\/\d+$/); const lid = a.p.url().split("/").pop();
ok("lead badge shown", await a.p.locator("span:text-is('lead')").count() === 1);
await a.p.goto(BASE + "/crm/leads"); ok("appears in Leads list", await a.p.getByText("E2E Lead - Deepak Nitrite").count() === 1);
await a.p.goto(BASE + "/crm?owner=all&view=list"); ok("not in opportunities yet", await a.p.getByText("E2E Lead - Deepak Nitrite").count() === 0);
await a.p.goto(BASE + "/crm/" + lid);
await clickUntil(a.p, "button:has-text('Convert to opportunity')", "span:text-is('opportunity')"); await a.p.waitForLoadState("networkidle");
// proposal upload
await a.p.setInputFiles("input[name=files]", `${FIXTURES}/report.pdf`);
await a.p.fill("form:has(input[name=isProposal]) input[name=description]", "Techno-commercial offer Rev 0");
await a.p.click("form:has(input[name=isProposal]) button:has-text('Upload')");
await a.p.getByText("Uploaded ✓").waitFor();
await a.p.reload();
ok("proposal status → Submitted", await a.p.getByText("Proposal: Submitted").count() === 1);
ok("proposal listed", await a.p.locator("a:has-text('report.pdf')").count() >= 1);

// ---------- CALENDAR ACTIVITY ----------
await a.p.goto(BASE + "/calendar");
await a.p.click("a:has-text('Activity / visit')");
await a.p.waitForURL(/calendar\/activity/);
await a.p.click("button:has-text('Site visit')");
await a.p.fill("input[name=summary]", "E2E site visit — RO audit");
await a.p.selectOption("select[name=customerId]", { label: "Deepak Nitrite Ltd." });
await a.p.selectOption("select[name=contactId]", { label: "Mehul Shah" });
await a.p.selectOption("select[name=leadId]", { label: "E2E Lead - Deepak Nitrite enquiry" });
const day = new Date(Date.now() + 2 * 864e5 + 5.5 * 3600e3).toISOString().slice(0, 10);
await a.p.fill("input[name=dueAt]", `${day}T11:00`);
await a.p.fill("input[name=location]", "Nandesari plant");
await a.p.click("button:has-text('Add to calendar')");
await a.p.waitForURL(/\/calendar\?date=/);
const block = a.p.locator("a[href^='/activities/']:has-text('E2E site visit')").first();
await block.waitFor();
ok("activity shows on calendar with time", (await block.innerText()).includes("11:00am"));
await a.p.screenshot({ path: `${OUT}/v7-calendar.png` });
await block.click(); await a.p.waitForURL(/\/activities\/\d+$/);
await a.p.fill("textarea[name=discussion]", "• Checked RO skid\n• Membranes due for replacement");
await a.p.fill("textarea[name=outcome]", "Customer agreed to membrane replacement quote");
await a.p.fill("input[name=nextAction]", "Send membrane replacement quotation");
await a.p.fill("input[name=nextAt]", `${day}T16:00`);
await a.p.click("button:has-text('Mark done & save report')");
await a.p.getByText("Saved ✓").waitFor();
await a.p.reload();
ok("activity marked done", await a.p.locator("span:text-is('Done')").count() === 1);
await a.p.screenshot({ path: `${OUT}/v7-activity.png`, fullPage: true });
await a.p.goto(BASE + "/crm/" + lid);
ok("follow-up auto-scheduled on opportunity", await a.p.getByText("Send membrane replacement quotation").count() >= 1);
ok("visit report in opportunity history", await a.p.getByText("Customer agreed to membrane replacement quote").count() >= 1);
await a.p.screenshot({ path: `${OUT}/v7-lead.png`, fullPage: true });
await a.p.click("a:has-text('Deepak Nitrite Ltd.')"); await a.p.waitForURL(/customers\/\d+/);
await a.p.locator("h2:has-text('Activity history')").waitFor(); // the skeleton shows first, then the page
ok("visit in client timeline", await a.p.getByText("Customer agreed to membrane replacement quote").count() >= 1);
// log a completed call straight from calendar
await a.p.goto(BASE + "/calendar/activity?done=1");
await a.p.click("button:has-text('Call')");
await a.p.fill("input[name=summary]", "E2E call — PO status");
await a.p.selectOption("select[name=customerId]", { label: "Deepak Nitrite Ltd." });
await a.p.fill("textarea[name=outcome]", "PO expected next week");
await a.p.click("button:has-text('Save report')"); await a.p.waitForURL(/\/calendar\?date=/);
ok("logged call shows as done on calendar", await a.p.locator("a[href^='/activities/']:has-text('E2E call')").count() >= 1);

// ---------- SALES REPORTS ----------
await a.p.goto(BASE + "/sales-reports");
ok("sales report tiles", await a.p.getByText("Win rate").count() >= 1);
await a.p.screenshot({ path: `${OUT}/v7-sales.png`, fullPage: true });
for (const t of ["salesperson", "visits", "won"]) { await a.p.goto(BASE + "/sales-reports?tab=" + t); await a.p.waitForLoadState("networkidle"); }
ok("visit report lists our visit", await (async () => { await a.p.goto(BASE + "/sales-reports?tab=visits"); return a.p.getByText("E2E site visit").count(); })() >= 1);
await a.p.screenshot({ path: `${OUT}/v7-visits.png`, fullPage: true });
const x = await a.p.request.get(BASE + "/api/export/sales?days=90");
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await x.body());
console.log("sales xlsx:", wb.worksheets.map(w => `${w.name}:${w.rowCount}`).join(", "));
ok("sales xlsx has visit sheet", wb.worksheets.some(w => w.name === "Visit report" && w.rowCount > 1));
const pp = await a.ctx.newPage(); await pp.goto(BASE + "/print/sales?days=90"); await pp.waitForLoadState("networkidle");
ok("sales pdf renders", (await pp.pdf({ format: "A4" })).length > 10000); await pp.close();
// gaurang's report only covers his own
await g.p.goto(BASE + "/sales-reports?tab=salesperson");
const gRows = await g.p.locator("tbody tr td:first-child").allTextContents();
console.log("gaurang report people:", gRows);
ok("gaurang report has no salesperson filter", await g.p.locator("select:has(option:text('All salespeople'))").count() === 0);
ok("rakesh /sales-reports → 404", await notFound(r.p, "/sales-reports"));
ok("rakesh sales export forbidden", (await r.p.request.get(BASE + "/api/export/sales")).status() === 403);

// mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await g.ctx.storageState() });
const mp = await m.newPage(); mp.on("pageerror", e => errs.push("m: " + e.message));
await mp.goto(BASE + "/"); const bn = await mp.locator("nav.fixed, nav[class*='bottom'], div.fixed.bottom-0").first().innerText().catch(() => "");
console.log("gaurang bottom nav:", bn.replace(/\n/g, " | "));
await mp.goto(BASE + "/calendar/activity"); await mp.screenshot({ path: `${OUT}/v7-activity-m.png`, fullPage: true });
console.log("errors:", errs);
await browser.close();
if (errs.length) process.exit(1);
