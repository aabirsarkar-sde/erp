import { graphConfigured } from "@/lib/core/graph";
import { runMailbox } from "@/lib/core/inbound-router";

// Vercel Cron, daily: renew the Microsoft 365 "new mail" subscription and pick up anything unread.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET || "dev-cron-secret"}`) return new Response("Unauthorized", { status: 401 });
  if (!graphConfigured()) return Response.json({ skipped: "Microsoft 365 not configured" });
  return Response.json(await runMailbox());
}
