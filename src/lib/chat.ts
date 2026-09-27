import "server-only";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db, channels, channelMembers, chatMessages, users } from "@/db";

export async function ensureDefaultChannels() {
  const n = await db.select({ n: sql<number>`count(*)` }).from(channels).where(eq(channels.kind, "channel"));
  if (Number(n[0]!.n) === 0) {
    await db.insert(channels).values([
      { name: "general", description: "Company-wide announcements and chat" },
      { name: "sales", description: "Deals, quotations and leads" },
      { name: "service", description: "Site visits, breakdowns and field updates" },
    ]);
  }
}

/** channels visible to user: all public channels + DMs they're in, with unread counts */
export async function listChannels(userId: number) {
  await ensureDefaultChannels();
  const pub = await db.select().from(channels).where(eq(channels.kind, "channel")).orderBy(asc(channels.name));
  if (pub.length) await db.insert(channelMembers).values(pub.map((c) => ({ channelId: c.id, userId }))).onConflictDoNothing();
  const rows = await db
    .select({
      id: channels.id, name: channels.name, kind: channels.kind, dmKey: channels.dmKey, description: channels.description, lastReadId: channelMembers.lastReadId,
      unread: sql<number>`(select count(*) from ${chatMessages} m where m.channel_id = ${channels.id} and m.id > ${channelMembers.lastReadId} and coalesce(m.author_id, 0) != ${userId})`,
      lastAt: sql<number>`(select max(m.created_at) from ${chatMessages} m where m.channel_id = ${channels.id})`,
    })
    .from(channels)
    .innerJoin(channelMembers, and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, userId)));
  const allUsers = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true));
  return rows.map((r) => {
    let title = `# ${r.name}`, otherId: number | null = null;
    if (r.kind === "dm") {
      const [a, b] = r.dmKey!.split(":").map(Number);
      otherId = a === userId ? b! : a!;
      title = allUsers.find((u) => u.id === otherId)?.name ?? "Direct message";
    }
    return { ...r, title, otherId, unread: Number(r.unread) };
  });
}

export async function ensureMembership(userId: number) {
  const pub = await db.select({ id: channels.id }).from(channels).where(eq(channels.kind, "channel"));
  if (pub.length) await db.insert(channelMembers).values(pub.map((c) => ({ channelId: c.id, userId }))).onConflictDoNothing();
}

export async function unreadTotal(userId: number) {
  await ensureMembership(userId);
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(chatMessages)
    .innerJoin(channelMembers, and(eq(channelMembers.channelId, chatMessages.channelId), eq(channelMembers.userId, userId)))
    .where(and(gt(chatMessages.id, channelMembers.lastReadId), sql`coalesce(${chatMessages.authorId}, 0) != ${userId}`));
  return Number(r!.n);
}

export async function isMember(channelId: number, userId: number) {
  const c = await db.query.channels.findFirst({ where: eq(channels.id, channelId) });
  if (!c) return false;
  if (c.kind === "channel") return true;
  return !!(await db.query.channelMembers.findFirst({ where: and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)) }));
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
