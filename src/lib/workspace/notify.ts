import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, notifications, NOTIFY_KINDS } from "@/db";

/** quick buttons on a notification: open a page, call, WhatsApp or email the customer */
export type NotifyAction = { label: string; href: string; kind?: "link" | "call" | "whatsapp" | "email" };
export type NotifyInput = {
  userId: number; kind: (typeof NOTIFY_KINDS)[number]; title: string; body?: string | null; href?: string | null;
  leadId?: number | null; actions?: NotifyAction[]; fromUserId?: number | null; dedupeKey?: string | null;
};

/** add to someone's bell. With a dedupeKey the same alert is never created twice. */
export async function notify(n: NotifyInput) {
  const r = await db.insert(notifications).values({ ...n, actions: n.actions?.length ? JSON.stringify(n.actions) : null })
    .onConflictDoNothing().returning({ id: notifications.id });
  return r[0]?.id ?? null;
}

export async function unreadCount(userId: number) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(r?.n ?? 0);
}

export const listNotifications = (userId: number, opts: { unread?: boolean; kind?: string; limit?: number } = {}) =>
  db.select().from(notifications)
    .where(and(eq(notifications.userId, userId), opts.unread ? isNull(notifications.readAt) : undefined, opts.kind ? eq(notifications.kind, opts.kind as (typeof NOTIFY_KINDS)[number]) : undefined))
    .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(opts.limit ?? 60);

export const parseActions = (s: string | null): NotifyAction[] => { if (!s) return []; try { return JSON.parse(s); } catch { return []; } };

