import { eq } from "drizzle-orm";
import { db, attachments } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { readFileByKey } from "@/lib/storage";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const a = await db.query.attachments.findFirst({ where: eq(attachments.id, Number((await params).id)) });
  if (!a) return new Response("Not found", { status: 404 });
  const data = await readFileByKey(a.storageKey);
  const body = data instanceof Response ? data.body : new Uint8Array(data);
  const download = new URL(req.url).searchParams.has("download");
  return new Response(body, {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(a.name)}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
