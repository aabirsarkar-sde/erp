import "server-only";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import type { InboundEmail } from "@/lib/helpdesk/inbound";

/**
 * Microsoft 365 (Exchange Online) through Microsoft Graph — switched off until these are set:
 *   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET   app registration (application permissions:
 *                                                  Mail.ReadWrite, Mail.Send; admin consent granted)
 *   MS_INBOX       mailbox(es) this deployment reads, e.g. sales@raybonchemicals.com (CRM) or support@… (helpdesk)
 *   MS_SEND_FROM   mailbox the app sends from (replaces SMTP, which Microsoft is retiring for basic auth)
 *
 * New mail arrives two ways: Graph calls /api/graph/notify the moment it lands (a subscription the
 * daily cron renews), and the same cron sweeps anything unread as a safety net.
 */
export const graphConfigured = () => !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
export const graphInboxes = () => (process.env.MS_INBOX ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
export const graphSender = () => (graphConfigured() ? (process.env.MS_SEND_FROM ?? "").trim() : "");
const GRAPH = "https://graph.microsoft.com/v1.0";
const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
// tells our webhook which kind of subscription fired: the shared inbox ("in") or a captured personal mailbox ("cap")
const clientState = (kind: "in" | "cap" = "in") => `${(process.env.CRON_SECRET || "dev-cron-secret").slice(0, 60)}:${kind}`;

let cached: { token: string; exp: number } | null = null;
async function token() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export async function graph<T = unknown>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(init.prefer ? { Prefer: init.prefer } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Graph ${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (res.status === 202 || res.status === 204 ? null : await res.json()) as T;
}

// ---------------- sending ----------------
export async function graphSendMail(m: { to: string; subject: string; text: string; replyTo?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }) {
  const from = graphSender();
  await graph(`/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: m.subject,
        body: { contentType: "Text", content: m.text },
        toRecipients: m.to.split(/[,;]\s*/).filter(Boolean).map((a) => ({ emailAddress: { address: a.trim() } })),
        ...(m.replyTo ? { replyTo: [{ emailAddress: { address: m.replyTo } }] } : {}),
        attachments: (m.attachments ?? []).map((a) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.filename, contentType: a.contentType ?? "application/octet-stream", contentBytes: a.content.toString("base64") })),
      },
      saveToSentItems: true,
    }),
  });
}

// ---------------- receiving ----------------
type GMsg = {
  id: string; subject: string | null; internetMessageId?: string; hasAttachments?: boolean; isDraft?: boolean; receivedDateTime?: string; sentDateTime?: string;
  from?: { emailAddress: { name?: string; address: string } }; toRecipients?: { emailAddress: { address: string } }[]; ccRecipients?: { emailAddress: { address: string } }[];
  body?: { contentType: string; content: string }; uniqueBody?: { content: string };
};
const SELECT = "id,subject,from,toRecipients,ccRecipients,body,internetMessageId,hasAttachments,receivedDateTime,sentDateTime,isDraft";
const TEXT = 'outlook.body-content-type="text"';

/** a Graph message → the same shape the inbound-email webhook uses */
export function toInbound(m: GMsg, mailbox: string, attachments: InboundEmail["attachments"] = []): InboundEmail {
  const f = m.from?.emailAddress;
  return {
    from: f ? (f.name ? `${f.name} <${f.address}>` : f.address) : "unknown@unknown",
    to: [mailbox, ...(m.toRecipients ?? []).map((t) => t.emailAddress.address)].join(", "),
    cc: (m.ccRecipients ?? []).map((t) => t.emailAddress.address).join(", "),
    date: m.sentDateTime ?? m.receivedDateTime,
    subject: m.subject ?? "",
    text: (m.body?.content ?? "").replace(/\r\n/g, "\n").trim(),
    messageId: m.internetMessageId ?? m.id,
    attachments,
  };
}

async function attachmentsOf(mailbox: string, id: string): Promise<InboundEmail["attachments"]> {
  const r = await graph<{ value: { "@odata.type": string; name: string; contentType: string; contentBytes?: string; size: number }[] }>(`/users/${encodeURIComponent(mailbox)}/messages/${id}/attachments`);
  return r.value.filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && a.contentBytes && a.size < 15 * 1024 * 1024).map((a) => ({ filename: a.name, contentType: a.contentType, content: a.contentBytes! }));
}

const seen = new Set<string>(); // webhook and sweep can see the same message within one instance
async function processOne(mailbox: string, m: GMsg, handle: (mail: InboundEmail) => Promise<unknown>) {
  const key = m.internetMessageId ?? m.id;
  if (seen.has(key)) return false;
  seen.add(key);
  if (seen.size > 2000) seen.clear();
  // our own outgoing notifications bounce around — ignore mail from the sending mailbox
  if (m.from?.emailAddress.address?.toLowerCase() === graphSender().toLowerCase()) { await markRead(mailbox, m.id); return false; }
  await handle(toInbound(m, mailbox, m.hasAttachments ? await attachmentsOf(mailbox, m.id) : []));
  await markRead(mailbox, m.id);
  return true;
}
const markRead = (mailbox: string, id: string) => graph(`/users/${encodeURIComponent(mailbox)}/messages/${id}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) });

/** process every unread message in the inbox(es) */
export async function sweepInboxes(handle: (mail: InboundEmail) => Promise<unknown>) {
  let processed = 0;
  for (const mb of graphInboxes()) {
    const r = await graph<{ value: GMsg[] }>(`/users/${encodeURIComponent(mb)}/mailFolders/inbox/messages?$filter=isRead eq false&$top=40&$select=${SELECT}`, { prefer: TEXT });
    for (const m of r.value) if (await processOne(mb, m, handle)) processed++;
  }
  return processed;
}

// ---------------- capture of personal mailboxes (opt-in per person) ----------------
export type CaptureItem = { id: string; mailbox: string; subject: string; text: string; from: string; to: string[]; cc: string[]; at: Date; kind: "email" | "meeting" };
const toCapture = (m: GMsg, mailbox: string): CaptureItem => ({
  id: m.internetMessageId ?? m.id, mailbox: mailbox.toLowerCase(), subject: m.subject ?? "", text: (m.body?.content ?? "").replace(/\r\n/g, "\n"),
  from: (m.from?.emailAddress.address ?? "").toLowerCase(), to: (m.toRecipients ?? []).map((t) => t.emailAddress.address.toLowerCase()), cc: (m.ccRecipients ?? []).map((t) => t.emailAddress.address.toLowerCase()),
  at: new Date(m.sentDateTime ?? m.receivedDateTime ?? Date.now()), kind: "email",
});
const mailboxOf = new Map<string, string>();
async function mailboxAddress(idOrMail: string) {
  if (idOrMail.includes("@")) return idOrMail.toLowerCase();
  if (!mailboxOf.has(idOrMail)) { const u = await graph<{ mail?: string; userPrincipalName: string }>(`/users/${idOrMail}?$select=mail,userPrincipalName`); mailboxOf.set(idOrMail, (u.mail ?? u.userPrincipalName).toLowerCase()); }
  return mailboxOf.get(idOrMail)!;
}

/** mail sent/received and meetings held in the last `hours` by the captured people */
export async function sweepCapture(mailboxes: string[], handle: (c: CaptureItem) => Promise<unknown>, hours = 26) {
  const since = new Date(Date.now() - hours * 3600e3).toISOString();
  let n = 0;
  for (const mb of mailboxes) {
    let url: string | undefined = `/users/${encodeURIComponent(mb)}/messages?$filter=receivedDateTime ge ${since}&$top=50&$select=${SELECT}`;
    for (let page = 0; url && page < 10; page++) {
      const r: { value: GMsg[]; "@odata.nextLink"?: string } = await graph(url, { prefer: TEXT });
      for (const m of r.value) if (!m.isDraft && (await handle(toCapture(m, mb)))) n++;
      url = r["@odata.nextLink"];
    }
    const cal = await graph<{ value: { iCalUId: string; subject: string; isCancelled: boolean; start: { dateTime: string }; attendees: { emailAddress: { address: string } }[]; organizer?: { emailAddress: { address: string } }; bodyPreview?: string }[] }>(
      `/users/${encodeURIComponent(mb)}/calendarView?startDateTime=${since}&endDateTime=${new Date().toISOString()}&$select=iCalUId,subject,isCancelled,start,attendees,organizer,bodyPreview&$top=50`);
    for (const e of cal.value) {
      if (e.isCancelled) continue;
      const people = [...e.attendees.map((a) => a.emailAddress.address.toLowerCase()), (e.organizer?.emailAddress.address ?? "").toLowerCase()].filter(Boolean);
      const at = new Date(`${e.start.dateTime.replace(/Z?$/, "")}Z`);
      if (await handle({ id: `${e.iCalUId}:${+at}`, mailbox: mb, subject: e.subject, text: e.bodyPreview ?? "", from: mb, to: people, cc: [], at, kind: "meeting" })) n++;
    }
  }
  return n;
}

/** called from the webhook: Graph tells us which message arrived */
export async function processNotification(resource: string, kind: "in" | "cap", h: { inbox: (mail: InboundEmail) => Promise<unknown>; capture: (c: CaptureItem) => Promise<unknown> }) {
  const m = await graph<GMsg>(`/${resource.replace(/^\//, "")}?$select=${SELECT}`, { prefer: TEXT });
  // resource is Users/{id}/Messages/{id}
  const owner = await mailboxAddress(decodeURIComponent(resource.match(/^\/?users\/([^/]+)\//i)?.[1] ?? graphInboxes()[0] ?? ""));
  if (kind === "cap") return m.isDraft ? false : h.capture(toCapture(m, owner));
  return processOne(owner, m, h.inbox);
}
export const notificationKind = (s: string | undefined): "in" | "cap" | null => (s === clientState("in") ? "in" : s === clientState("cap") ? "cap" : null);

/** keep the "new mail" subscriptions alive (Graph mail subscriptions last under 3 days) */
export async function ensureSubscriptions(captureMailboxes: string[] = []) {
  const url = `${appUrl()}/api/graph/notify`;
  const exp = new Date(Date.now() + 4000 * 60_000).toISOString();
  const existing = await graph<{ value: { id: string; resource: string; notificationUrl: string }[] }>("/subscriptions");
  const out: string[] = [];
  const want = [
    ...graphInboxes().map((mb) => ({ mb, resource: `users/${mb}/mailFolders('inbox')/messages`, kind: "in" as const })),
    ...captureMailboxes.map((mb) => ({ mb, resource: `users/${mb}/messages`, kind: "cap" as const })),
  ];
  for (const w of want) {
    const s = existing.value.find((x) => x.notificationUrl === url && x.resource.toLowerCase() === w.resource.toLowerCase());
    try {
      if (s) { await graph(`/subscriptions/${s.id}`, { method: "PATCH", body: JSON.stringify({ expirationDateTime: exp }) }); out.push(`${w.mb}${w.kind === "cap" ? " (capture)" : ""}: renewed`); }
      else { await graph("/subscriptions", { method: "POST", body: JSON.stringify({ changeType: "created", notificationUrl: url, resource: w.resource, expirationDateTime: exp, clientState: clientState(w.kind) }) }); out.push(`${w.mb}${w.kind === "cap" ? " (capture)" : ""}: subscribed`); }
    } catch (e) { out.push(`${w.mb}: ${(e as Error).message.slice(0, 80)}`); }
  }
  return out;
}

/** last run, shown in Settings */
export async function saveMailboxStatus(v: { at: string; ok: boolean; detail: string }) {
  const value = JSON.stringify(v);
  await db.insert(settings).values({ key: "mailbox_status", value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
export async function mailboxStatus() {
  const r = await db.query.settings.findFirst({ where: eq(settings.key, "mailbox_status") });
  try { return r ? (JSON.parse(r.value) as { at: string; ok: boolean; detail: string }) : null; } catch { return null; }
}
