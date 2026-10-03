// v1.3 — manager's second round: KPI/KRA, calendar colours, saved dashboards, reminders + AI nudges,
// templates & collateral, Enquiries inbox (website form, API, email-in, WhatsApp paste).
// Run against a COMBINED or CRM build with fresh seed data. See tests/README.md.
import { BASE, OUT, CRON_SECRET, INBOUND_SECRET, FIXTURES, launch } from "./env.mjs";
const browser = await launch();
const errs = [];
const ok = (label, cond) => { console.log((cond ? "✓ " : "✗ FAIL ") + label); if (!cond) errs.push("FAIL " + label); };
async function login(email, pw = "raybon123", vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, timezoneId: "Asia/Kolkata" });
  const p = await ctx.newPage();
  const goto = p.goto.bind(p); p.goto = async (...a) => { const r = await goto(...a); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(800); return r; };
  p.on("pageerror", (e) => errs.push(email + ": " + e.message)); p.on("console", (m) => m.type() === "error" && !/404|410/.test(m.text()) && errs.push(email + ": " + m.text()));
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click("button"); await p.waitForURL(BASE + "/");
  return { ctx, p };
}
const cron = async (path) => (await fetch(BASE + path, { headers: { authorization: `Bearer ${CRON_SECRET}` } })).json();
const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);

const A = await login("aarti@raybon.local");
const G = await login("gaurang@raybon.local");
const main = (p) => p.locator("main").innerText();

// ---------- 1. calendar colours: planned (blue) / done (green) / overdue (red)
await G.p.goto(BASE + `/calendar?view=day&date=${today}`);
const plan = G.p.locator("section:has(h2:has-text('Planner'))");
await plan.locator("input[name=summary]").fill("Call Neogen about membranes");
await plan.locator("input[type=time]").fill("00:30"); // already past → overdue
await plan.locator("button:has-text('Add to plan')").click();
await G.p.waitForTimeout(1500); await G.p.goto(BASE + `/calendar?view=day&date=${today}`);
ok("past planned item shows as overdue (red)", (await G.p.locator("[data-state=overdue]:has-text('Call Neogen about membranes')").count()) === 1);
const done = G.p.locator("section:has(h2:has-text('Work done'))");
await done.locator("input[name=summary]").fill("Called Atul purchase about antiscalant");
await done.locator("input[name=outcome]").fill("Will send PO");
await done.locator("button:has-text('Add to work done')").click();
await done.locator("li:has-text('Called Atul purchase')").waitFor();
await G.p.goto(BASE + `/calendar?view=week&date=${today}`);
ok("week view: chips coloured by state", (await G.p.locator("[data-state=done]").count()) > 0 && (await G.p.locator("[data-state=overdue]").count()) > 0);
ok("colour legend shown", (await main(G.p)).includes("Overdue — report pending"));
await G.p.screenshot({ path: `${OUT}/v13-week-colours.png` });

// ---------- 2. KPI / KRA
const AD = await login("admin@raybon.local", "admin123");
await AD.p.goto(BASE + "/kpi/setup");
ok("KPI setup lists seeded KPIs", (await main(AD.p)).includes("Customer calls") && (await main(AD.p)).includes("Collections"));
await AD.p.fill("form:has(select[name=metric]) input[name=name]", "WhatsApp follow-ups");
await AD.p.selectOption("form:has(select[name=metric]) select[name=metric]", "whatsapp");
await AD.p.fill("form:has(select[name=metric]) input[name=target]", "3");
await AD.p.click("form:has(select[name=metric]) button:has-text('Add')");
await AD.p.waitForTimeout(1200); await AD.p.goto(BASE + "/kpi/setup");
ok("admin adds a KPI", (await main(AD.p)).includes("WhatsApp follow-ups"));
await AD.p.goto(BASE + "/kpi");
const gRow = AD.p.locator("[data-testid=kpi-board] tr:has-text('Gaurang')");
const norm = async (l) => (await l.innerText()).replace(/\s+/g, " ");
ok("scoreboard counts Gaurang's logged visit automatically", /Gaurang Doshi(?: \S+ \/ \S+)* [1-9]\d* \/ 1 /.test(await norm(gRow)));
ok("admins are not on the scoreboard", !(await AD.p.locator("[data-testid=kpi-board]").innerText()).includes("Chandan"));
await AD.p.goto(BASE + "/kpi?p=monthly");
const aRow = AD.p.locator("[data-testid=kpi-board] tr:has-text('Aarti')");
await aRow.locator("button:has-text('enter')").first().click();
await aRow.locator("input[name=v]").fill("1200000");
await aRow.locator("button:has-text('Save')").click();
await AD.p.waitForTimeout(1200); await AD.p.goto(BASE + "/kpi?p=monthly");
const aText = await norm(AD.p.locator("[data-testid=kpi-board] tr:has-text('Aarti')"));
ok("manager types a hand-entered KRA (collections)", aText.includes("₹12 L / ₹50 L"));
ok("personal target override (Aarti ₹2.5 Cr)", aText.includes("/ ₹2.5 Cr"));
await AD.p.screenshot({ path: `${OUT}/v13-kpi.png`, fullPage: true });
await G.p.goto(BASE + "/kpi");
ok("salespeople see the whole team's board", (await main(G.p)).includes("Priyank") && (await main(G.p)).includes("Aarti"));
await G.p.goto(BASE + `/calendar?view=day&date=${today}`);
ok("targets strip on the salesperson's calendar day", (await G.p.locator("[data-testid=kpi-strip]").innerText()).includes("Customer calls"));

