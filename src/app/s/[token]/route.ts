import { and, eq, isNotNull } from "drizzle-orm";
import { db, documents } from "@/db";
import { readShare } from "@/lib/core/share";
import { readFileByKey } from "@/lib/core/storage";

// public download for a shared collateral link (signed + expiring; see lib/core/share)
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = await readShare((await params).token);
  if (!id) return new Response("This link has expired. Please ask us for a new one.", { status: 410 });
  const [d] = await db.select().from(documents).where(and(eq(documents.id, id), isNotNull(documents.category))).limit(1);
  if (!d) return new Response("Not found", { status: 404 });
  const data = await readFileByKey(d.storageKey);
  const body = data instanceof Response ? data.body : new Uint8Array(data);
  return new Response(body, { headers: { "Content-Type": d.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(d.name)}"`, "Cache-Control": "private, max-age=3600" } });
}
