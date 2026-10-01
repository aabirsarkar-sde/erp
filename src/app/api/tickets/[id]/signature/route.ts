import { eq } from "drizzle-orm";
import { db, tickets } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { readFileByKey } from "@/lib/storage";
import { canSeeTicket } from "@/lib/access";

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const t = await db.query.tickets.findFirst({ where: eq(tickets.id, Number((await params).id)) });
  if (!t?.signatureKey || !(await canSeeTicket(me, t.id))) return new Response("Not found", { status: 404 });
  const d = await readFileByKey(t.signatureKey);
  return new Response(d instanceof Response ? d.body : new Uint8Array(d), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}
