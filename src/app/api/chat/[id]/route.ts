import { getCurrentUser } from "@/lib/core/auth";
import { isMember, messagesSince } from "@/lib/workspace/chat";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!(await isMember(id, me.id))) return new Response("Forbidden", { status: 403 });
  const after = Number(new URL(req.url).searchParams.get("after")) || 0;
  return Response.json(await messagesSince(id, after));
}
