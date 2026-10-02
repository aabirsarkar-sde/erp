// Helpdesk flows: complaint from calendar, canned reply, transfer, email ticket + inbound reply,
// close with signature & TAT, dashboard views, Excel/PDF exports, public portal, escalation cron.
// Run against a helpdesk (or combined) build with fresh seed data. See tests/README.md.
import ExcelJS from "exceljs";
import { BASE, OUT, INBOUND_SECRET, CRON_SECRET, launch } from "./env.mjs";
const browser = await launch();
const errs = [];
async function login(email, pw, vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const p = await ctx.newPage();
  // pages stream in and then hydrate: let each navigation settle before clicking
  const goto = p.goto.bind(p); p.goto = async (...args) => { const r = await goto(...args); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(1000); return r; };
  p.on("pageerror", e => errs.push(email + ": " + e.message)); p.on("console", m => m.type() === "error" && errs.push(email + ": " + m.text()));
  await p.goto(BASE + "/login"); await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw); await p.click("button"); await p.waitForURL(BASE + "/");
  return { ctx, p };
}
const { ctx, p } = await login("aarti@raybon.local", "raybon123");

// ---- complaint from calendar
await p.goto(BASE + "/calendar");
await p.locator("a[href^='/tickets/new?date=']").first().click();
await p.waitForURL(/\/tickets\/new\?date=/);
console.log("date prefilled:", await p.inputValue("input[name=reportedAt]"));
// validation: submit empty
await p.click("button:has-text('Submit complaint')");
await p.waitForTimeout(400);
await p.fill("input[placeholder^='Type plant no']", "PLT-00");
await p.locator("ul button").first().click();
console.log("plant picked:", (await p.locator("text=Company name").first().locator("..").textContent()).slice(0, 80));
await p.click("button:has-text('Mechanical')");
await p.fill("textarea[name=description]", "HP pump bearing noisy, vibration high since morning. Plant running at 60%.");
await p.selectOption("select[name=assigneeId]", { label: "Aarti Patil" });
await p.click("summary:has-text('Reported by')");
await p.fill("input[name=complainantName]", "Ramesh Patel");
await p.fill("input[name=complainantPhone]", "+91 98250 11111");
await p.fill("input[name=complainantEmail]", "ramesh@customer.com");
await p.click("button:has-text('Submit complaint')");
await p.waitForURL(/\/tickets\/\d+$/); const tUrl = p.url(); const tid = tUrl.split("/").pop();
console.log("ticket:", tUrl, await p.locator("h1").textContent());
console.log("followers:", await p.locator("h3:has-text('Followers') + ul li").count());
await p.screenshot({ path: `${OUT}/hd-ticket.png`, fullPage: true });

// calendar shows it
await p.goto(BASE + "/calendar"); console.log("on calendar:", await p.locator(`a[href='/tickets/${tid}']`).count());

// canned reply
await p.goto(tUrl);
await p.selectOption("select:has(option:text('Canned reply…'))", { label: "Engineer assigned — visit scheduled" });
console.log("canned filled:", (await p.inputValue("textarea[name=body]")).slice(0, 30));
await p.click("button:has-text('Send reply')"); await p.getByText("Emailed to").first().waitFor();

// transfer
await p.click("button:has-text('Transfer')");
await p.selectOption("select[name=toUserId]", { label: "Rakesh Shah" });
await p.fill("textarea[name=reason]", "Rakesh is at Dahej this week");
await p.click("button:has-text('Transfer & notify')"); await p.getByText("to Rakesh Shah — Rakesh is at Dahej").waitFor();
console.log("transferred ✓");

// email ticket
await p.click("button:has-text('Email ticket')");
await p.fill("input[name=to]", "service.head@rochem.example, bad-address");
await p.click("form:has(input[name=to]) button:has-text('Send')"); await p.getByText("Sent to 1 recipient").waitFor();
console.log("emailed ✓");
await p.click("a:has-text('Email thread')"); await p.waitForURL(/view=mail/);
console.log("mail thread items:", await p.locator("ol > li").count());

