import { handleInbound, type InboundEmail } from "@/lib/inbound";
import { revalidatePath } from "next/cache";

// POST JSON { from, subject, text, attachments?: [{ filename, contentType, content(base64) }] }
// Auth: header "x-inbound-secret" (or ?secret=) must equal INBOUND_EMAIL_SECRET.
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
  const r = await handleInbound(mail);
  revalidatePath("/", "layout");
  return Response.json(r);
}
