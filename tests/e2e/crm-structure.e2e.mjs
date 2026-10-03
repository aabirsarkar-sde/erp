// v1.4 — Raybon structure & "Salesforce" round: stages editor, sites, trials, orders, playbooks, scoring,
// forecast, CEO dashboard, customer 360 timeline, handover, email capture (BCC / forward).
// Run against a COMBINED or CRM build with fresh seed data. See tests/README.md.
import { BASE, OUT, INBOUND_SECRET, launch } from "./env.mjs";
const browser = await launch();
const errs = [];
const ok = (label, cond) => { console.log((cond ? "✓ " : "✗ FAIL ") + label); if (!cond) errs.push("FAIL " + label); };
async function login(email, pw = "raybon123") {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Kolkata" });
  const p = await ctx.newPage();
  const goto = p.goto.bind(p); p.goto = async (...a) => { const r = await goto(...a); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(800); return r; };
  p.on("pageerror", (e) => errs.push(email + ": " + e.message)); p.on("console", (m) => m.type() === "error" && !/404|410/.test(m.text()) && errs.push(email + ": " + m.text()));
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click("button"); await p.waitForURL(BASE + "/");
  return p;
}
const A = await login("aarti@raybon.local");
const AD = await login("admin@raybon.local", "admin123");
const main = (p) => p.locator("main").innerText();

// ---------- stages editor
await AD.goto(BASE + "/settings");
await AD.click("[data-testid=stages] button:has-text('Add the suggested stages')");
await AD.waitForTimeout(1200); await AD.goto(BASE + "/settings");
const stagesText = await AD.locator("[data-testid=stages]").innerText();
const stageNames = await AD.locator("[data-testid=stages] input[name=name]").evaluateAll((xs) => xs.map((x) => x.value));
ok("suggested Raybon stages added", ["Enquiry", "Technical evaluation", "Trial", "Quotation", "Negotiation"].every((n) => stageNames.includes(n)));
const trialRow = AD.locator("[data-testid=stages] li:has(input[value='Trial'])");
await trialRow.locator("input[name=name]").fill("Trial / pilot");
await trialRow.locator("button:has-text('Save')").click();
await AD.waitForTimeout(1000); await AD.goto(BASE + "/settings");
ok("stage renamed", (await AD.locator("[data-testid=stages] input[name=name]").evaluateAll((xs) => xs.map((x) => x.value))).includes("Trial / pilot"));
void stagesText;

// ---------- customer 360: sites, stats, timeline
await A.goto(BASE + "/customers");
await A.click("a:has-text('Neogen Chemicals Ltd.')"); await A.waitForURL(/customers\/\d+/); await A.waitForTimeout(800);
const custUrl = A.url();
ok("customer stats strip", (await A.locator("[data-testid=customer-stats]").innerText()).includes("Open pipeline"));
ok("customer timeline merges trials, activities, notes", /Water analysis/.test(await A.locator("[data-testid=customer-timeline]").innerText()));
ok("sites listed with applications", (await A.locator("[data-testid=sites]").innerText()).includes("Dahej unit") && (await A.locator("[data-testid=sites]").innerText()).includes("Cooling tower blowdown"));
await A.fill("[data-testid=sites] input[aria-label='Site name']", "Jhagadia new block");
await A.fill("[data-testid=sites] input[aria-label=Applications]", "Brine clarification, ETP");
await A.click("[data-testid=sites] button:has-text('Add site')");
await A.waitForTimeout(1000); await A.goto(custUrl);
ok("site added", (await A.locator("[data-testid=sites]").innerText()).includes("Jhagadia new block"));
await A.screenshot({ path: `${OUT}/v14-customer-360.png`, fullPage: true });

