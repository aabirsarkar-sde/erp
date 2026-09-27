import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/chat";

export default async function DiscussIndex() {
  const me = await requireUser();
  const cs = await listChannels(me.id);
  const first = cs.find((c) => c.name === "general") ?? cs[0];
  redirect(first ? `/discuss/${first.id}` : "/");
}