// ---------- 3. saved dashboards
await A.p.goto(BASE + "/dashboards");
await A.p.click("button:has-text('Create sales overview')");
await A.p.waitForURL(/dashboards\?d=\d+/); await A.p.waitForTimeout(800);
ok("starter dashboard has charts", (await A.p.locator("[data-testid=dashboard-grid] section").count()) >= 6);
await A.p.click("a:has-text('Edit dashboard')"); await A.p.waitForTimeout(800);
const wf = A.p.locator("[data-testid=widget-form]");
await wf.locator("select[name=metric]").selectOption("visits");
await wf.locator("select[name=chart]").selectOption("bar");
await wf.locator("select[name=groupBy]:not([disabled])").selectOption("owner");
await wf.locator("select[name=range]").selectOption("all");
await wf.locator("button:has-text('Add chart')").click();
await A.p.waitForTimeout(1500); await A.p.reload(); await A.p.waitForTimeout(800);
ok("added a custom chart", (await main(A.p)).includes("Site visits by salesperson"));
await A.p.locator("label:has-text('Share with the sales team') input").check(); await A.p.waitForTimeout(1200);
await A.p.click("a:has-text('Done editing')"); await A.p.waitForTimeout(600);
await A.p.screenshot({ path: `${OUT}/v13-dashboard.png`, fullPage: true });
await G.p.goto(BASE + "/dashboards");
ok("shared dashboard visible to others (read-only, can copy)", (await main(G.p)).includes("Sales overview") && (await G.p.locator("button:has-text('Copy to my dashboards')").count()) === 1);

// ---------- 4. reminder from the manager → salesperson's bell + calendar
await A.p.goto(BASE + "/crm?owner=all&view=list");
const oppHref = await A.p.locator("tbody tr a[href^='/crm/']").first().getAttribute("href");
await A.p.goto(BASE + oppHref);
const rf = A.p.locator("[data-testid=reminder-form]");
await rf.locator("select[name=userId]").selectOption({ label: "Gaurang Doshi" });
await rf.locator("input[name=message]").fill("Please call them about the revised offer today");
await rf.locator("button:has-text('Remind')").click();
await rf.locator("text=Reminder sent to Gaurang").waitFor({ timeout: 8000 });
ok("manager sends a reminder", true);
await G.p.goto(BASE + "/");
ok("bell shows unread", Number((await G.p.locator("[data-testid=bell] span").first().innerText().catch(() => "0")) || 0) > 0);
await G.p.goto(BASE + "/notifications");
ok("reminder in salesperson's notifications", (await main(G.p)).includes("Please call them about the revised offer today"));
await G.p.goto(BASE + `/calendar?view=day&date=${today}`);
ok("reminder also planned in their calendar", (await main(G.p)).includes("Please call them about the revised offer today"));

