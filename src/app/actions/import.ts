"use server";
import { revalidatePath } from "next/cache";
import { and, eq, like, sql } from "drizzle-orm";
import { db, customers, contacts, leads, crmStages, users, tickets, teams, messages, plants } from "@/db";
import { requireAdmin } from "@/lib/auth";
import type { ImportKind } from "@/lib/csv";

type Row = Record<string, string>;
export type ImportResult = { created: number; updated: number; skipped: number; errors: string[] };

const clean = (s?: string) => (s ?? "").trim();
const lc = (s?: string) => clean(s).toLowerCase();
const num = (s?: string) => { const v = Number(clean(s).replace(/[₹,\s]/g, "")); return Number.isFinite(v) ? v : 0; };
const truthy = (s?: string) => /^(1|true|yes|y|company|t)$/i.test(clean(s));
function date(s?: string) {
  const v = clean(s);
  if (!v) return null;
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/); // Odoo India exports dd/mm/yyyy
  if (dmy) return new Date(Date.UTC(+dmy[3]!, +dmy[2]! - 1, +dmy[1]!, +(dmy[4] ?? 5), +(dmy[5] ?? 30)) - 330 * 60_000);
  const d = new Date(v);
  return isNaN(+d) ? null : d;
}

async function customerCache() {
  const all = await db.select({ id: customers.id, name: customers.name }).from(customers);
  const m = new Map(all.map((c) => [c.name.trim().toLowerCase(), c.id]));
  return {
    async get(name: string, extra: Partial<typeof customers.$inferInsert> = {}) {
      const k = name.trim().toLowerCase();
      if (!k) return null;
      const hit = m.get(k);
      if (hit) return hit;
      const [c] = await db.insert(customers).values({ name: name.trim(), ...extra }).returning();
      m.set(k, c!.id);
      return c!.id;
    },
    has: (name: string) => m.get(name.trim().toLowerCase()),
    set: (name: string, id: number) => m.set(name.trim().toLowerCase(), id),
  };
}

async function userMatcher() {
  const us = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  return (s?: string) => {
    const v = lc(s);
    if (!v) return null;
    return us.find((u) => u.name.toLowerCase() === v || u.email.toLowerCase() === v)?.id ?? us.find((u) => u.name.toLowerCase().includes(v) || v.includes(u.name.toLowerCase()))?.id ?? null;
  };
}

