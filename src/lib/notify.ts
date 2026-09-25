import "server-only";
import { eq } from "drizzle-orm";
import { db, tickets, users } from "@/db";
import { sendMail, appUrl } from "./mail";
import { ticketRef } from "./constants";
import { readFileByKey } from "./storage";

const subj = (id: number, s: string) => `[${ticketRef(id)}] ${s}`;

export async function notifyAssigned(ticketId: number, assigneeId: number, byUserId: number) {
  if (assigneeId === byUserId) return;
  const [u, t] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, assigneeId) }),
    db.query.tickets.findFirst({ where: eq(tickets.id, ticketId), with: { customer: true } }),
  ]);
  if (!u || !t) return;
  await sendMail({
    to: u.email,
    subject: subj(t.id, `Assigned to you: ${t.subject}`),
    text: `Hi ${u.name.split(" ")[0]},\n\n${ticketRef(t.id)} has been assigned to you.\n\nCustomer: ${t.customer?.name ?? "—"}\nSubject: ${t.subject}\n\nOpen: ${appUrl()}/tickets/${t.id}`,
  });
}

export async function notifyInbound(ticketId: number, from: string) {
  const t = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId), with: { assignee: true } });
  if (!t?.assignee) return;
  await sendMail({
    to: t.assignee.email,
    subject: subj(t.id, `New customer reply: ${t.subject}`),
    text: `${from} replied on ${ticketRef(t.id)}.\n\nOpen: ${appUrl()}/tickets/${t.id}`,
  });
}

export async function customerEmailFor(ticketId: number) {
  const t = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId), with: { contact: true, customer: true } });
  if (!t) return null;
  return { t, to: t.contact?.email || t.customer?.email || null };
}

export async function emailReplyToCustomer(ticketId: number, body: string, authorName: string, files: { name: string; mime: string; storageKey: string }[]) {
  const c = await customerEmailFor(ticketId);
  if (!c?.to) return null;
  const atts = await Promise.all(
    files.map(async (f) => {
      const d = await readFileByKey(f.storageKey);
      const buf = d instanceof Response ? Buffer.from(await d.arrayBuffer()) : d;
      return { filename: f.name, content: buf, contentType: f.mime };
    }),
  );
  const r = await sendMail({
    to: c.to,
    subject: subj(c.t.id, `Re: ${c.t.subject}`),
    text: `${body}\n\n— ${authorName}\nRaybon Support · Zero Discharge Systems Pvt. Ltd.\n\nPlease keep ${ticketRef(c.t.id)} in the subject when replying.`,
    attachments: atts,
  });
  return r.sent || !process.env.SMTP_HOST ? c.to : null;
}

export async function ackNewTicket(ticketId: number, to: string, subject: string) {
  await sendMail({
    to,
    subject: subj(ticketId, `We've received your request: ${subject}`),
    text: `Thank you for contacting Raybon Support.\n\nYour request has been logged as ${ticketRef(ticketId)}. Our team will get back to you shortly.\n\nPlease keep ${ticketRef(ticketId)} in the subject when replying.\n\n— Raybon Support · Zero Discharge Systems Pvt. Ltd.`,
  });
}
