/**
 * Pull data straight out of the old Odoo into Raybon — customers, contacts, opportunities with their full
 * history, planned activities, quotations, helpdesk tickets and (optionally) attachments.
 *
 *   ODOO_URL=https://erp.raybon.athsoftware.com ODOO_DB=<database> ODOO_USER=<login> ODOO_PASSWORD=<API key> \
 *   DATABASE_URL=… DATABASE_AUTH_TOKEN=… APP_EDITION=crm \
 *   npx tsx scripts/odoo-import.ts --dry-run          # counts only, writes nothing
 *   npx tsx scripts/odoo-import.ts                    # import (safe to re-run: updates instead of duplicating)
 *   npx tsx scripts/odoo-import.ts --attachments      # also copy files (slow; needs Blob in production)
 *   npx tsx scripts/odoo-import.ts --only=partners,leads --since=2022-04-01
 *
 * APP_EDITION decides what goes where: crm → partners, stages, tags, leads, history, activities, quotations;
 * helpdesk → partners, tickets and their messages. Run it once per database.
 * Salespeople are matched to Raybon users by email; unmatched names are listed at the end (create them, re-run).
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db, importMap, users, customers, contacts, crmStages, tagDefs, leads, leadNotes, activities, quotations, quotationLines, tickets, teams, messages, documents, attachments, orders } from "../src/db";
import { editionHasCrm, editionHasHd } from "../src/lib/core/edition";
import { Odoo } from "./odoo/client";
import { activityType, htmlToText, joinAddress, leadStatus, m2oId, m2oName, odooDate, quoteStatus, stars, str, ticketStage, type M2O } from "./odoo/map";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const DRY = flag("dry-run");
const ONLY = opt("only")?.split(",");
const SINCE = opt("since"); // only records changed since this date
const want = (step: string) => !ONLY || ONLY.includes(step);
const sinceDomain = SINCE ? [["write_date", ">=", `${SINCE} 00:00:00`]] : [];

type R = Record<string, unknown>;
const stats: Record<string, { new: number; updated: number; skipped: number }> = {};
const bump = (k: string, f: "new" | "updated" | "skipped") => { (stats[k] ??= { new: 0, updated: 0, skipped: 0 })[f]++; };
const unmatchedUsers = new Map<number, string>();

// ---- id mapping (Odoo id → our id), remembered in import_map so a re-run updates rows
const cache = new Map<string, number>();
async function getMap(model: string, ext: number | null) {
  if (!ext) return null;
  const k = `${model}:${ext}`;
  if (cache.has(k)) return cache.get(k)!;
  const r = await db.query.importMap.findFirst({ where: and(eq(importMap.source, "odoo"), eq(importMap.model, model), eq(importMap.externalId, ext)) });
  if (r) cache.set(k, r.localId);
  return r?.localId ?? null;
}
async function setMap(model: string, ext: number, local: number) {
  cache.set(`${model}:${ext}`, local);
  await db.insert(importMap).values({ source: "odoo", model, externalId: ext, localId: local }).onConflictDoUpdate({ target: [importMap.source, importMap.model, importMap.externalId], set: { localId: local } });
}
/** insert or update a row and remember the mapping */
async function upsert<T extends { id: number }>(model: string, ext: number, existing: number | null, insert: () => Promise<T[]>, update: () => Promise<unknown>) {
  if (DRY) { bump(model, existing ? "updated" : "new"); return existing ?? -ext; }
  if (existing) { await update(); bump(model, "updated"); return existing; }
  const [row] = await insert();
  await setMap(model, ext, row!.id);
  bump(model, "new");
  return row!.id;
}