export async function importRows(kind: ImportKind, rows: Row[]): Promise<ImportResult> {
  await requireAdmin();
  const r: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (rows.length > 5000) return { ...r, errors: ["Send at most 5000 rows per batch."] };
  const cc = await customerCache();

  if (kind === "contacts") {
    // companies first so people can attach to them
    const isCo = (x: Row) => (x.isCompany !== undefined && x.isCompany !== "" ? truthy(x.isCompany) : !clean(x.company));
    const sorted = [...rows].sort((a, b) => Number(isCo(b)) - Number(isCo(a)));
    for (const x of sorted) {
      const name = clean(x.name).replace(/^"|"$/g, "");
      if (!name) { r.skipped++; continue; }
      try {
        const phone = clean(x.phone) || clean(x.mobile) || (/^\+?\d[\d\s-]{6,}$/.test(name) ? name : null);
        if (isCo(x)) {
          const existing = cc.has(name);
          const data = { city: clean(x.city) || null, address: clean(x.street) || null, email: clean(x.email) || null, phone, gstin: clean(x.gstin) || null };
          if (existing) {
            const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v));
            if (Object.keys(patch).length) await db.update(customers).set(patch).where(eq(customers.id, existing));
            r.updated++;
          } else { await cc.get(name, data); r.created++; }
        } else {
          // Odoo display names look like "Company, Person" — split when no company column
          let company = clean(x.company), person = name;
          if (!company && name.includes(", ")) [company, person] = [name.slice(0, name.lastIndexOf(", ")), name.slice(name.lastIndexOf(", ") + 2)];
          else if (company && name.toLowerCase().startsWith(company.toLowerCase() + ", ")) person = name.slice(company.length + 2);
          const customerId = company ? await cc.get(company, { city: clean(x.city) || null }) : null;
          const email = lc(x.email) || null;
          const dupe = email
            ? await db.query.contacts.findFirst({ where: eq(contacts.email, email) })
            : await db.query.contacts.findFirst({ where: and(eq(contacts.name, person), customerId ? eq(contacts.customerId, customerId) : sql`1=1`) });
          if (dupe) {
            await db.update(contacts).set({ phone: phone ?? dupe.phone, designation: clean(x.designation) || dupe.designation, customerId: dupe.customerId ?? customerId }).where(eq(contacts.id, dupe.id));
            r.updated++;
          } else {
            await db.insert(contacts).values({ name: person, email, phone, designation: clean(x.designation) || null, customerId });
            r.created++;
          }
        }
      } catch (e) { r.errors.push(`${name}: ${(e as Error).message}`); }
    }
    revalidatePath("/customers");
    return r;
  }

  if (kind === "leads") {
    const stages = await db.select().from(crmStages);
    let maxSeq = Math.max(0, ...stages.map((s) => s.sequence));
    const stageId = async (name?: string) => {
      const v = clean(name);
      const first = stages.sort((a, b) => a.sequence - b.sequence)[0];
      if (!v) return first?.id;
      const hit = stages.find((s) => s.name.toLowerCase() === v.toLowerCase()) ?? stages.find((s) => s.name.toLowerCase().startsWith(v.toLowerCase().split(/[\s/-]/)[0]!));
      if (hit) return hit.id;
      const [s] = await db.insert(crmStages).values({ name: v, sequence: ++maxSeq }).returning();
      stages.push(s!);
      return s!.id;
    };
    const who = await userMatcher();
    for (const x of rows) {
      const title = clean(x.title);
      if (!title) { r.skipped++; continue; }
      try {
        const customerId = clean(x.customer) ? await cc.get(clean(x.customer).split(", ")[0]!, { city: clean(x.city) || null }) : null;
        const dupe = await db.query.leads.findFirst({ where: and(eq(leads.title, title), customerId ? eq(leads.customerId, customerId) : sql`1=1`) });
        const st = lc(x.status);
        const status = /won/.test(st) ? "won" : /lost|false|archived/.test(st) ? "lost" : "open";
        const pr = clean(x.priority);
        const data = {
          title, customerId, stageId: (await stageId(x.stage))!, expectedRevenue: Math.round(num(x.revenue)), probability: x.probability ? Math.min(100, Math.round(num(x.probability))) : 10,
          ownerId: who(x.owner), tags: clean(x.tags) || null, contactName: clean(x.contact) || null, email: clean(x.email) || null, phone: clean(x.phone) || null, city: clean(x.city) || null,
          expectedCloseAt: date(x.close), priority: /^\d$/.test(pr) ? Math.min(3, +pr) : (pr.match(/★|\*/g)?.length ?? (/very high/i.test(pr) ? 3 : /high/i.test(pr) ? 2 : /medium|normal/i.test(pr) ? 1 : 0)),
          status: status as "open" | "won" | "lost", closedAt: status !== "open" ? new Date() : null, description: clean(x.notes) || null,
        };
        if (dupe) { await db.update(leads).set({ ...data, updatedAt: new Date() }).where(eq(leads.id, dupe.id)); r.updated++; }
        else { await db.insert(leads).values(data); r.created++; }
      } catch (e) { r.errors.push(`${title}: ${(e as Error).message}`); }
    }
    revalidatePath("/crm");
    return r;
  }

  if (kind === "plants") {
    const zs = await db.select().from(teams);
    for (const x of rows) {
      const plantNo = clean(x.plantNo).toUpperCase(), name = clean(x.name);
      if (!plantNo || !name) { r.skipped++; continue; }
      try {
        const z = lc(x.zone) || lc(x.city);
        const teamId = z ? zs.find((t) => z.includes((t.location ?? t.name).toLowerCase()) || (t.location ?? "").toLowerCase().includes(z))?.id ?? null : null;
        const data = { plantNo, name, customerId: clean(x.customer) ? await cc.get(clean(x.customer), { city: clean(x.city) || null }) : null, teamId, city: clean(x.city) || null, state: clean(x.state) || null, capacity: clean(x.capacity) || null, technology: clean(x.technology) || null };
        const dupe = await db.query.plants.findFirst({ where: eq(plants.plantNo, plantNo) });
        if (dupe) { await db.update(plants).set(data).where(eq(plants.id, dupe.id)); r.updated++; } else { await db.insert(plants).values(data); r.created++; }
        if (!teamId) r.errors.push(`${plantNo}: zone not matched — set it on the Plants page`);
      } catch (e) { r.errors.push(`${plantNo}: ${(e as Error).message}`); }
    }
    revalidatePath("/plants");
    return r;
  }

  // tickets
  const ts = await db.select().from(teams);
  const teamId = (s?: string) => {
    const v = lc(s);
    return (v && ts.find((t) => v.includes((t.location ?? t.name).toLowerCase()) || t.name.toLowerCase() === v)?.id) || ts[0]?.id;
  };
  const stageOf = (s?: string) => { const v = lc(s); return /solv|resolv|done/.test(v) ? "resolved" : /clos|cancel/.test(v) ? "closed" : /wait|hold|customer/.test(v) ? "waiting" : /progress|open|assigned/.test(v) ? "in_progress" : "new"; };
  const prioOf = (s?: string) => { const v = clean(s); if (/^\d$/.test(v)) return Math.min(3, +v); if (/urgent|very high/i.test(v)) return 3; if (/high/i.test(v)) return 2; if (/low/i.test(v)) return 0; return 1; };
  const who = await userMatcher();
  for (const x of rows) {
    const subject = clean(x.subject);
    if (!subject) { r.skipped++; continue; }
    try {
      const tid = teamId(x.team);
      if (!tid) { r.errors.push("Create at least one support team first."); break; }
      const customerId = clean(x.customer) ? await cc.get(clean(x.customer).split(", ")[0]!) : null;
      const created = date(x.created) ?? new Date();
      const stage = stageOf(x.stage);
      const dupe = await db.query.tickets.findFirst({ where: and(eq(tickets.subject, subject), customerId ? eq(tickets.customerId, customerId) : sql`1=1`, eq(tickets.createdAt, created)) });
      if (dupe) { r.skipped++; continue; }
      const [t] = await db.insert(tickets).values({
        subject, description: clean(x.description) || null, teamId: tid, customerId, assigneeId: who(x.assignee), stage, priority: prioOf(x.priority),
        category: clean(x.category) || null, tags: [clean(x.tags), "imported"].filter(Boolean).join(", "), createdAt: created, updatedAt: created,
        firstResponseAt: stage === "new" ? null : created, resolvedAt: stage === "resolved" || stage === "closed" ? created : null,
      }).returning();
      await db.insert(messages).values({ ticketId: t!.id, kind: "event", body: "Imported from Odoo", createdAt: created });
      r.created++;
    } catch (e) { r.errors.push(`${subject}: ${(e as Error).message}`); }
  }
  revalidatePath("/tickets");
  void like;
  return r;
}
