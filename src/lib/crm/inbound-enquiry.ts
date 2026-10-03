import "server-only";
import { createEnquiry } from "@/lib/crm/enquiries";
import { parseAddress, stripQuoted, type InboundEmail } from "@/lib/helpdesk/inbound";
import { addr, captureMessage, forcedLead, internalDomains, staffByEmail, domainOf } from "@/lib/crm/capture";
import { EDITION } from "@/lib/core/edition";

const splitAddrs = (s?: string) => (s ?? "").split(/[,;]\s*/).map(addr).filter((x) => x.includes("@"));

/**
 * Email to the sales mailbox:
 *  • from a customer / prospect → Enquiries inbox
 *  • from our own staff → email capture: a BCC on a mail they sent, or a customer mail they forwarded,
 *    is logged on that customer's opportunity ("[OPP-123]" in the subject picks the opportunity).
 *    If the customer isn't known yet, a forwarded mail still becomes an enquiry.
 */
export async function handleEnquiryEmail(mail: InboundEmail) {
  const { email, name } = parseAddress(mail.from);
  const body = stripQuoted(mail.text || "") || "(no text)";
  const fwd = (mail.text ?? "").match(/^From:\s*(?:"?([^"<\n]*?)"?\s*)?<?([\w.+-]+@[\w-]+\.[\w.]+)>?/im);
  const staff = await staffByEmail(email);
  const internal = await internalDomains();
  const isStaff = !!staff || internal.has(domainOf(email));
  const subject = (mail.subject || "").replace(/^((fw|fwd|re):\s*)+/gi, "").trim();
  if (isStaff) {
    const inboxes = new Set((process.env.MS_INBOX ?? "").split(/[,;\s]+/).map((x) => x.toLowerCase()).filter(Boolean));
    const forwarded = !!fwd && /^(fw|fwd):/i.test(mail.subject ?? "") || (!!fwd && !splitAddrs(mail.to).some((a) => !internal.has(domainOf(a)) && !inboxes.has(a)));
    const external = forwarded ? [fwd![2]!.toLowerCase()] : [...splitAddrs(mail.to), ...splitAddrs(mail.cc)].filter((a) => !internal.has(domainOf(a)) && !inboxes.has(a) && !a.startsWith((process.env.SALES_INBOX || "sales@").toLowerCase()));
    const cap = await captureMessage({
      messageId: mail.messageId ?? `${email}:${subject}:${(mail.text ?? "").length}`, subject, text: forwarded ? (mail.text ?? "") : body, at: mail.date ? new Date(mail.date) : new Date(),
      direction: forwarded ? "in" : "out", staffId: staff?.id ?? null, external, forceLeadId: forcedLead(mail.subject ?? "", mail.to ?? ""),
    });
    if (cap) return { captured: cap.id, leadId: "leadId" in cap ? cap.leadId : null, duplicate: cap.duplicate };
    if (!forwarded && !external.length) return { ignored: "internal mail" };
  }
  const r = await createEnquiry({
    source: "email", name: isStaff && fwd ? fwd[1]?.trim() || null : name, email: isStaff && fwd ? fwd[2]!.toLowerCase() : isStaff ? splitAddrs(mail.to).find((a) => !a.startsWith("sales")) ?? email : email,
    subject: subject || "Email enquiry", message: (mail.text || body).slice(0, 8000), externalId: mail.messageId ? `mail:${mail.messageId}` : null, createdById: staff?.id ?? null,
  });
  return { enquiryId: r.id, duplicate: r.duplicate };
}

/** which product handles this email: the CRM build → enquiry, the helpdesk build → ticket; combined dev build decides by mailbox */
export function routeInbound(mail: InboundEmail): "enquiry" | "ticket" {
  if (EDITION === "crm") return "enquiry";
  if (EDITION === "helpdesk") return "ticket";
  const sales = (process.env.SALES_INBOX || "sales@").toLowerCase();
  return (mail.to ?? "").toLowerCase().includes(sales) ? "enquiry" : "ticket";
}