// ---------- 5. AI nudges (morning cron)
const nd = await cron("/api/cron/nudges");
console.log("nudges:", nd);
ok("nudge cron creates suggestions", nd.created > 0);
ok("nudge cron needs the secret", (await fetch(BASE + "/api/cron/nudges")).status === 401);
const again = await cron("/api/cron/nudges");
ok("same suggestion isn't repeated the same day", again.created === 0);
await A.p.goto(BASE + "/notifications?f=nudge");
ok("suggestions carry WhatsApp / Email / Log buttons", (await A.p.locator("[data-kind=nudge] a[href^='https://wa.me/']").count()) > 0 && (await A.p.locator("[data-kind=nudge] a:has-text('Log it')").count()) > 0);
await A.p.screenshot({ path: `${OUT}/v13-nudges.png`, fullPage: true });
await A.p.goto(BASE + "/");
ok("dashboard shows 'For you today'", (await main(A.p)).includes("For you today"));

// ---------- 6. templates & collateral → send from opportunity
await A.p.goto(BASE + "/templates?tab=collateral");
await A.p.setInputFiles("[data-testid=collateral-upload] input[name=files]", `${FIXTURES}/report.pdf`);
await A.p.fill("[data-testid=collateral-upload] input[name=description]", "450 KLD ZLD — pharma, Dahej");
await A.p.click("[data-testid=collateral-upload] button:has-text('Upload')");
await A.p.waitForTimeout(1500); await A.p.goto(BASE + "/templates?tab=collateral");
ok("case study uploaded to the collateral box", (await main(A.p)).includes("report.pdf"));
await A.p.goto(BASE + "/templates?tab=whatsapp");
const tf = A.p.locator("[data-testid=template-form-whatsapp]");
await tf.locator("input[name=name]").fill("Festival wishes");
await tf.locator("textarea[name=body]").fill("Dear {{contact}}, warm Diwali wishes from all of us at Raybon! — {{salesperson}}");
await tf.locator("button:has-text('Add template')").click();
await A.p.waitForTimeout(1200); await A.p.goto(BASE + "/templates?tab=whatsapp");
ok("WhatsApp template added", (await main(A.p)).includes("Festival wishes"));
await A.p.goto(BASE + oppHref);
const send = A.p.locator("#send");
await send.locator("select[aria-label='WhatsApp template']").selectOption({ label: "Ad / promotion · ZLD case study" });
await send.locator("select[aria-label='Attach case study or brochure']").selectOption({ label: "report.pdf" });
await A.p.waitForTimeout(1500);
const waMsg = await send.locator("textarea[aria-label='WhatsApp message']").inputValue();
ok("template filled with the contact + share link", !waMsg.includes("{{") && /\/s\/[\w.-]+/.test(waMsg));
const link = waMsg.match(/https?:\/\/\S+\/s\/[\w.-]+/)?.[0]?.replace(/^https?:\/\/[^/]+/, BASE);
ok("share link downloads without signing in", link ? (await fetch(link)).status === 200 : false);
ok("bad share link is refused", (await fetch(BASE + "/s/not-a-token")).status === 410);
const [popup] = await Promise.all([A.p.waitForEvent("popup").catch(() => null), send.locator("button:has-text('Open in WhatsApp')").click()]);
ok("opens WhatsApp in a new tab", !!popup);
await popup?.close();
await send.locator("text=Logged on the opportunity").waitFor({ timeout: 8000 });
await send.locator("button:has-text('Email')").click();
await send.locator("select[aria-label='Email template']").selectOption({ label: "Follow-up · Quotation follow-up" });
await send.locator("input[aria-label=To]").fill("buyer@customer.example");
await send.locator("label:has-text('report.pdf') input").check();
await send.locator("button:has-text('Send from CRM')").click();
await send.locator("text=logged on the opportunity").waitFor({ timeout: 10000 });
await A.p.reload(); await A.p.waitForTimeout(800);
const hist = await A.p.locator("section:has(h2:text('History'))").innerText();
ok("WhatsApp + email logged in the opportunity history", hist.includes("WhatsApp:") && hist.includes("Email: Our offer for"));
await A.p.screenshot({ path: `${OUT}/v13-send.png`, fullPage: true });