// inbound reply from HO threads in
const r = await p.request.post(BASE + "/api/inbound-email", { headers: { "x-inbound-secret": INBOUND_SECRET }, data: { from: "Service Head <service.head@rochem.example>", subject: `Re: [TKT-${String(tid).padStart(4, "0")}] Mechanical`, text: "Please prioritise, customer is critical.\n\nOn Mon, x wrote:\n> old" } });
console.log("inbound:", await r.json());
await p.reload(); console.log("HO reply visible:", await p.getByText("Please prioritise").count());

// close with signature
await p.goto(tUrl);
await p.click("button:has-text('Mark done')");
await p.fill("textarea[name=note]", "Replaced bearing, vibration normal.");
const box = await p.locator("canvas").boundingBox();
await p.mouse.move(box.x + 20, box.y + 60); await p.mouse.down(); await p.mouse.move(box.x + 120, box.y + 30, { steps: 8 }); await p.mouse.move(box.x + 220, box.y + 80, { steps: 8 }); await p.mouse.up();
await p.click("button:has-text('Done & stamp TAT')"); await p.getByText("Done — TAT").first().waitFor();
console.log("TAT badge:", await p.locator("span:has-text('TAT ')").first().textContent());
console.log("signature shown:", await p.locator("img[alt=Signature]").count());
await p.screenshot({ path: `${OUT}/hd-closed.png`, fullPage: true });


// ---- dashboard
await p.goto(BASE + "/helpdesk");
for (const v of ["By zone", "By geography", "By employee", "By plant"]) { await p.click(`a:has-text('${v}')`); await p.waitForTimeout(600); console.log(v, "→", (await p.locator("p:has-text('📌')").textContent().catch(() => "")).slice(0, 90)); }
await p.click("a:has-text('By type')"); await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/hd-dashboard.png`, fullPage: true });

// exports
for (const u of ["/api/export/tickets?stage=all&format=xlsx", "/api/export/helpdesk?format=xlsx&days=all"]) {
  const res = await p.request.get(BASE + u);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await res.body());
  console.log(u, res.status(), wb.worksheets.map((w) => `${w.name}:${w.rowCount}`).join(", "));
}
for (const u of ["/print/tickets?stage=all", `/print/tickets/${tid}`, "/print/helpdesk?days=all"]) {
  const pp = await ctx.newPage(); await pp.goto(BASE + u); await pp.waitForLoadState("networkidle");
  const pdf = await pp.pdf({ format: "A4" }); console.log(u, "pdf bytes", pdf.length);
  if (u.includes(`/${tid}`)) await pp.screenshot({ path: `${OUT}/hd-print.png`, fullPage: true });
  await pp.close();
}

// ---- public portal (logged out)
const pub = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pp = await pub.newPage();
pp.on("pageerror", e => errs.push("pub: " + e.message));
await pp.goto(BASE + "/complaint?plant=PLT-001");
await pp.click("button:has-text('Membrane')");
await pp.fill("textarea[name=narration]", "Permeate conductivity high after CIP");
await pp.fill("input[name=name]", "Plant Operator"); await pp.fill("input[name=phone]", "9825099999");
await pp.click("button:has-text('Submit complaint')"); await pp.getByText("Complaint registered").waitFor();
const ref = await pp.locator("b.font-mono").textContent(); console.log("public ref:", ref);
await pp.screenshot({ path: `${OUT}/hd-portal.png` });
await pp.goto(BASE + `/complaint/status?ref=${ref}&contact=9825099999`); console.log("status:", (await pp.locator(".card").last().textContent()).slice(0, 80));
await pp.goto(BASE + `/complaint/status?ref=${ref}&contact=0000000000`); console.log("wrong phone blocked:", await pp.getByText("No complaint found").count());
console.log("public cannot see tickets:", (await pp.goto(BASE + "/tickets")).url().includes("/login"));

// cron
console.log("cron no auth:", (await fetch(BASE + "/api/cron/escalate")).status);
console.log("cron:", await (await fetch(BASE + "/api/cron/escalate", { headers: { authorization: `Bearer ${CRON_SECRET}` } })).json());
console.log("errors:", errs);
await browser.close();
if (errs.length) process.exit(1);
