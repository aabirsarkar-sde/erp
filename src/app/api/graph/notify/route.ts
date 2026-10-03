import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { graphConfigured, processNotification, notificationKind } from "@/lib/core/graph";
import { handleIncomingMail, handleCaptured } from "@/lib/core/inbound-router";

// Microsoft Graph change notifications: "a new email arrived in the sales / support inbox".
// 1) on subscribe, Graph sends ?validationToken=… and expects it echoed back as text
// 2) afterwards it POSTs { value: [{ resource, clientState }] } — we answer 202 at once and fetch the mail after
export async function POST(req: Request) {
  const v = new URL(req.url).searchParams.get("validationToken");
  if (v) return new Response(v, { status: 200, headers: { "Content-Type": "text/plain" } });
  if (!graphConfigured()) return new Response(null, { status: 202 });
  let body: { value?: { resource: string; clientState?: string }[] } = {};
  try { body = await req.json(); } catch { return new Response(null, { status: 400 }); }
  const items = (body.value ?? []).map((n) => ({ ...n, kind: notificationKind(n.clientState) })).filter((n) => n.kind);
  after(async () => {
    for (const n of items) {
      try { await processNotification(n.resource, n.kind!, { inbox: handleIncomingMail, capture: handleCaptured }); } catch (e) { console.error("[graph notify]", e); }
    }
    if (items.length) revalidatePath("/", "layout");
  });
  return new Response(null, { status: 202 });
}
