import { eq } from "drizzle-orm";
import { db, documents } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { readFileByKey } from "@/lib/storage";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const d = await db.query.documents.findFirst({ where: eq(documents.id, Number((await params).id)) });
  if (!d) return new Response("Not found", { status: 404 });
  const data = await readFileByKey(d.storageKey);
  const body = data instanceof Response ? data.body : new Uint8Array(data);
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(body, { headers: { "Content-Type": d.mime, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(d.name)}"`, "Cache-Control": "private, max-age=3600" } });
}
