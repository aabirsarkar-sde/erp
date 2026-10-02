import { and, eq } from "drizzle-orm";
import { db, documents } from "@/db";
import { getCurrentUser } from "@/lib/core/auth";
import { readFileByKey } from "@/lib/core/storage";
import { documentScope } from "@/lib/core/access";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const [d] = await db.select().from(documents).where(and(eq(documents.id, Number((await params).id)), documentScope(me))).limit(1);
  if (!d) return new Response("Not found", { status: 404 });
  const data = await readFileByKey(d.storageKey);
  const body = data instanceof Response ? data.body : new Uint8Array(data);
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(body, { headers: { "Content-Type": d.mime, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(d.name)}"`, "Cache-Control": "private, max-age=3600" } });
}
