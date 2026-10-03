import { findNudges, deliverNudges } from "@/lib/crm/nudges";

// Vercel Cron, every morning (see vercel.json): AI follow-up suggestions into each salesperson's bell.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET || "dev-cron-secret"}`) return new Response("Unauthorized", { status: 401 });
  const nudges = await findNudges();
  return Response.json({ found: nudges.length, ...(await deliverNudges(nudges)) });
}
