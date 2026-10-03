import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { db, tickets, messages, contacts, customers, teams, attachments, users, ticketWatchers } from "@/db";
import { saveFile } from "@/lib/core/storage";
import { getSla } from "@/lib/helpdesk/sla";
import { ackNewTicket, notifyInbound, autoWatchers, notifyNewTicket } from "@/lib/helpdesk/notify";
import { aiEnabled } from "@/lib/ai/client";
import { triageTicket } from "@/lib/ai/features";
import { settings } from "@/db";

export type InboundEmail = {
  from: string; // "Name <a@b.com>" or "a@b.com"
  to?: string; // which mailbox it was sent to (sales@ → CRM enquiry, support@ → ticket)
  cc?: string;
  date?: string; // ISO time it was sent
  subject?: string;
  text?: string;
  messageId?: string; // stops the same email being imported twice
  attachments?: { filename: string; contentType?: string; content: string /* base64 */ }[];
};

export function parseAddress(s: string) {
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2]! : s).trim().toLowerCase();
  const name = m?.[1]?.trim() || null;
  return { email, name };
}

// strip quoted history below the first "On ... wrote:" / "-----Original Message-----"
export function stripQuoted(text: string) {
  const cut = text.search(/^(On .+wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+)$/im);
  return (cut > 0 ? text.slice(0, cut) : text).replace(/(\n>.*)+\s*$/g, "").trim();
}

async function saveAttachments(list: InboundEmail["attachments"], ticketId: number, messageId: number) {
  for (const a of list ?? []) {
    const buf = Buffer.from(a.content, "base64");
    if (!buf.length || buf.length > 15 * 1024 * 1024) continue;
    const file = new File([buf], a.filename || "attachment", { type: a.contentType || "application/octet-stream" });
    const storageKey = await saveFile(file);
    await db.insert(attachments).values({ ticketId, messageId, name: file.name, mime: file.type, size: buf.length, storageKey });
  }
}

export async function handleInbound(mail: InboundEmail) {
  const { email, name } = parseAddress(mail.from);
  const subject = (mail.subject || "(no subject)").trim();
  const body = stripQuoted(mail.text || "") || "(no text)";
  const ref = subject.match(/TKT-?(\d{1,7})/i);

  if (ref) {
    const t = await db.query.tickets.findFirst({ where: eq(tickets.id, Number(ref[1])) });
    if (t) {
      const staff = await db.query.users.findFirst({ where: eq(users.email, email) });
      const [m] = await db.insert(messages).values({ ticketId: t.id, kind: "inbound", body, fromEmail: email, fromName: staff?.name ?? name, authorId: staff?.id ?? null }).returning();
      await saveAttachments(mail.attachments, t.id, m!.id);
      const reopen = t.stage === "waiting" || t.stage === "resolved" || t.stage === "closed";
      await db.update(tickets).set({ updatedAt: new Date(), ...(reopen ? { stage: "in_progress" as const, resolvedAt: null } : {}) }).where(eq(tickets.id, t.id));
      if (reopen) await db.insert(messages).values({ ticketId: t.id, kind: "event", body: "Reopened by customer reply" });
      await notifyInbound(t.id, staff?.name ?? (name || email), email, body);
      return { ticketId: t.id, created: false };
    }
  }

  // New ticket: match contact → customer, else customer by email domain
  let contact = await db.query.contacts.findFirst({ where: eq(contacts.email, email) });
  let customerId = contact?.customerId ?? null;
  const domain = email.split("@")[1] ?? "";
  const freeMail = /^(gmail|yahoo|hotmail|outlook|rediffmail|live|icloud)\./.test(domain);
  if (!customerId && domain && !freeMail) {
    const c = await db.query.customers.findFirst({ where: like(customers.email, `%@${domain}`) });
    customerId = c?.id ?? null;
  }
  if (!contact) {
    [contact] = await db.insert(contacts).values({ name: name || email, email, customerId }).returning();
  }
  // team: from customer's city, else the first active team
  let teamId: number | undefined;
  if (customerId) {
    const c = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
    if (c?.city) teamId = (await db.query.teams.findFirst({ where: and(eq(teams.active, true), like(teams.location, `%${c.city}%`)) }))?.id;
  }
  teamId ??= (await db.query.teams.findFirst({ where: eq(teams.active, true), orderBy: sql`id` }))?.id;
  if (!teamId) throw new Error("No active team to route ticket to");

  const sla = await getSla();
  const [t] = await db
    .insert(tickets)
    .values({ subject, description: body, teamId, customerId, contactId: contact!.id, priority: 1, dueAt: new Date(Date.now() + sla.resolution[1]! * 3600e3), tags: "email" })
    .returning();
  const [m] = await db.insert(messages).values({ ticketId: t!.id, kind: "event", body: `Created from email by ${name ? `${name} <${email}>` : email}` }).returning();
  await saveAttachments(mail.attachments, t!.id, m!.id);
  await db.update(tickets).set({ source: "email", complainantName: name || email, complainantEmail: email, reportedAt: new Date() }).where(eq(tickets.id, t!.id));
  await autoTriage(t!.id, subject, body, customerId);
  await db.insert(ticketWatchers).values({ ticketId: t!.id, email, name }).onConflictDoNothing();
  await autoWatchers(t!.id);
  await ackNewTicket(t!.id, email, subject);
  await notifyNewTicket(t!.id);
  return { ticketId: t!.id, created: true };
}

// AI triage for email tickets (best effort — never blocks ticket creation)
async function autoTriage(ticketId: number, subject: string, body: string, customerId: number | null) {
  if (!aiEnabled()) return;
  const off = await db.query.settings.findFirst({ where: eq(settings.key, "ai_auto_triage") });
  if (off?.value === "off") return;
  try {
    const c = customerId ? await db.query.customers.findFirst({ where: eq(customers.id, customerId) }) : null;
    const r = await triageTicket({ subject, description: body, customer: c?.name, city: c?.city }, null);
    await db.update(tickets).set({ category: r.category, priority: r.priority, ...(r.teamId ? { teamId: r.teamId } : {}), tags: ["email", ...r.tags].join(", ") }).where(eq(tickets.id, ticketId));
    await db.insert(messages).values({ ticketId, kind: "event", body: `✨ AI triage: ${r.category}, ${["Low", "Normal", "High", "Urgent"][r.priority]} priority — ${r.reason}` });
  } catch (e) {
    console.error("auto-triage failed", e);
  }
}
