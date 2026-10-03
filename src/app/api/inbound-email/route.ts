import type { InboundEmail } from "@/lib/helpdesk/inbound";
import { handleIncomingMail } from "@/lib/core/inbound-router";
import { revalidatePath } from "next/cache";

// POST JSON { from, to?, subject, text, messageId?, attachments?: [{ filename, contentType, content(base64) }] }
// Auth: header "x-inbound-secret" (or ?secret=) must equal INBOUND_EMAIL_SECRET.
// Helpdesk build → creates / updates a ticket. CRM build → lands in the Enquiries inbox.
export async function POST(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  const given = req.headers.get("x-inbound-secret") || new URL(req.url).searchParams.get("secret");
  if (!secret || given !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  let mail: InboundEmail;
  try {
    mail = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!mail?.from) return Response.json({ error: "missing from" }, { status: 400 });
  const r = await handleIncomingMail(mail);
  revalidatePath("/", "layout");
  return Response.json(r);
}
