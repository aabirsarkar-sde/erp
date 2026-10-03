import "server-only";
import { handleInbound, type InboundEmail } from "@/lib/helpdesk/inbound";
import { handleEnquiryEmail, routeInbound } from "@/lib/crm/inbound-enquiry";
import type { CaptureItem } from "@/lib/core/graph";

/** every incoming email, whichever way it arrives: helpdesk build → ticket, CRM build → enquiry (or capture, for staff BCC/forwards) */
export const handleIncomingMail = (mail: InboundEmail) => (routeInbound(mail) === "enquiry" ? handleEnquiryEmail(mail) : handleInbound(mail));

/** one message / meeting from a captured Outlook mailbox → the customer's opportunity (only if the customer is known) */
export async function handleCaptured(c: CaptureItem) {
  const { captureMessage, internalDomains, staffByEmail, domainOf } = await import("@/lib/crm/capture");
  const internal = await internalDomains();
  const out = c.from === c.mailbox;
  const external = (c.kind === "meeting" || out ? [...c.to, ...c.cc] : [c.from]).filter((a) => a && !internal.has(domainOf(a)));
  if (!external.length) return false;
  const staff = await staffByEmail(c.mailbox);
  const r = await captureMessage({ messageId: c.id, subject: c.subject, text: c.text, at: c.at, direction: out ? "out" : "in", staffId: staff?.id ?? null, external, kind: c.kind });
  return !!r && !r.duplicate;
}

/** renew the Microsoft 365 subscriptions and import unread / captured mail (daily cron + "Check now" in Settings) */
export async function runMailbox() {
  const { ensureSubscriptions, sweepInboxes, sweepCapture, saveMailboxStatus } = await import("@/lib/core/graph");
  const { editionHasCrm } = await import("@/lib/core/edition");
  const capture = editionHasCrm && process.env.MS_CAPTURE !== "off" ? (await (await import("@/lib/crm/capture")).captureUsers()).map((u) => u.email.toLowerCase()) : [];
  const at = new Date().toISOString();
  try {
    const subs = await ensureSubscriptions(capture).catch((e: Error) => [`subscription not renewed: ${e.message.slice(0, 120)}`]);
    const n = await sweepInboxes(handleIncomingMail);
    const c = capture.length ? await sweepCapture(capture, handleCaptured) : 0;
    const detail = `${subs.join("; ")} · ${n} new email(s) imported${capture.length ? ` · ${c} captured from ${capture.length} mailbox(es)` : ""}`;
    await saveMailboxStatus({ at, ok: true, detail });
    return { ok: true, detail };
  } catch (e) {
    await saveMailboxStatus({ at, ok: false, detail: (e as Error).message.slice(0, 300) });
    return { ok: false, error: (e as Error).message };
  }
}
