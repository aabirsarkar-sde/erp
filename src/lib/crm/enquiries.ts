import "server-only";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, enquiries, customers, contacts, leads, users, settings, ENQUIRY_SOURCES } from "@/db";
import { notify } from "@/lib/workspace/notify";
import { aiEnabled, aiJson } from "@/lib/ai/client";
import { parseChatBasic, type ParsedChat } from "@/lib/crm/chat-parse";

export type EnquiryInput = {
  source: (typeof ENQUIRY_SOURCES)[number];
  name?: string | null; company?: string | null; email?: string | null; phone?: string | null; city?: string | null;
  product?: string | null; subject?: string | null; message?: string | null; externalId?: string | null; createdById?: number | null;
};

const clean = (s: string | null | undefined, n = 200) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n) || null;
export const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

/** recognise an existing customer by email (or its domain) or phone */
async function matchCustomer(email: string | null, phone: string | null) {
  const d = digits(phone);
  const domain = email?.split("@")[1];
  const free = /^(gmail|yahoo|outlook|hotmail|rediffmail|icloud|live)\./i.test(domain ?? "");
  const conds = [
    email ? eq(sql`lower(${customers.email})`, email) : undefined,
    d.length === 10 ? sql`replace(replace(replace(${customers.phone},' ',''),'-',''),'+','') like ${`%${d}`}` : undefined,
    domain && !free ? sql`lower(${customers.email}) like ${`%@${domain}`}` : undefined,
  ].filter(Boolean);
  if (conds.length) {
    const [c] = await db.select({ id: customers.id }).from(customers).where(or(...conds)).limit(1);
    if (c) return c.id;
  }
  const cc = [email ? eq(sql`lower(${contacts.email})`, email) : undefined, d.length === 10 ? sql`replace(replace(replace(${contacts.phone},' ',''),'-',''),'+','') like ${`%${d}`}` : undefined].filter(Boolean);
  if (cc.length) {
    const [c] = await db.select({ id: contacts.customerId }).from(contacts).where(and(or(...cc), sql`${contacts.customerId} is not null`)).limit(1);
    if (c?.id) return c.id;
  }
  return null;
}

/** who should hear about a new enquiry: the owner of the customer's open opportunity, else the configured person(s), else sales managers */
async function whoGetsIt(customerId: number | null) {
  if (customerId) {
    const [l] = await db.select({ ownerId: leads.ownerId }).from(leads).where(and(eq(leads.customerId, customerId), eq(leads.status, "open"))).limit(1);
    if (l?.ownerId) return { assignee: l.ownerId, notifyIds: [l.ownerId] };
  }
  const s = await db.query.settings.findFirst({ where: eq(settings.key, "enquiry_assign_to") });
  const ids = (s?.value ?? "").split(",").map(Number).filter(Boolean);
  if (ids.length) return { assignee: ids.length === 1 ? ids[0]! : null, notifyIds: ids };
  const mgrs = await db.select({ id: users.id }).from(users).where(and(eq(users.active, true), or(eq(users.role, "admin"), eq(users.crmAccess, "all")), ne(users.crmAccess, "none")));
  return { assignee: null, notifyIds: mgrs.map((m) => m.id) };
}

const SRC_LABEL: Record<string, string> = { website: "website form", email: "email", whatsapp: "WhatsApp", phone: "phone", other: "" };

/** one way in for every enquiry — website, email, WhatsApp — de-duplicated, matched and routed */
export async function createEnquiry(e: EnquiryInput) {
  const email = clean(e.email, 120)?.toLowerCase() ?? null;
  const phone = clean(e.phone, 40);
  if (e.externalId) {
    const dup = await db.query.enquiries.findFirst({ where: eq(enquiries.externalId, e.externalId) });
    if (dup) return { id: dup.id, duplicate: true };
  }
  const customerId = await matchCustomer(email, phone);
  const { assignee, notifyIds } = await whoGetsIt(customerId);
  const [row] = await db.insert(enquiries).values({
    source: e.source, name: clean(e.name, 100), company: clean(e.company, 150), email, phone, city: clean(e.city, 80), product: clean(e.product, 150),
    subject: clean(e.subject, 200), message: (e.message ?? "").trim().slice(0, 8000) || null, externalId: e.externalId ?? null, customerId, assignedToId: assignee, createdById: e.createdById ?? null,
  }).onConflictDoNothing().returning();
  if (!row) return { id: 0, duplicate: true };
  const who = row.company ?? row.name ?? row.email ?? row.phone ?? "Someone";
  for (const uid of notifyIds.filter((u) => u !== e.createdById)) {
    await notify({ userId: uid, kind: "enquiry", title: `New enquiry from ${who}${SRC_LABEL[e.source] ? ` (${SRC_LABEL[e.source]})` : ""}`, body: (row.subject ?? row.message ?? "").slice(0, 160), href: `/enquiries?open=${row.id}`, dedupeKey: `enq:${row.id}:${uid}` });
  }
  return { id: row.id, duplicate: false };
}

export const enquiryCounts = () => db.select({ status: enquiries.status, n: sql<number>`count(*)` }).from(enquiries).groupBy(enquiries.status);

// ---- WhatsApp paste: pull the details out of a forwarded chat ----
const parsedSchema = z.object({
  name: z.string().nullable(), company: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable(),
  city: z.string().nullable(), product: z.string().nullable(), summary: z.string(),
});

export async function parseChat(text: string, userId: number): Promise<ParsedChat> {
  const basic = parseChatBasic(text);
  if (!aiEnabled()) return basic;
  try {
    return await aiJson({
      feature: "crm.whatsapp_parse", userId, temperature: 0.1,
      system: "Extract the enquiry details from a WhatsApp chat forwarded to a sales team of an Indian water-treatment company (ZLD, RO, ETP/STP, MEE). Use null when a field isn't stated — never guess. summary: one line describing what the customer wants (max 25 words).",
      prompt: `${text.slice(0, 6000)}\n\nReturn {"name","company","phone","email","city","product","summary"}`,
      schema: parsedSchema,
      mock: () => basic,
    });
  } catch { return basic; }
}

/** open opportunities of the matched customer — for "add to existing opportunity" */
export async function openLeadsFor(customerIds: number[]) {
  if (!customerIds.length) return [];
  return db.select({ id: leads.id, title: leads.title, customerId: leads.customerId }).from(leads).where(and(inArray(leads.customerId, customerIds), eq(leads.status, "open")));
}
