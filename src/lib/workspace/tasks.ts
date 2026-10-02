import "server-only";
import { and, asc, eq, gte, isNull, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, tasks, users, leads } from "@/db";
import type { CurrentUser } from "@/lib/core/auth";

/** Supervisors (admins, managers, "all" access) see every task; everyone else sees tasks given to or by them. */
export const isSupervisor = (me: CurrentUser) => me.role === "admin" || me.role === "manager" || me.crmAccess === "all" || me.hdAccess === "all";
export function taskScope(me: CurrentUser): SQL | undefined {
  if (isSupervisor(me)) return undefined;
  return or(eq(tasks.assigneeId, me.id), eq(tasks.createdById, me.id))!;
}

/** Tasks as board cards. `who`: "me" (assigned to me), "byme" (I assigned), "all", or a user id. Done tasks: last 14 days only. */
export async function listTasks(me: CurrentUser, f: { who?: string; leadId?: number; ticketId?: number }) {
  const a = alias(users, "assignee"), c = alias(users, "creator");
  const who = f.leadId || f.ticketId ? "all" : (f.who ?? "me");
  const cond = [
    taskScope(me),
    who === "me" ? eq(tasks.assigneeId, me.id) : who === "byme" ? eq(tasks.createdById, me.id) : who !== "all" && Number(who) ? eq(tasks.assigneeId, Number(who)) : undefined,
    f.leadId ? eq(tasks.leadId, f.leadId) : undefined,
    f.ticketId ? eq(tasks.ticketId, f.ticketId) : undefined,
    f.leadId || f.ticketId ? undefined : or(isNull(tasks.doneAt), gte(tasks.doneAt, new Date(Date.now() - 14 * 864e5))),
  ];
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, notes: tasks.notes, status: tasks.status, priority: tasks.priority, dueAt: tasks.dueAt, assigneeId: tasks.assigneeId, assignee: a.name, createdBy: c.name, leadId: tasks.leadId, lead: leads.title, ticketId: tasks.ticketId })
    .from(tasks).leftJoin(a, eq(a.id, tasks.assigneeId)).leftJoin(c, eq(c.id, tasks.createdById)).leftJoin(leads, eq(leads.id, tasks.leadId))
    .where(and(...cond)).orderBy(asc(tasks.status), asc(tasks.dueAt), asc(tasks.id));
  return rows.map((r) => ({ ...r, ticketRef: r.ticketId ? `TKT-${String(r.ticketId).padStart(4, "0")}` : null }));
}
