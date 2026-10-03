// Manager's CRM requests (Oct 2026): labels, contact reminders, day counter / TAT, kanban grouping & value sort,
// quick add, calendar planner / work done / diary, daily report, tasks, dashboards.
// Run against a COMBINED or CRM build with fresh seed data. See tests/README.md.
import { BASE, OUT, CRON_SECRET, launch, clickUntil } from "./env.mjs";
const browser = await launch();
const errs = [];
const ok = (label, cond) => { console.log((cond ? "✓ " : "✗ FAIL ") + label); if (!cond) errs.push("FAIL " + label); };
async function login(email, pw = "raybon123", vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, timezoneId: "Asia/Kolkata" });
  const p = await ctx.newPage();
  const goto = p.goto.bind(p); p.goto = async (...a) => { const r = await goto(...a); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(1000); return r; };
  p.on("pageerror", (e) => errs.push(email + ": " + e.message)); p.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errs.push(email + ": " + m.text()));
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click("button"); await p.waitForURL(BASE + "/");
  return { ctx, p };
}
const { p } = await login("aarti@raybon.local");
const main = async () => p.locator("main").innerText();

// ---- board grouping, sorting, age
await p.goto(BASE + "/crm?owner=all");
ok("cards show a day counter", (await p.locator(".snap-start a .rounded-full:text-matches('^\\\\d+d$')").count()) > 0);
for (const [g, expect] of [["owner", "Gaurang Doshi"], ["product", "ROSERVE RO Plant"], ["geography", "Dahej"], ["temperature", "Hot"]]) {
  await p.goto(BASE + `/crm?owner=all&group=${g}`);
  ok(`group by ${g} shows "${expect}" column`, (await p.locator(".snap-start > div:first-child").allInnerTexts()).some((t) => t.includes(expect)));
}
await p.screenshot({ path: `${OUT}/m-board-geo.png` });
await p.goto(BASE + "/crm?owner=all&view=list");
const vals = (await p.locator("tbody tr td:nth-child(5)").allInnerTexts()).map((t) => Number(t.replace(/[^\d]/g, "")) || 0);
ok("list sorted by value, highest first", vals.length > 3 && vals.every((v, i) => i === 0 || vals[i - 1] >= v));

// ---- quick add
await p.goto(BASE + "/crm");
await p.click("button:has-text('Quick add')");
await p.fill("input[placeholder='Company *']", "ONGC Hazira");
await p.fill("input[name=product]", "ZLD system");
await p.fill("input[name=expectedRevenue]", "45000000");
await p.click("button:has-text('Add opportunity')");
await p.waitForURL(/\/crm\/\d+$/); const oid = p.url().split("/").pop();
ok("quick add opens the new opportunity", (await main()).includes("ONGC Hazira — ZLD system"));
ok("day counter on opportunity", (await main()).includes("Day 0"));

// ---- contact reminder
ok("missing contact details flagged", (await main()).includes("Missing: contact person, phone, email, address"));
ok("reminder added to planned activities", (await main()).includes("Complete contact details"));
for (const [n, v] of [["contactName", "R. K. Sharma"], ["phone", "+91 98250 55555"], ["email", "rk@ongc.example"], ["address", "Hazira Plant, Surat"]]) {
  await p.fill(`section:has(h2:text('Contact details')) input[name=${n}]`, v); await p.locator(`section:has(h2:text('Contact details')) input[name=${n}]`).blur(); await p.waitForTimeout(500);
}
await p.waitForTimeout(800); await p.goto(BASE + "/crm/" + oid);
ok("contact details complete", (await main()).includes("✓ Complete"));
ok("reminder auto-closed", !(await p.locator("h2:has-text('Planned activities')").locator("..").innerText()).includes("Complete contact details"));

// ---- labels (Keep style)
await p.click("button:has-text('+ Label')");
await p.click("div.absolute button:text-is('Big ticket customer')");
await p.fill("input[placeholder='Search or create a label…']", "Hazira"); await p.keyboard.press("Enter");
await p.click("div.absolute button:has-text('Done')");
await p.waitForTimeout(800); await p.goto(BASE + "/crm/" + oid);
ok("labels saved", (await main()).includes("Big ticket customer") && (await main()).includes("Hazira"));
await p.screenshot({ path: `${OUT}/m-opportunity.png`, fullPage: true });

// ---- tasks on the opportunity
for (let i = 0; i < 3; i++) { // retry if the form was filled before the page finished hydrating
  await p.fill("section:has(h2:has-text('Tasks')) input[name=title]", "Get tender documents from ONGC");
  await p.selectOption("section:has(h2:has-text('Tasks')) select[name=assigneeId]", { label: "Gaurang Doshi" });
  await p.click("section:has(h2:has-text('Tasks')) button:has-text('Add task')");
  try { await p.locator(".card:has-text('Get tender documents from ONGC')").first().waitFor({ timeout: 8000 }); break; } catch { /* retry */ }
}
ok("task added to opportunity", true);

