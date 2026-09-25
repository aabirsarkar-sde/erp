import "server-only";
import { and, asc, desc, eq, inArray, isNull, like, lt, or, sql, gte, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, tickets, customers, users, teams, STAGES, type Stage } from "@/db";
import { OPEN_STAGES } from "./constants";

export type TicketFilters = {
  q?: string;
  team?: string;
  stage?: string; // "open" | "all" | Stage
  priority?: string;
  assignee?: string; // "me" | "unassigned" | id
  preset?: string; // "unattended" | "high" | "overdue"
  sort?: string; // "new" | "priority" | "updated"
};

const openCond = inArray(tickets.stage, OPEN_STAGES);

export function ticketWhere(f: TicketFilters, meId: number) {
  const c: SQL[] = [];
  const stage = f.stage || "open";
  if (stage === "open") c.push(openCond);
  else if ((STAGES as readonly string[]).includes(stage)) c.push(eq(tickets.stage, stage as Stage));
  if (f.team) c.push(eq(tickets.teamId, Number(f.team)));
  if (f.priority) c.push(eq(tickets.priority, Number(f.priority)));
  if (f.assignee === "me") c.push(eq(tickets.assigneeId, meId));
  else if (f.assignee === "unassigned") c.push(isNull(tickets.assigneeId));
  else if (f.assignee) c.push(eq(tickets.assigneeId, Number(f.assignee)));
  if (f.preset === "unattended") c.push(isNull(tickets.firstResponseAt), openCond);
  if (f.preset === "high") c.push(gte(tickets.priority, 2), openCond);
  if (f.preset === "overdue") c.push(lt(tickets.dueAt, new Date()), openCond);
  if (f.q?.trim()) {
    const q = f.q.trim();
    const num = Number(q.replace(/^tkt-?/i, ""));
    const pat = `%${q}%`;
    const ors = [like(tickets.subject, pat), like(customers.name, pat), like(tickets.site, pat), like(tickets.tags, pat)];
    if (Number.isFinite(num) && num > 0) ors.push(eq(tickets.id, num));
    c.push(or(...ors)!);
  }
  return c.length ? and(...c) : undefined;
}

const assignee = alias(users, "assignee");

export async function listTickets(f: TicketFilters, meId: number, limit = 200) {
  const order =
    f.sort === "priority" ? [desc(tickets.priority), desc(tickets.createdAt)]
    : f.sort === "updated" ? [desc(tickets.updatedAt)]
    : f.sort === "oldest" ? [asc(tickets.createdAt)]
    : [desc(tickets.createdAt)];
  return db
    .select({
      id: tickets.id,
      subject: tickets.subject,
      stage: tickets.stage,
      priority: tickets.priority,
      category: tickets.category,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      dueAt: tickets.dueAt,
      firstResponseAt: tickets.firstResponseAt,
      customerId: tickets.customerId,
      customerName: customers.name,
      teamName: teams.location,
      assigneeName: assignee.name,
    })
    .from(tickets)
    .leftJoin(customers, eq(customers.id, tickets.customerId))
    .leftJoin(teams, eq(teams.id, tickets.teamId))
    .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
    .where(ticketWhere(f, meId))
    .orderBy(...order)
    .limit(limit);
}
export type TicketRow = Awaited<ReturnType<typeof listTickets>>[number];

export async function teamStats() {
  const open = sql`${tickets.stage} in ('new','in_progress','waiting')`;
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      location: teams.location,
      open: sql<number>`coalesce(sum(case when ${open} then 1 else 0 end),0)`,
      unassigned: sql<number>`coalesce(sum(case when ${open} and ${tickets.assigneeId} is null then 1 else 0 end),0)`,
      unattended: sql<number>`coalesce(sum(case when ${open} and ${tickets.firstResponseAt} is null then 1 else 0 end),0)`,
      high: sql<number>`coalesce(sum(case when ${open} and ${tickets.priority} >= 2 then 1 else 0 end),0)`,
    })
    .from(teams)
    .leftJoin(tickets, eq(tickets.teamId, teams.id))
    .where(eq(teams.active, true))
    .groupBy(teams.id)
    .orderBy(asc(teams.id));
  return rows.map((r) => ({ ...r, open: Number(r.open), unassigned: Number(r.unassigned), unattended: Number(r.unattended), high: Number(r.high) }));
}

export async function myStats(meId: number) {
  const open = sql`${tickets.stage} in ('new','in_progress','waiting')`;
  const [r] = await db
    .select({
      mine: sql<number>`coalesce(sum(case when ${open} and ${tickets.assigneeId} = ${meId} then 1 else 0 end),0)`,
      unassigned: sql<number>`coalesce(sum(case when ${open} and ${tickets.assigneeId} is null then 1 else 0 end),0)`,
      unattended: sql<number>`coalesce(sum(case when ${open} and ${tickets.firstResponseAt} is null then 1 else 0 end),0)`,
      overdue: sql<number>`coalesce(sum(case when ${open} and ${tickets.dueAt} < ${Math.floor(Date.now() / 1000)} then 1 else 0 end),0)`,
    })
    .from(tickets);
  return { mine: Number(r!.mine), unassigned: Number(r!.unassigned), unattended: Number(r!.unattended), overdue: Number(r!.overdue) };
}

export async function lookups() {
  const [t, u, c] = await Promise.all([
    db.select({ id: teams.id, name: teams.name, location: teams.location }).from(teams).where(eq(teams.active, true)).orderBy(asc(teams.id)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name)),
    db.select({ id: customers.id, name: customers.name, city: customers.city }).from(customers).orderBy(asc(customers.name)),
  ]);
  return { teams: t, users: u, customers: c };
}
