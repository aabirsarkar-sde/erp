import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, users, leads, contacts, customers, activities, settings } from "@/db";

/**
 * Email capture — the "corporate memory" part. Mail exchanged with known customers is attached to
 * their opportunity (or the customer) as an email activity. Mail with unknown or internal addresses is
 * never stored. Sources: BCC / forward to the sales mailbox, and (optional) Outlook mailbox capture.
 */
const FREE = /@(gmail|yahoo|outlook|hotmail|rediffmail|icloud|live|ymail)\./i;
import { addr, domainOf, forcedLead } from "@/lib/crm/capture-rules";
export { addr, domainOf, forcedLead };

/** our own domains: never treated as customers */
export async function internalDomains() {
  const env = [process.env.MS_INTERNAL_DOMAINS ?? "", process.env.MS_SEND_FROM ?? "", process.env.MS_INBOX ?? ""].join(",");
  const fromEnv = env.split(/[,;\s]+/).map((x) => (x.includes("@") ? domainOf(x.toLowerCase()) : x.toLowerCase().trim())).filter(Boolean);
  const staff = await db.select({ email: users.email }).from(users);
  return new Set([...fromEnv, ...staff.map((u) => domainOf(u.email.toLowerCase())), "raybonchemicals.com"].filter((d) => d && !FREE.test(`@${d}.`)));
}
export async function staffByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(sql`lower(${users.email})`, email.toLowerCase()) });
}

/** which customer / opportunity a set of outside addresses belongs to */
export async function matchAddresses(list: string[], forceLeadId?: number | null) {
  if (forceLeadId) {
    const l = await db.query.leads.findFirst({ where: eq(leads.id, forceLeadId) });
    if (l) return { leadId: l.id, customerId: l.customerId };
  }
  const emails = [...new Set(list.map(addr).filter((e) => e.includes("@")))];
  if (!emails.length) return null;
  // 1. an open opportunity with exactly this contact email
  const direct = await db.select({ id: leads.id, customerId: leads.customerId }).from(leads)
    .where(and(inArray(sql`lower(${leads.email})`, emails), eq(leads.status, "open"))).orderBy(desc(leads.updatedAt)).limit(1);
  if (direct[0]) return { leadId: direct[0].id, customerId: direct[0].customerId };
  // 2. a contact or customer with that email, else the company's domain
  let customerId: number | null = null;
  const ct = await db.select({ c: contacts.customerId }).from(contacts).where(and(inArray(sql`lower(${contacts.email})`, emails), sql`${contacts.customerId} is not null`)).limit(1);
  customerId = ct[0]?.c ?? null;
  if (!customerId) customerId = (await db.select({ id: customers.id }).from(customers).where(inArray(sql`lower(${customers.email})`, emails)).limit(1))[0]?.id ?? null;
  if (!customerId) {
    const doms = [...new Set(emails.filter((e) => !FREE.test(e)).map(domainOf))];
    for (const d of doms) {
      const c = await db.select({ id: customers.id }).from(customers).where(sql`lower(${customers.email}) like ${`%@${d}`}`).limit(1);
      if (c[0]) { customerId = c[0].id; break; }
      const k = await db.select({ c: contacts.customerId }).from(contacts).where(and(sql`lower(${contacts.email}) like ${`%@${d}`}`, sql`${contacts.customerId} is not null`)).limit(1);
      if (k[0]?.c) { customerId = k[0].c; break; }
    }
  }
  if (!customerId) return null;
  // the customer's most recently active open opportunity
  const l = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.customerId, customerId), eq(leads.status, "open"))).orderBy(desc(leads.updatedAt)).limit(1);
  return { leadId: l[0]?.id ?? null, customerId };
}

export type Captured = { messageId: string; subject: string; text: string; at: Date; direction: "in" | "out"; staffId: number | null; external: string[]; kind?: "email" | "meeting"; forceLeadId?: number | null };

/** log one email / meeting on the matching opportunity; returns the activity id, or null if nobody matched */
export async function captureMessage(c: Captured) {
  const externalId = `${c.kind === "meeting" ? "cal" : "mail"}:${c.messageId}`.slice(0, 300);
  const dup = await db.query.activities.findFirst({ where: eq(activities.externalId, externalId), columns: { id: true } });
  if (dup) return { id: dup.id, duplicate: true };
  const m = await matchAddresses(c.external, c.forceLeadId);
  if (!m) return null;
  const body = c.text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500);
  const who = c.external.map(addr).join(", ");
  const [a] = await db.insert(activities).values({
    type: c.kind === "meeting" ? "meeting" : "email",
    summary: (c.kind === "meeting" ? `Meeting: ${c.subject}` : `${c.direction === "out" ? "✉️ Sent" : "✉️ Received"}: ${c.subject || "(no subject)"}`).slice(0, 200),
    discussion: `${c.direction === "out" ? "To" : "From"}: ${who}\n\n${body}`.slice(0, 4000), outcome: "Captured from Outlook",
    leadId: m.leadId, customerId: m.customerId, userId: c.staffId, createdById: c.staffId, dueAt: c.at, doneAt: c.at, externalId,
  }).onConflictDoNothing().returning({ id: activities.id });
  if (m.leadId) await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, m.leadId));
  return a ? { id: a.id, duplicate: false, leadId: m.leadId, customerId: m.customerId } : null;
}

/** who has Outlook capture switched on (Settings → Email capture) */
export async function captureUsers() {
  const r = await db.query.settings.findFirst({ where: eq(settings.key, "capture_users") });
  const ids = (r?.value ?? "").split(",").map(Number).filter(Boolean);
  if (!ids.length) return [];
  return db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(and(inArray(users.id, ids), eq(users.active, true)));
}

