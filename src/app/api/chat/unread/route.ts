import { getCurrentUser } from "@/lib/core/auth";
import { unreadTotal } from "@/lib/workspace/chat";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ n: 0 });
  return Response.json({ n: await unreadTotal(me.id) });
}