// ---------- opportunity: site/application, trial, score
await A.goto(BASE + "/crm?owner=all&view=list");
const neoHref = await A.locator("a:has-text('Neogen Chemicals - Rishi Belle')").first().getAttribute("href");
const neoId = neoHref.split("/").pop();
await A.goto(BASE + neoHref);
ok("opportunity shows application + site", (await main(A)).includes("for RO reject") && (await main(A)).includes("at Dahej unit"));
ok("opportunity score badge", (await A.locator("[data-testid=score]").first().innerText()).startsWith("Score"));
const tf = A.locator("[data-testid=trial-form]");
await tf.locator("input[aria-label=Kind]").fill("Jar test");
await tf.locator("input[aria-label=Product]").fill("Antiscalant RX-200");
await tf.locator("select[aria-label=Status]").selectOption("success");
await tf.locator("input[aria-label=Result]").fill("Scaling stopped at 4 ppm");
await tf.locator("button:has-text('Add')").click();
await A.waitForTimeout(1200); await A.goto(BASE + neoHref);
ok("trial recorded + in history", (await main(A)).includes("Antiscalant RX-200") && (await main(A)).includes("Scaling stopped at 4 ppm"));

// ---------- email capture: BCC to the sales mailbox with [OPP-id]; internal-only mail ignored
const post = (m) => fetch(BASE + "/api/inbound-email", { method: "POST", headers: { "content-type": "application/json", "x-inbound-secret": INBOUND_SECRET }, body: JSON.stringify(m) }).then((r) => r.json());
const cap = await post({ from: "Aarti Patil <aarti@raybon.local>", to: "rishi@neogenchem.example, sales@raybonchemicals.com", subject: `Revised DTRO offer [OPP-${neoId}]`, text: "Dear Rishi,\nPlease find the revised DTRO offer attached.\nRegards, Aarti", messageId: "<bcc-1@raybon>" });
ok("staff BCC is captured on the opportunity, not an enquiry", cap.captured > 0 && !cap.enquiryId);
const capAgain = await post({ from: "Aarti Patil <aarti@raybon.local>", to: "rishi@neogenchem.example, sales@raybonchemicals.com", subject: `Revised DTRO offer [OPP-${neoId}]`, text: "x", messageId: "<bcc-1@raybon>" });
ok("same email isn't captured twice", capAgain.duplicate === true);
const internal = await post({ from: "Aarti Patil <aarti@raybon.local>", to: "gaurang@raybon.local, sales@raybonchemicals.com", subject: "Lunch?", text: "internal", messageId: "<int-1@raybon>" });
ok("internal-only mail is ignored", !!internal.ignored);
const fwd = await post({ from: "Gaurang Doshi <gaurang@raybon.local>", to: "sales@raybonchemicals.com", subject: "FW: Enquiry for evaporator", text: "---------- Forwarded message ---------\nFrom: Paresh Shah <paresh@newco-pharma.example>\nSubject: Enquiry for evaporator\n\nWe need a 40 KLD MEE.", messageId: "<fwd-1@raybon>" });
ok("forwarded mail from an unknown customer becomes an enquiry", fwd.enquiryId > 0);
await A.goto(BASE + neoHref);
ok("captured email in the opportunity history", (await A.locator("section:has(h2:has-text('History'))").innerText()).includes("Sent: Revised DTRO offer"));
await A.goto(custUrl);
ok("…and in the customer timeline", (await A.locator("[data-testid=customer-timeline]").innerText()).includes("Revised DTRO offer"));

// ---------- playbooks: membrane enquiry creates the task chain; stage playbook on quotation stage
await A.goto(BASE + "/playbooks");
ok("seeded playbooks listed", (await main(A)).includes("Membrane enquiry") && (await main(A)).includes("Quotation follow-up"));
await A.goto(BASE + "/crm");
await A.click("button:has-text('Quick add')");
await A.fill("input[placeholder='Company *']", "GNFC Bharuch");
await A.fill("input[name=product]", "Replacement RO membranes");
await A.fill("input[name=expectedRevenue]", "3800000");
await A.click("button:has-text('Add opportunity')");
await A.waitForURL(/\/crm\/\d+$/); await A.waitForTimeout(1000);
const gUrl = A.url();
ok("membrane playbook added its steps as tasks", (await main(A)).includes("Get water analysis from GNFC Bharuch") && (await main(A)).includes("Membrane selection & projection"));
ok("playbook noted in history", (await main(A)).includes('Playbook "Membrane enquiry"'));
await A.click("form button:text-is('Qualified - Quotation sent')");
await A.waitForTimeout(1500); await A.goto(gUrl);
ok("entering the quotation stage planned the follow-up calls", (await main(A)).includes("Confirm GNFC Bharuch received the quotation"));

