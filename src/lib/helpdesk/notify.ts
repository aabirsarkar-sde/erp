import "server-only";
import { eq } from "drizzle-orm";
import { db, tickets, users } from "@/db";
import { sendMail, appUrl } from "@/lib/core/mail";
import { ticketRef } from "@/lib/helpdesk/constants";
import { readFileByKey } from "@/lib/core/storage";
import { asc } from "drizzle-orm";
import { settings, messages, ticketWatchers, users as usersT } from "@/db";
import { STAGE_META, PRIORITIES } from "@/lib/helpdesk/constants";
import { fmtDateTime, fmtTat } from "@/lib/core/format";

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

/** A reply came in by email: pass it on to the assignee and every follower (except the sender) so the chain continues */
export async function notifyInbound(ticketId: number, from: string, fromEmail?: string, body?: string) {
  const t = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId), with: { assignee: true } });
  if (!t) return;
  const to = new Set(await watcherEmails(ticketId, fromEmail ? [fromEmail] : []));
  if (t.assignee && t.assignee.email !== fromEmail) to.add(t.assignee.email);
  for (const email of to) {
    await sendMail({
      to: email,
      subject: subj(t.id, `Re: ${t.subject}`),
      text: `${from} wrote:\n\n${body ?? "(see ticket)"}\n\n—\nOpen the full thread: ${appUrl()}/tickets/${t.id}\nReply to this email to add to the ticket.`,
    });
  }
}

async function customerEmailFor(ticketId: number) {
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
  const cc = await watcherEmails(ticketId, [c.to]);
  const r = await sendMail({
    to: [c.to, ...cc].join(", "),
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

// ---------------- Ticket mail chain ----------------

export async function getHoEmails(): Promise<string[]> {
  const r = await db.query.settings.findFirst({ where: eq(settings.key, "ho_emails") });
  return (r?.value ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /@/.test(x));
}

/** Rochem HO addresses follow every ticket automatically */
export async function autoWatchers(ticketId: number) {
  const ho = await getHoEmails();
  if (ho.length) await db.insert(ticketWatchers).values(ho.map((email) => ({ ticketId, email, name: "Rochem HO" }))).onConflictDoNothing();
}

async function watcherEmails(ticketId: number, exclude: string[] = []) {
  const ws = await db.select().from(ticketWatchers).where(eq(ticketWatchers.ticketId, ticketId));
  const ex = new Set(exclude.map((e) => e.toLowerCase()));
  return ws.map((w) => w.email).filter((e) => !ex.has(e));
}

/** Plain-text summary + full conversation, used for "Email ticket" and closure mails */
async function ticketDigest(ticketId: number) {
  const t = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: { customer: true, plant: true, team: true, assignee: true, messages: { orderBy: asc(messages.createdAt), with: { author: true } } },
  });
  if (!t) return null;
  const lines = [
    `${ticketRef(t.id)} — ${t.subject}`,
    `Status: ${STAGE_META[t.stage].label} · Priority: ${PRIORITIES[t.priority]!.label} · Type: ${t.category ?? "—"}`,
    `Plant: ${t.plant ? `${t.plant.plantNo} ${t.plant.name}` : t.site ?? "—"} · Customer: ${t.customer?.name ?? "—"} · Zone: ${t.team.location ?? t.team.name}`,
    `Complaint by: ${t.complainantName ?? "—"}${t.complainantPhone ? ` (${t.complainantPhone})` : ""} · Reported: ${fmtDateTime(t.reportedAt ?? t.createdAt)}`,
    `Assigned to: ${t.assignee?.name ?? "unassigned"}${t.tatMinutes != null ? ` · TAT: ${fmtTat(t.tatMinutes)}` : ""}`,
    "",
    "Narration:",
    t.description ?? "—",
    "",
    "— Conversation —",
    ...t.messages
      .filter((m) => m.kind !== "event")
      .map((m) => `[${fmtDateTime(m.createdAt)}] ${m.kind === "inbound" ? m.fromName || m.fromEmail : m.author?.name ?? "System"}${m.kind === "note" ? " (internal note)" : ""}:\n${m.body}\n`),
  ];
  return { t, text: lines.join("\n") };
}

export async function notifyNewTicket(ticketId: number) {
  const d = await ticketDigest(ticketId);
  if (!d) return;
  const to = await watcherEmails(ticketId);
  for (const email of to) {
    await sendMail({ to: email, subject: subj(ticketId, `New complaint: ${d.t.subject}`), text: `A new complaint has been logged.\n\n${d.text}\n\nOpen: ${appUrl()}/tickets/${ticketId}\nReply to this email to add to the ticket (keep ${ticketRef(ticketId)} in the subject).` });
  }
}

export async function emailTicket(ticketId: number, to: string[], note: string | null, senderName: string) {
  const d = await ticketDigest(ticketId);
  if (!d) return { sent: 0 };
  let sent = 0;
  for (const email of to) {
    const r = await sendMail({ to: email, subject: subj(ticketId, d.t.subject), text: `${note ? `${note}\n\n— ${senderName}\n\n` : ""}${d.text}\n\nOpen: ${appUrl()}/tickets/${ticketId}\nReply to this email to add to the ticket (keep ${ticketRef(ticketId)} in the subject).` });
    if (r.sent || !process.env.SMTP_HOST) sent++;
  }
  return { sent };
}

export async function notifyTransfer(ticketId: number, fromId: number | null, toId: number, byName: string, reason: string | null) {
  const [to, from, t] = await Promise.all([
    db.query.users.findFirst({ where: eq(usersT.id, toId) }),
    fromId ? db.query.users.findFirst({ where: eq(usersT.id, fromId) }) : null,
    db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) }),
  ]);
  if (!to || !t) return;
  const body = `${byName} transferred ${ticketRef(ticketId)} ${from ? `from ${from.name} ` : ""}to ${to.name}.${reason ? `\nReason: ${reason}` : ""}\n\n${t.subject}\n\nOpen: ${appUrl()}/tickets/${ticketId}`;
  await sendMail({ to: to.email, subject: subj(ticketId, `Transferred to you: ${t.subject}`), text: body });
  if (from && from.id !== to.id) await sendMail({ to: from.email, subject: subj(ticketId, `Transferred to ${to.name}: ${t.subject}`), text: body });
}

export async function notifyClosed(ticketId: number) {
  const d = await ticketDigest(ticketId);
  if (!d) return;
  const to = await watcherEmails(ticketId);
  const survey = d.t.csatToken ? `\n\nHow did we do? Rate this service (1 click): ${appUrl()}/feedback/${d.t.csatToken}` : "";
  for (const email of to) {
    await sendMail({ to: email, subject: subj(ticketId, `Resolved: ${d.t.subject}`), text: `This complaint has been resolved. Turn-around time: ${fmtTat(d.t.tatMinutes)}.${survey}\n\n${d.text}` });
  }
}
