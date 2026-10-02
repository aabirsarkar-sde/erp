import "server-only";
import { and, asc, desc, eq, inArray, isNull, like, lt, or, sql, gte, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, tickets, customers, users, teams, plants, teamMembers, STAGES, type Stage } from "@/db";
import { OPEN_STAGES } from "@/lib/helpdesk/constants";
import { ticketScope } from "@/lib/core/access";
import type { CurrentUser } from "@/lib/core/auth";
type Me = CurrentUser;

export type TicketFilters = {
  q?: string;
  team?: string;
  stage?: string; // "open" | "all" | Stage
  customer?: string;
  priority?: string;
  assignee?: string; // "me" | "unassigned" | id
  preset?: string; // "unattended" | "high" | "overdue"
  plant?: string;
  type?: string;
  city?: string;
  from?: string; // YYYY-MM-DD (reported/created)
  to?: string;
  sort?: string; // "new" | "priority" | "updated"
};

const openCond = inArray(tickets.stage, OPEN_STAGES);

function ticketWhere(f: TicketFilters, me: Me) {
  const meId = me.id;
  const c: SQL[] = [];
  const scope = ticketScope(me);
  if (scope) c.push(scope);
  const stage = f.stage || "open";
  if (stage === "open") c.push(openCond);
  else if (stage === "resolved") c.push(inArray(tickets.stage, ["resolved", "closed"])); // "Done" includes archived
  else if ((STAGES as readonly string[]).includes(stage)) c.push(eq(tickets.stage, stage as Stage));
  if (f.team) c.push(eq(tickets.teamId, Number(f.team)));
  if (f.plant) c.push(eq(tickets.plantId, Number(f.plant)));
  if (f.customer) c.push(eq(tickets.customerId, Number(f.customer)));
  if (f.type) c.push(eq(tickets.category, f.type));
  if (f.city) c.push(or(eq(plants.city, f.city), eq(plants.state, f.city), eq(customers.city, f.city))!);
  if (f.from) c.push(gte(sql`coalesce(${tickets.reportedAt}, ${tickets.createdAt})`, Math.floor(Date.parse(f.from + "T00:00:00+05:30") / 1000)));
  if (f.to) c.push(lt(sql`coalesce(${tickets.reportedAt}, ${tickets.createdAt})`, Math.floor(Date.parse(f.to + "T00:00:00+05:30") / 1000) + 86400));
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
    const ors = [like(tickets.subject, pat), like(customers.name, pat), like(tickets.site, pat), like(tickets.tags, pat), like(plants.plantNo, pat), like(plants.name, pat), like(tickets.complainantName, pat)];
    if (Number.isFinite(num) && num > 0) ors.push(eq(tickets.id, num));
    c.push(or(...ors)!);
  }
  return c.length ? and(...c) : undefined;
}

const assignee = alias(users, "assignee");

export async function listTickets(f: TicketFilters, me: Me, limit = 200) {
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
      plantNo: plants.plantNo,
      plantName: plants.name,
      city: plants.city,
      state: plants.state,
      reportedAt: tickets.reportedAt,
      resolvedAt: tickets.resolvedAt,
      tatMinutes: tickets.tatMinutes,
      complainantName: tickets.complainantName,
      csatScore: tickets.csatScore,
    })
    .from(tickets)
    .leftJoin(plants, eq(plants.id, tickets.plantId))
    .leftJoin(customers, eq(customers.id, tickets.customerId))
    .leftJoin(teams, eq(teams.id, tickets.teamId))
    .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
    .where(ticketWhere(f, me))
    .orderBy(...order)
    .limit(limit);
}
export type TicketRow = Awaited<ReturnType<typeof listTickets>>[number];

export async function teamStats(me: Me) {
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
    .leftJoin(tickets, and(eq(tickets.teamId, teams.id), ticketScope(me)))
    .where(and(eq(teams.active, true), me.hdAccess === "all" ? undefined : inArray(teams.id, db.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, me.id)))))
    .groupBy(teams.id)
    .orderBy(asc(teams.id));
  return rows.map((r) => ({ ...r, open: Number(r.open), unassigned: Number(r.unassigned), unattended: Number(r.unattended), high: Number(r.high) }));
}

export async function myStats(me: Me) {
  const meId = me.id;
  const open = sql`${tickets.stage} in ('new','in_progress','waiting')`;
  const [r] = await db
    .select({
      mine: sql<number>`coalesce(sum(case when ${open} and ${tickets.assigneeId} = ${meId} then 1 else 0 end),0)`,
      unassigned: sql<number>`coalesce(sum(case when ${open} and ${tickets.assigneeId} is null then 1 else 0 end),0)`,
      unattended: sql<number>`coalesce(sum(case when ${open} and ${tickets.firstResponseAt} is null then 1 else 0 end),0)`,
      overdue: sql<number>`coalesce(sum(case when ${open} and ${tickets.dueAt} < ${Math.floor(Date.now() / 1000)} then 1 else 0 end),0)`,
    })
    .from(tickets)
    .where(ticketScope(me));
  return { mine: Number(r!.mine), unassigned: Number(r!.unassigned), unattended: Number(r!.unattended), overdue: Number(r!.overdue) };
}