async function main() {
  const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Set ${k}`); return v; };
  const odoo = new Odoo({ url: need("ODOO_URL"), db: need("ODOO_DB"), user: need("ODOO_USER"), password: need("ODOO_PASSWORD") });
  const who = await odoo.login();
  console.log(`Connected to Odoo ${who.version} as uid ${who.uid}${DRY ? " — DRY RUN, nothing is written" : ""}`);

  // ---------- users: match by email/login
  const local = await db.select({ id: users.id, email: users.email }).from(users);
  const byEmail = new Map(local.map((u) => [u.email.toLowerCase(), u.id]));
  const userMap = new Map<number, number>();
  for await (const page of odoo.all<R>("res.users", [], ["login", "email", "name"])) {
    for (const u of page) {
      const id = byEmail.get(String(u.email || u.login || "").toLowerCase());
      if (id) userMap.set(u.id as number, id); else unmatchedUsers.set(u.id as number, String(u.name));
    }
  }
  const userOf = (v: M2O) => { const id = m2oId(v); return id ? userMap.get(id) ?? null : null; };
  const nameOfUnmatched = (v: M2O) => { const id = m2oId(v); return id && !userMap.has(id) ? m2oName(v) : null; };

  // ---------- partners → customers + contacts
  if (want("partners")) {
    const P = ["name", "is_company", "parent_id", "email", "phone", "mobile", "street", "street2", "city", "zip", "state_id", "vat", "comment", "function", "customer_rank", "active"];
    // companies first so contacts can point at them
    for (const companies of [true, false]) {
      const dom = [...sinceDomain, companies ? "|" : "&", ["is_company", "=", companies], companies ? ["parent_id", "=", false] : ["parent_id", "!=", false]];
      for await (const page of odoo.all<R>("res.partner", dom, P)) {
        for (const p of page) {
          const ext = p.id as number;
          if (companies) {
            const v = { name: String(p.name ?? "—").slice(0, 200), city: str(p.city), address: joinAddress(p.street, p.street2, p.city, m2oName(p.state_id as M2O), p.zip), email: str(p.email)?.toLowerCase() ?? null, phone: str(p.phone) ?? str(p.mobile), gstin: str(p.vat), notes: htmlToText(p.comment) };
            const ex = await getMap("res.partner", ext);
            await upsert("res.partner", ext, ex, () => db.insert(customers).values(v).returning(), () => db.update(customers).set(v).where(eq(customers.id, ex!)));
          } else {
            const customerId = await getMap("res.partner", m2oId(p.parent_id as M2O));
            const v = { name: String(p.name ?? "—").slice(0, 150), designation: str(p.function), email: str(p.email)?.toLowerCase() ?? null, phone: str(p.mobile) ?? str(p.phone), customerId };
            const ex = await getMap("res.partner.contact", ext);
            await upsert("res.partner.contact", ext, ex, () => db.insert(contacts).values(v).returning(), () => db.update(contacts).set(v).where(eq(contacts.id, ex!)));
          }
        }
      }
    }
  }
  // a contact person's partner id → their company (customer) id
  const customerOf = async (v: M2O) => (await getMap("res.partner", m2oId(v))) ?? null;
  const contactOf = async (v: M2O) => (await getMap("res.partner.contact", m2oId(v))) ?? null;

  // ---------- CRM
  if (editionHasCrm && (want("leads") || want("stages"))) {
    // stages: match by name, create the missing ones
    const stageMap = new Map<number, { id: number; won: boolean }>();
    const ours = await db.select().from(crmStages);
    for await (const page of odoo.all<R>("crm.stage", [], ["name", "sequence", "is_won", "fold"])) {
      for (const s of page) {
        let st = ours.find((o) => o.name.toLowerCase() === String(s.name).toLowerCase());
        if (!st && !DRY) [st] = await db.insert(crmStages).values({ name: String(s.name), sequence: Number(s.sequence) || 50, probability: s.is_won ? 100 : 10, folded: !!s.fold }).returning();
        if (st) stageMap.set(s.id as number, { id: st.id, won: !!s.is_won });
        bump("crm.stage", st ? "updated" : "new");
      }
    }
    const firstStage = ours.sort((a, b) => a.sequence - b.sequence)[0];
    // tags
    const tagName = new Map<number, string>();
    for await (const page of odoo.all<R>("crm.tag", [], ["name"])) for (const t of page) {
      tagName.set(t.id as number, String(t.name));
      if (!DRY) await db.insert(tagDefs).values({ name: String(t.name), group: "Other", color: "slate" }).onConflictDoNothing();
    }

    if (want("leads")) {
      const L = ["name", "type", "partner_id", "partner_name", "contact_name", "email_from", "phone", "mobile", "street", "street2", "city", "expected_revenue", "planned_revenue", "probability", "priority", "tag_ids", "description", "stage_id", "user_id", "date_deadline", "create_date", "date_closed", "date_conversion", "active", "lost_reason_id", "lost_reason", "source_id", "won_status"];
      for await (const page of odoo.all<R>("crm.lead", sinceDomain, L)) {
        for (const l of page) {
          const ext = l.id as number;
          const st = stageMap.get(m2oId(l.stage_id as M2O) ?? -1);
          const status = leadStatus({ active: l.active as boolean, probability: l.probability as number, stage_is_won: st?.won, won_status: l.won_status as string });
          const tags = (Array.isArray(l.tag_ids) ? (l.tag_ids as number[]) : []).map((t) => tagName.get(t)).filter(Boolean).join(", ") || null;
          const unmatched = nameOfUnmatched(l.user_id as M2O);
          const desc = [htmlToText(l.description), unmatched ? `(Odoo salesperson: ${unmatched})` : null].filter(Boolean).join("\n\n") || null;
          const v = {
            title: String(l.name ?? "Opportunity").slice(0, 200), kind: l.type === "lead" ? ("lead" as const) : ("opportunity" as const),
            customerId: await customerOf(l.partner_id as M2O), companyName: str(l.partner_name), contactName: str(l.contact_name), email: str(l.email_from)?.toLowerCase() ?? null,
            phone: str(l.mobile) ?? str(l.phone), city: str(l.city), address: joinAddress(l.street, l.street2, l.city),
            expectedRevenue: Math.round(Number(l.expected_revenue ?? l.planned_revenue) || 0), probability: Math.round(Number(l.probability) || 0), priority: stars(l.priority), tags, description: desc,
            stageId: st?.id ?? firstStage?.id ?? 1, ownerId: userOf(l.user_id as M2O), status, lostReason: status === "lost" ? (m2oName(l.lost_reason_id as M2O) ?? str(l.lost_reason)) : null,
            source: m2oName(l.source_id as M2O), expectedCloseAt: odooDate(l.date_deadline), createdAt: odooDate(l.create_date) ?? new Date(),
            closedAt: status === "open" ? null : odooDate(l.date_closed) ?? odooDate(l.create_date), convertedAt: odooDate(l.date_conversion), updatedAt: new Date(),
          };
          const ex = await getMap("crm.lead", ext);
          await upsert("crm.lead", ext, ex, () => db.insert(leads).values(v).returning(), () => db.update(leads).set(v).where(eq(leads.id, ex!)));
        }
      }

      // history: chatter messages on opportunities (notes, emails, logged calls)
      for await (const page of odoo.all<R>("mail.message", [["model", "=", "crm.lead"], ["message_type", "in", ["comment", "email"]], ...sinceDomain], ["res_id", "body", "date", "author_id", "message_type", "subject", "subtype_id", "email_from"])) {
        for (const m of page) {
          const leadId = await getMap("crm.lead", m.res_id as number);
          const body = htmlToText(m.body);
          if (!leadId || !body) { bump("mail.message", "skipped"); continue; }
          const ex = await getMap("mail.message", m.id as number);
          const author = m2oName(m.author_id as M2O);
          const v = { leadId, kind: "note" as const, body: `${m.message_type === "email" ? `✉️ ${str(m.subject) ?? "Email"}${author ? ` — ${author}` : ""}\n` : ""}${body}`.slice(0, 8000), createdAt: odooDate(m.date) ?? new Date() };
          await upsert("mail.message", m.id as number, ex, () => db.insert(leadNotes).values(v).returning(), () => db.update(leadNotes).set(v).where(eq(leadNotes.id, ex!)));
        }
      }

      // planned activities (still open in Odoo)
      for await (const page of odoo.all<R>("mail.activity", [["res_model", "=", "crm.lead"]], ["res_id", "activity_type_id", "summary", "note", "date_deadline", "user_id"])) {
        for (const a of page) {
          const leadId = await getMap("crm.lead", a.res_id as number);
          if (!leadId) { bump("mail.activity", "skipped"); continue; }
          const ex = await getMap("mail.activity", a.id as number);
          const v = { type: activityType(m2oName(a.activity_type_id as M2O)), summary: (str(a.summary) ?? m2oName(a.activity_type_id as M2O) ?? "Follow up").slice(0, 200), note: htmlToText(a.note), leadId, userId: userOf(a.user_id as M2O), dueAt: odooDate(a.date_deadline) };
          await upsert("mail.activity", a.id as number, ex, () => db.insert(activities).values(v).returning(), () => db.update(activities).set(v).where(eq(activities.id, ex!)));
        }
      }
    }

    // quotations
    if (want("quotations") && (await odoo.hasModel("sale.order"))) {
      for await (const page of odoo.all<R>("sale.order", sinceDomain, ["name", "partner_id", "opportunity_id", "date_order", "validity_date", "state", "user_id", "amount_untaxed", "amount_tax", "amount_total", "note"])) {
        for (const q of page) {
          const ex = await getMap("sale.order", q.id as number);
          const v = {
            number: String(q.name).slice(0, 40), revision: 0, customerId: await customerOf(q.partner_id as M2O), leadId: await getMap("crm.lead", m2oId(q.opportunity_id as M2O)),
            date: odooDate(q.date_order) ?? new Date(), validUntil: odooDate(q.validity_date), status: quoteStatus(q.state), salespersonId: userOf(q.user_id as M2O),
            subtotal: Number(q.amount_untaxed) || 0, tax: Number(q.amount_tax) || 0, total: Number(q.amount_total) || 0, terms: htmlToText(q.note),
          };
          const qid = await upsert("sale.order", q.id as number, ex, () => db.insert(quotations).values(v).returning(), () => db.update(quotations).set(v).where(eq(quotations.id, ex!)));
          // confirmed sales orders also become orders (business won, forecast)
          if (v.status === "accepted") {
            const ov = { leadId: v.leadId, customerId: v.customerId, quotationId: DRY ? null : qid, poNumber: v.number, poDate: v.date, value: Math.round(v.subtotal), ownerId: v.salespersonId, notes: "Imported from Odoo" };
            const oex = await getMap("sale.order.confirmed", q.id as number);
            await upsert("sale.order.confirmed", q.id as number, oex, () => db.insert(orders).values(ov).returning(), () => db.update(orders).set(ov).where(eq(orders.id, oex!)));
          }
          if (!DRY && !ex) {
            for await (const lines of odoo.all<R>("sale.order.line", [["order_id", "=", q.id]], ["name", "product_uom_qty", "price_unit", "sequence", "display_type"])) {
              const rows = lines.filter((x) => !x.display_type).map((x, i) => ({ quotationId: qid, description: String(x.name ?? "Item").slice(0, 2000), qty: Number(x.product_uom_qty) || 1, unitPrice: Number(x.price_unit) || 0, sort: Number(x.sequence) || i }));
              if (rows.length) await db.insert(quotationLines).values(rows);
            }
          }
        }
      }
    }

    if (flag("attachments")) await copyAttachments(odoo, "crm.lead", async (resId, file, a) => {
      const leadId = await getMap("crm.lead", resId);
      if (!leadId) return false;
      const { saveFile } = await import("../src/lib/core/storage");
      const storageKey = await saveFile(file);
      const [d] = await db.insert(documents).values({ name: file.name, mime: file.type, size: file.size, storageKey, leadId, description: "Imported from Odoo", createdAt: odooDate(a.create_date) ?? new Date() }).returning();
      await setMap("ir.attachment", a.id as number, d!.id);
      return true;
    });
  }

  // ---------- Helpdesk
  if (editionHasHd && want("tickets")) {
    if (!(await odoo.hasModel("helpdesk.ticket"))) console.log("• helpdesk.ticket not on this Odoo (Enterprise module) — skipped");
    else {
      const allTeams = await db.select().from(teams);
      const fallbackTeam = allTeams[0] ?? (DRY ? undefined : (await db.insert(teams).values({ name: "Support Team: Imported", location: "Imported" }).returning())[0]);
      const teamOf = (v: M2O) => { const n = (m2oName(v) ?? "").toLowerCase(); return allTeams.find((t) => n && (t.name.toLowerCase().includes(n) || (t.location ?? "").toLowerCase() === n))?.id ?? fallbackTeam?.id ?? 1; };
      for await (const page of odoo.all<R>("helpdesk.ticket", sinceDomain, ["name", "description", "partner_id", "partner_name", "partner_email", "partner_phone", "team_id", "user_id", "stage_id", "priority", "create_date", "close_date", "tag_ids", "ticket_type_id"])) {
        for (const t of page) {
          const ex = await getMap("helpdesk.ticket", t.id as number);
          const stage = ticketStage(m2oName(t.stage_id as M2O));
          const created = odooDate(t.create_date) ?? new Date(), closed = odooDate(t.close_date);
          const v = {
            subject: String(t.name ?? "Ticket").slice(0, 250), description: htmlToText(t.description), stage, priority: stars(t.priority), category: m2oName(t.ticket_type_id as M2O),
            teamId: teamOf(t.team_id as M2O), assigneeId: userOf(t.user_id as M2O), customerId: await customerOf(t.partner_id as M2O) ?? null, contactId: await contactOf(t.partner_id as M2O),
            complainantName: str(t.partner_name), complainantEmail: str(t.partner_email), complainantPhone: str(t.partner_phone), source: "internal" as const,
            reportedAt: created, createdAt: created, resolvedAt: stage === "resolved" || stage === "closed" ? closed ?? created : null,
            tatMinutes: closed ? Math.max(0, Math.round((+closed - +created) / 60000)) : null, updatedAt: new Date(),
          };
          await upsert("helpdesk.ticket", t.id as number, ex, () => db.insert(tickets).values(v).returning(), () => db.update(tickets).set(v).where(eq(tickets.id, ex!)));
        }
      }
      for await (const page of odoo.all<R>("mail.message", [["model", "=", "helpdesk.ticket"], ["message_type", "in", ["comment", "email"]], ...sinceDomain], ["res_id", "body", "date", "author_id", "message_type", "email_from", "subtype_id"])) {
        for (const m of page) {
          const ticketId = await getMap("helpdesk.ticket", m.res_id as number);
          const body = htmlToText(m.body);
          if (!ticketId || !body) { bump("mail.message(ticket)", "skipped"); continue; }
          const ex = await getMap("mail.message.ticket", m.id as number);
          const internal = /note/i.test(m2oName(m.subtype_id as M2O) ?? "");
          const v = { ticketId, kind: m.message_type === "email" ? ("inbound" as const) : internal ? ("note" as const) : ("reply" as const), body: body.slice(0, 8000), fromName: m2oName(m.author_id as M2O), fromEmail: str(m.email_from), createdAt: odooDate(m.date) ?? new Date() };
          await upsert("mail.message.ticket", m.id as number, ex, () => db.insert(messages).values(v).returning(), () => db.update(messages).set(v).where(eq(messages.id, ex!)));
        }
      }
      if (flag("attachments")) await copyAttachments(odoo, "helpdesk.ticket", async (resId, file, a) => {
        const ticketId = await getMap("helpdesk.ticket", resId);
        if (!ticketId) return false;
        const { saveFile } = await import("../src/lib/core/storage");
        const storageKey = await saveFile(file);
        const [x] = await db.insert(attachments).values({ ticketId, name: file.name, mime: file.type, size: file.size, storageKey, createdAt: odooDate(a.create_date) ?? new Date() }).returning();
        await setMap("ir.attachment", a.id as number, x!.id);
        return true;
      });
    }
  }

  console.log("\nResult" + (DRY ? " (dry run)" : "") + ":");
  console.table(stats);
  if (unmatchedUsers.size) console.log(`\nOdoo users with no Raybon login (their records were imported without an owner; add these people in Settings → Users with the same email, then re-run):\n  ${[...unmatchedUsers.values()].join(", ")}`);
}

/** ir.attachment rows for a model, one at a time (datas can be large) */
async function copyAttachments(odoo: Odoo, model: string, save: (resId: number, f: File, a: R) => Promise<boolean>) {
  const key = `ir.attachment(${model})`;
  for await (const page of odoo.all<R>("ir.attachment", [["res_model", "=", model], ["type", "=", "binary"]], ["name", "res_id", "mimetype", "file_size", "create_date"], 200)) {
    for (const a of page) {
      if (await getMap("ir.attachment", a.id as number)) { bump(key, "skipped"); continue; }
      if (Number(a.file_size) > 15 * 1024 * 1024) { bump(key, "skipped"); continue; }
      if (DRY) { bump(key, "new"); continue; }
      const [full] = await odoo.call<R[]>("ir.attachment", "read", [[a.id]], { fields: ["datas"] });
      if (!full?.datas) { bump(key, "skipped"); continue; }
      const file = new File([Buffer.from(String(full.datas), "base64")], String(a.name ?? "file"), { type: String(a.mimetype ?? "application/octet-stream") });
      bump(key, (await save(a.res_id as number, file, a)) ? "new" : "skipped");
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("\n✗", (e as Error).message); process.exit(1); });
