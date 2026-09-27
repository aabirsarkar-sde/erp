"use server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, channels, channelMembers, chatMessages, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { isMember, messagesSince } from "@/lib/chat";

export async function sendChat(channelId: number, body: string, afterId: number) {
  const me = await requireUser();
  const text = body.trim().slice(0, 4000);
  if (!text || !(await isMember(channelId, me.id))) return { ok: false as const, messages: [] };
  const [m] = await db.insert(chatMessages).values({ channelId, authorId: me.id, body: text }).returning();
  await db.update(channelMembers).set({ lastReadId: m!.id }).where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, me.id)));
  return { ok: true as const, messages: await messagesSince(channelId, afterId) };
}

export async function markChatRead(channelId: number, lastId: number) {
  const me = await requireUser();
  if (!(await isMember(channelId, me.id))) return;
  await db.insert(channelMembers).values({ channelId, userId: me.id, lastReadId: lastId })
    .onConflictDoUpdate({ target: [channelMembers.channelId, channelMembers.userId], set: { lastReadId: lastId } });
}

export async function openDm(otherId: number) {
  const me = await requireUser();
  const other = await db.query.users.findFirst({ where: eq(users.id, otherId) });
  if (!other || other.id === me.id) redirect("/discuss");
  const key = [me.id, other.id].sort((a, b) => a - b).join(":");
  let c = await db.query.channels.findFirst({ where: eq(channels.dmKey, key) });
  if (!c) {
    [c] = await db.insert(channels).values({ name: key, kind: "dm", dmKey: key }).returning();
    await db.insert(channelMembers).values([{ channelId: c!.id, userId: me.id }, { channelId: c!.id, userId: other.id }]).onConflictDoNothing();
  }
  redirect(`/discuss/${c!.id}`);
}

export async function createChannel(fd: FormData) {
  const me = await requireUser();
  if (me.role === "agent") return;
  const name = String(fd.get("name") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  if (!name) return;
  const [c] = await db.insert(channels).values({ name, description: String(fd.get("description") ?? "").trim() || null }).returning();
  redirect(`/discuss/${c!.id}`);
}