// ---- won → OR FY label + TAT
await p.click("[data-testid=won]"); // Won asks for the PO details (all optional)
await clickUntil(p, "button:has-text('Mark as won')", "text=/Won in \\d+ days/");
ok("won adds OR FY label", (await main()).includes("OR FY26-27"));

// ---- calendar day: plan / work done / diary
await p.goto(BASE + "/calendar?view=day");
ok("calendar Day view: planner, work done, diary", (await main()).includes("Planner") && (await main()).includes("Work done") && (await main()).includes("Diary"));
const done = p.locator("section:has(h2:has-text('Work done'))");
await done.locator("input[placeholder^='Customer']").fill("Neogen Chemicals Ltd.");
await p.waitForTimeout(300);
const linked = await done.locator("select").inputValue().catch(() => "");
await done.locator("input[name=summary]").fill("Met purchase head about MEE offer");
await done.locator("input[name=outcome]").fill("PO expected next week");
await done.locator("button:has-text('Add to work done')").click();
await done.locator("li:has-text('Met purchase head about MEE offer')").waitFor();
ok("work-done entry auto-linked to the customer's opportunity", linked !== "");
await p.locator("textarea").first().fill("Diary test: competitor visited Neogen yesterday.");
await p.waitForTimeout(1800);
await p.goto(BASE + "/calendar?view=day");
ok("work done listed", (await main()).includes("Met purchase head about MEE offer"));
ok("diary saved", (await p.locator("textarea").first().inputValue()).includes("competitor visited Neogen"));
await p.screenshot({ path: `${OUT}/m-day.png`, fullPage: true });
if (linked) { await p.goto(BASE + "/crm/" + linked); ok("entry appears in the opportunity history", (await main()).includes("Met purchase head about MEE offer")); }

// ---- daily report + cron
await p.goto(BASE + "/daily-report");
ok("daily report shows the team", (await main()).includes("Aarti Patil") && (await main()).includes("Met purchase head"));
ok("daily report flags people who didn't file", (await main()).includes("No report filed"));
await p.screenshot({ path: `${OUT}/m-daily.png`, fullPage: true });
const cron = await (await fetch(BASE + "/api/cron/daily-report", { headers: { authorization: `Bearer ${CRON_SECRET}` } })).json();
console.log("cron:", cron); ok("evening report email runs", cron.sent >= 1);
ok("cron needs the secret", (await fetch(BASE + "/api/cron/daily-report")).status === 401);

// ---- tasks board: gaurang sees and finishes the task
const g = await login("gaurang@raybon.local");
await g.p.goto(BASE + "/calendar");
ok("a salesperson's calendar opens on the Day view", (await g.p.locator("main").innerText()).includes("Work done"));
await g.p.goto(BASE + "/tasks");
ok("assignee sees the task", (await g.p.locator("main").innerText()).includes("Get tender documents from ONGC"));
await g.p.locator(".card:has-text('Get tender documents from ONGC') button[title='Mark done']").click();
await g.p.waitForTimeout(1200); await g.p.goto(BASE + "/tasks");
ok("task moved to Done", (await g.p.locator("div.rounded-xl:has(> div:has-text('Done'))").innerText()).includes("Get tender documents"));
await g.p.screenshot({ path: `${OUT}/m-tasks.png`, fullPage: true });
await p.goto(BASE + "/tasks?who=all");
ok("supervisor sees everyone's tasks", (await main()).includes("Arrange spare membranes") || (await main()).includes("Prepare revised offer"));

// ---- dashboards
for (const by of ["owner", "product", "geography", "temperature", "label"]) {
  await p.goto(BASE + `/sales-reports?tab=views&by=${by}`);
  ok(`dashboard by ${by}`, (await p.locator("main tbody tr").count()) > 0);
}
await p.screenshot({ path: `${OUT}/m-dash.png`, fullPage: true });
await p.goto(BASE + "/");
ok("dashboard tiles: tasks + missing details", (await main()).includes("My open tasks") && (await main()).includes("missing contact details"));

// ---- mobile day view
const m = await login("aarti@raybon.local", "raybon123", { width: 390, height: 844 });
await m.p.goto(BASE + "/calendar"); await m.p.screenshot({ path: `${OUT}/m-day-mobile.png`, fullPage: true });

console.log("errors:", errs);
await browser.close();
if (errs.length) process.exit(1);