// ---------- won → order with PO
await A.click("[data-testid=won]");
await A.fill("input[aria-label='PO number']", "GNFC/PO/7781");
await A.fill("input[aria-label='Order value']", "3650000");
await A.click("button:has-text('Mark as won')");
await A.waitForTimeout(1500); await A.goto(gUrl);
ok("won with order recorded", (await main(A)).includes("Order GNFC/PO/7781") && /Won in \d+ days/.test(await main(A)));
await A.screenshot({ path: `${OUT}/v14-opportunity.png`, fullPage: true });

// ---------- forecast
await A.goto(BASE + "/forecast");
const tiles = await A.locator("[data-testid=forecast-tiles]").innerText();
ok("forecast shows won / commit / best case / weighted", tiles.includes("Won (orders)") && tiles.includes("₹36.5 L") && tiles.includes("Weighted pipeline"));
ok("forecast table by salesperson", (await A.locator("[data-testid=forecast-table] tbody tr").count()) > 0);
await A.goto(BASE + "/forecast?p=fy&g=segment");
ok("forecast by business line", (await A.locator("[data-testid=forecast-table]").innerText()).includes("Water treatment"));
await A.screenshot({ path: `${OUT}/v14-forecast.png`, fullPage: true });

// ---------- CEO dashboard + score sorting
await A.goto(BASE + "/dashboards");
await A.click("button:has-text('Create ceo view')");
await A.waitForURL(/dashboards\?d=\d+/); await A.waitForTimeout(1000);
const dash = await main(A);
ok("CEO view board", (await A.locator("[data-testid=dashboard-grid] section").count()) >= 10 && dash.includes("Quotations pending") && dash.includes("Overdue follow-ups") && dash.includes("Sales funnel"));
await A.screenshot({ path: `${OUT}/v14-ceo.png`, fullPage: true });
await A.goto(BASE + "/crm?owner=all&view=list&sort=score");
const sc = (await A.locator("[data-testid=score]").allInnerTexts()).map(Number);
ok("pipeline sorted by score", sc.length > 5 && sc.every((v, i) => i === 0 || sc[i - 1] >= v));
await A.goto(BASE + "/enquiries?sort=score");
ok("enquiries carry a score", (await A.locator("[data-testid=score]").count()) > 0);

// ---------- handover
await AD.goto(BASE + "/settings");
await AD.locator("li:has-text('priyank@raybon.local') a:has-text('Hand over')").click();
await AD.waitForURL(/handover\?from=\d+/); await AD.waitForTimeout(600);
await AD.selectOption("select[name=toId]", { label: "Gaurang Doshi" });
await AD.click("button:has-text('Hand over')");
await AD.locator("[data-testid=handover-done]").waitFor();
ok("handover moves deals and open work", /Done — [1-9]\d* deal\(s\)/.test(await AD.locator("[data-testid=handover-done]").innerText()));
await AD.goto(BASE + "/crm?owner=all&view=list");
ok("no open deals left with Priyank", !(await AD.locator("main table tbody").first().innerText()).includes("Priyank Patel"));

// ---------- settings: capture section
await AD.goto(BASE + "/settings");
ok("email capture settings", (await AD.locator("[data-testid=capture-settings]").innerText()).includes("BCC"));

console.log("errors:", errs);
await browser.close();
if (errs.length) process.exit(1);