// ---------- 7. enquiries: website form, API, email, WhatsApp paste
const anon = await browser.newContext({ viewport: { width: 420, height: 900 } });
const w = await anon.newPage();
await w.goto(BASE + "/enquiry"); await w.waitForLoadState("networkidle");
await w.fill("input[name=name]", "Neha Shah");
await w.fill("input[name=company]", "Kalpataru Pharma");
await w.fill("input[name=phone]", "9825012345");
await w.selectOption("select[name=product]", "Effluent treatment (ETP)");
await w.fill("textarea[name=message]", "Need a 200 KLD ETP for our new API block at Jhagadia.");
await w.click("button:has-text('Send enquiry')");
await w.locator("[data-testid=enquiry-thanks]").waitFor();
ok("public website form works without login", true);
await w.screenshot({ path: `${OUT}/v13-web-form.png` });
await w.goto(BASE + "/enquiry?embed=1"); ok("embeddable form", (await w.locator("form button:has-text('Send enquiry')").count()) === 1);
const api = await fetch(BASE + "/api/enquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Website API", email: "api@lead.example", message: "From the site's own contact form", product: "RO" }) });
ok("website API accepts enquiries", api.status === 200 && (await api.json()).ok);
const mail = { from: "Anil Verma <anil@sunrise-textiles.example>", to: "sales@raybonchemicals.com", subject: "Enquiry for 100 KLD RO", text: "Hi, we need an RO plant for 100 KLD. Please send a budgetary offer.", messageId: "<abc-123@sunrise>" };
const post = () => fetch(BASE + "/api/inbound-email", { method: "POST", headers: { "content-type": "application/json", "x-inbound-secret": INBOUND_SECRET }, body: JSON.stringify(mail) }).then((r) => r.json());
const m1 = await post(), m2 = await post();
ok("email to sales@ becomes an enquiry", m1.enquiryId > 0);
ok("the same email isn't imported twice", m2.duplicate === true);
await A.p.goto(BASE + "/enquiries");
const inbox = await main(A.p);
ok("inbox shows website, API and email enquiries", inbox.includes("Kalpataru Pharma") && inbox.includes("Website API") && inbox.includes("Enquiry for 100 KLD RO"));
ok("existing customer recognised", inbox.includes("Existing customer: Neogen"));
await A.p.screenshot({ path: `${OUT}/v13-enquiries.png`, fullPage: true });
await A.p.fill("[data-testid=enquiry-paste] textarea", "[11:02 am] Sanjay Desai: Hi, this is Sanjay from Meghmani Organics. We need MEE for 80 KLD at Dahej. My email sanjay@meghmani.example, call 98980 12345");
await A.p.click("[data-testid=enquiry-paste] button:has-text('Add enquiry')");
await A.p.waitForURL(/enquiries\?open=\d+/); await A.p.waitForTimeout(800);
const pasted = A.p.locator("li.ring-2");
ok("WhatsApp chat pasted → enquiry with number + email picked out", (await pasted.innerText()).includes("98980 12345") && (await pasted.innerText()).includes("sanjay@meghmani.example"));
await pasted.locator("button:has-text('Create lead')").click();
await A.p.waitForURL(/\/crm\/\d+$/); await A.p.waitForTimeout(800);
ok("enquiry → lead in one click", /\/crm\/\d+$/.test(A.p.url()) && (await main(A.p)).toLowerCase().includes("sanjay"));
await A.p.goto(BASE + "/enquiries");
const neo = A.p.locator("li:has-text('RO membranes — replacement quote')");
await neo.locator("select[name=leadId]").selectOption({ index: 1 });
await neo.locator("button:has-text('Add')").click();
await A.p.waitForTimeout(1500); await A.p.goto(BASE + "/enquiries?s=done");
ok("enquiry added to an existing opportunity", (await main(A.p)).includes("Added to:") && (await main(A.p)).includes("Turned into a lead:"));
await A.p.goto(BASE + "/enquiries/share?text=" + encodeURIComponent("Hello need RO 20 KLD — Patel Foods, 9876543210"));
ok("Android share target pre-fills the chat", (await A.p.locator("[data-testid=enquiry-paste] textarea").inputValue()).includes("Patel Foods"));

// ---------- 8. settings
await AD.p.goto(BASE + "/settings");
const st = await main(AD.p);
ok("settings: AI suggestions, enquiry routing, email-in status", st.includes("AI follow-up suggestions") && st.includes("New enquiries go to") && st.includes("Email in"));

// ---------- mobile
const M = await login("gaurang@raybon.local", "raybon123", { width: 390, height: 844 });
await M.p.goto(BASE + "/notifications"); await M.p.screenshot({ path: `${OUT}/v13-notifications-mobile.png`, fullPage: true });
await M.p.goto(BASE + "/kpi"); await M.p.screenshot({ path: `${OUT}/v13-kpi-mobile.png`, fullPage: true });

console.log("errors:", errs);
await browser.close();
if (errs.length) process.exit(1);
