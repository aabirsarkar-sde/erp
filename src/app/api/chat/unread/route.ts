import { getCurrentUser } from "@/lib/auth";
import { unreadTotal } from "@/lib/chat";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ n: 0 });
  return Response.json({ n: await unreadTotal(me.id) });
}
