// Runs scripts/odoo-import.ts against the fake Odoo and a scratch copy of the local database.
//   node tests/integration/odoo-import.test.mjs      (needs a seeded local.db — npm run setup)
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { start } from "./odoo-mock.mjs";

const errs = [];
const ok = (label, cond) => { console.log((cond ? "✓ " : "✗ FAIL ") + label); if (!cond) errs.push(label); };
const dir = mkdtempSync(path.join(tmpdir(), "odoo-"));
const file = path.join(dir, "test.db");
copyFileSync(process.env.SOURCE_DB ?? "local.db", file);
const srv = await start(18069);
const env = { ...process.env, DATABASE_URL: `file:${file}`, DATABASE_AUTH_TOKEN: "", ODOO_URL: "http://127.0.0.1:18069", ODOO_DB: "raybon", ODOO_USER: "api", ODOO_PASSWORD: "secret", APP_EDITION: "crm" };
// async: the fake Odoo runs in this process, so a blocking exec would deadlock
const run = async (...a) => (await promisify(execFile)("npx", ["tsx", "scripts/odoo-import.ts", ...a], { env, encoding: "utf8" })).stdout;
const db = createClient({ url: `file:${file}` });
const one = async (q, ...args) => (await db.execute({ sql: q, args })).rows[0];

const dry = await run("--dry-run");
ok("dry run connects and counts", dry.includes("17.0-mock") && dry.includes("DRY RUN"));
ok("dry run writes nothing", Number((await one("select count(*) n from leads where title like 'Odoo Test%'")).n) === 0);

const out1 = await run();
ok("lists Odoo users without a Raybon login", out1.includes("Old Salesman"));
const c = await one("select * from customers where name = 'Odoo Test Industries Ltd.'");
ok("company → customer with address + GSTIN", !!c && String(c.address).includes("Vadodara") && c.gstin === "24ABCDE1234F1Z5");
ok("person → contact under the company", Number((await one("select count(*) n from contacts where name='Mahesh Joshi' and customer_id=?", c.id)).n) === 1);
const l = await one("select l.*, u.email owner from leads l left join users u on u.id = l.owner_id where l.title = 'Odoo Test — 300 KLD ZLD'");
ok("opportunity: value, stars, labels, owner matched by email", l && Number(l.expected_revenue) === 32500000 && Number(l.priority) === 2 && l.tags === "Hot, Pharma" && l.owner === "aarti@raybon.local");
ok("won stage → won with closing date", (await one("select status, closed_at from leads where title = 'Odoo Test — RO spares'")).status === "won");
const lost = await one("select status, lost_reason, kind from leads where title = 'Odoo Test — lost STP'");
ok("archived → lost with reason; lead type kept", lost.status === "lost" && lost.lost_reason === "Too expensive" && lost.kind === "lead");
ok("unmatched salesperson noted on the opportunity", String((await one("select description from leads where title = 'Odoo Test — RO spares'")).description ?? "").includes("Old Salesman"));
const notes = (await db.execute({ sql: "select body from lead_notes where lead_id = ?", args: [l.id] })).rows.map((r) => r.body);
ok("chatter notes + emails imported as history (system messages skipped)", notes.some((b) => String(b).includes("Jar test next week")) && notes.some((b) => String(b).includes("Re: Offer")) && !notes.some((b) => String(b).includes("Stage changed")));
ok("open Odoo activity → planned call", Number((await one("select count(*) n from activities where lead_id = ? and type='call' and done_at is null", l.id)).n) === 1);
const q = await one("select * from quotations where number = 'S00999'");
ok("quotation with lines, linked to the opportunity", q && Number(q.lead_id) === Number(l.id) && q.status === "sent" && Number((await one("select count(*) n from quotation_lines where quotation_id = ?", q.id)).n) === 1);

await run(); // second run must update, not duplicate
ok("re-running doesn't duplicate", Number((await one("select count(*) n from leads where title like 'Odoo Test%'")).n) === 3 && Number((await one("select count(*) n from lead_notes where lead_id = ?", l.id)).n) === notes.length && Number((await one("select count(*) n from quotation_lines where quotation_id = ?", q.id)).n) === 1);

// helpdesk database: tickets + their mail thread
const hd = (await promisify(execFile)("npx", ["tsx", "scripts/odoo-import.ts", "--only=partners,tickets"], { env: { ...env, APP_EDITION: "helpdesk" }, encoding: "utf8" })).stdout;
const t = await one("select * from tickets where subject = 'RO high pressure pump tripping'");
ok("helpdesk ticket: solved stage, TAT, zone matched by name", t && t.stage === "resolved" && Number(t.tat_minutes) === 1680 && Number((await one("select count(*) n from teams where id = ? and (name like '%Dahej%' or location = 'Dahej')", t.team_id)).n) === 1);
ok("ticket email thread imported", Number((await one("select count(*) n from messages where ticket_id = ? and body like '%tripping again%'", t.id)).n) === 1);
ok("ticket without a team falls back to a zone", Number((await one("select count(*) n from tickets where subject = 'Membrane fouling'")).n) === 1 && hd.includes("helpdesk.ticket"));

srv.close();
console.log(errs.length ? `\n${errs.length} failed` : "\nall passed");
process.exit(errs.length ? 1 : 0);
