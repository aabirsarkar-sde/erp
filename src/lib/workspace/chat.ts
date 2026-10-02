import "server-only";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db, channels, channelMembers, chatMessages, users } from "@/db";

// Public channels are visible to everyone without a membership row; a row is only written
// when someone reads (lastReadId) or joins a DM. So listing and unread counts are single
// read queries — no writes on page loads or on the 20-second unread poll.
const memberJoin = (userId: number) => and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, userId));
const visible = sql`(${channels.kind} = 'channel' or ${channelMembers.userId} is not null)`;
const lastRead = sql`coalesce(${channelMembers.lastReadId}, 0)`;

/** channels visible to user: all public channels + DMs they're in, with unread counts */
export async function listChannels(userId: number) {
  const [rows, allUsers] = await Promise.all([
    db
      .select({
        id: channels.id, name: channels.name, kind: channels.kind, dmKey: channels.dmKey, description: channels.description,
        lastReadId: sql<number>`${lastRead}`,
        unread: sql<number>`(select count(*) from ${chatMessages} m where m.channel_id = ${channels.id} and m.id > ${lastRead} and coalesce(m.author_id, 0) != ${userId})`,
        lastAt: sql<number>`(select max(m.created_at) from ${chatMessages} m where m.channel_id = ${channels.id})`,
      })
      .from(channels)
      .leftJoin(channelMembers, memberJoin(userId))
      .where(visible)
      .orderBy(asc(channels.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)),
  ]);
  return rows.map((r) => {
    let title = `# ${r.name}`, otherId: number | null = null;
    if (r.kind === "dm") {
      const [a, b] = r.dmKey!.split(":").map(Number);
      otherId = a === userId ? b! : a!;
      title = allUsers.find((u) => u.id === otherId)?.name ?? "Direct message";
    }
    return { ...r, title, otherId, unread: Number(r.unread), lastReadId: Number(r.lastReadId) };
  });
}

export async function unreadTotal(userId: number) {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(chatMessages)
    .innerJoin(channels, eq(channels.id, chatMessages.channelId))
    .leftJoin(channelMembers, memberJoin(userId))
    .where(and(visible, sql`${chatMessages.id} > ${lastRead}`, sql`coalesce(${chatMessages.authorId}, 0) != ${userId}`));
  return Number(r!.n);
}

export async function isMember(channelId: number, userId: number) {
  const [r] = await db
    .select({ id: channels.id })
    .from(channels)
    .leftJoin(channelMembers, memberJoin(userId))
    .where(and(eq(channels.id, channelId), visible))
    .limit(1);
  return !!r;
}

export async function messagesSince(channelId: number, afterId: number, limit = 200) {
  const rows = await db.query.chatMessages.findMany({
    where: and(eq(chatMessages.channelId, channelId), gt(chatMessages.id, afterId)),
    orderBy: afterId ? asc(chatMessages.id) : desc(chatMessages.id),
    limit,
    with: { author: { columns: { id: true, name: true } } },
  });
  const list = afterId ? rows : rows.reverse();
  return list.map((m) => ({ id: m.id, body: m.body, at: +m.createdAt, authorId: m.author?.id ?? null, author: m.author?.name ?? "System" }));
}
export type ChatMsg = Awaited<ReturnType<typeof messagesSince>>[number];
