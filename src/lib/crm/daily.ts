import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db, activities, events, eventAttendees, diaryEntries, users, leads, customers, settings } from "@/db";
import { activityScope } from "@/lib/core/access";
import { DAY_MS, fromLocalInput, fmtTime } from "@/lib/core/tz";
import type { CurrentUser } from "@/lib/core/auth";

/**
 * One person's day: the plan (meetings + planned activities), the work done (completed activities
 * with their reports) and the diary note. The calendar "Day" view and the daily report both use this.
 */
export async function personDay(userIds: number[], day: string, me: CurrentUser | null) {
  const start = fromLocalInput(day)!;
  const end = new Date(+start + DAY_MS);
  const scope = me ? activityScope(me) : undefined;
  const actCols = { id: activities.id, type: activities.type, summary: activities.summary, outcome: activities.outcome, discussion: activities.discussion, nextAction: activities.nextAction, dueAt: activities.dueAt, doneAt: activities.doneAt, userId: activities.userId, leadId: activities.leadId, lead: leads.title, customer: customers.name };
  const [planned, done, evs, diary] = await Promise.all([
    db.select(actCols).from(activities).leftJoin(leads, eq(leads.id, activities.leadId)).leftJoin(customers, eq(customers.id, activities.customerId))
      .where(and(scope, inArray(activities.userId, userIds), isNull(activities.doneAt), gte(activities.dueAt, start), lt(activities.dueAt, end))).orderBy(asc(activities.dueAt)),
    db.select(actCols).from(activities).leftJoin(leads, eq(leads.id, activities.leadId)).leftJoin(customers, eq(customers.id, activities.customerId))
      .where(and(scope, inArray(activities.userId, userIds), isNotNull(activities.doneAt), gte(activities.doneAt, start), lt(activities.doneAt, end))).orderBy(asc(activities.doneAt)),
    db.select({ id: events.id, title: events.title, startAt: events.startAt, endAt: events.endAt, allDay: events.allDay, location: events.location, userId: eventAttendees.userId })
      .from(events).innerJoin(eventAttendees, eq(eventAttendees.eventId, events.id))
      .where(and(inArray(eventAttendees.userId, userIds), lt(events.startAt, end), gte(events.endAt, start))).orderBy(asc(events.startAt)),
    db.select().from(diaryEntries).where(and(inArray(diaryEntries.userId, userIds), eq(diaryEntries.day, day))),
  ]);
  return { planned, done, events: evs, diary };
}
export type PersonDay = Awaited<ReturnType<typeof personDay>>;

/** salespeople whose day gets reported (active users with Sales/CRM access) */
export const salesTeam = () =>
  db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users)
    .where(and(eq(users.active, true), ne(users.crmAccess, "none"))).orderBy(asc(users.name));

export async function dailyReportRecipients(): Promise<string[]> {
  const r = await db.query.settings.findFirst({ where: eq(settings.key, "daily_report_to") });
  const list = (r?.value ?? "").split(/[,;\s]+/).filter((x) => /@/.test(x));
  if (list.length) return list;
  const admins = await db.select({ email: users.email }).from(users).where(and(eq(users.active, true), or(eq(users.role, "admin"))));
  return admins.map((a) => a.email);
}

/** plain-text daily report for email */
export function reportText(day: string, team: { id: number; name: string }[], d: PersonDay) {
  const L: string[] = [];
  for (const p of team) {
    const done = d.done.filter((a) => a.userId === p.id), plan = d.planned.filter((a) => a.userId === p.id), evs = d.events.filter((e) => e.userId === p.id);
    const diary = d.diary.find((x) => x.userId === p.id)?.body.trim();
    L.push(`■ ${p.name} — ${done.length} done, ${plan.length + evs.length} planned${!done.length && !diary ? "  ⚠ NO REPORT FILED" : ""}`);
    for (const a of done) L.push(`  ✓ ${fmtTime(a.doneAt!)} ${a.type.toUpperCase()} ${a.customer ? `${a.customer}: ` : ""}${a.summary}${a.outcome ? ` → ${a.outcome}` : ""}${a.nextAction ? ` (next: ${a.nextAction})` : ""}`);
    for (const a of plan) L.push(`  ○ not done: ${a.customer ? `${a.customer}: ` : ""}${a.summary}`);
    for (const e of evs) L.push(`  ◷ ${e.allDay ? "all day" : fmtTime(e.startAt)} meeting: ${e.title}`);
    if (diary) L.push(`  Diary: ${diary.replace(/\n+/g, " / ")}`);
    L.push("");
  }
  return `Daily sales report — ${day}\n\n${L.join("\n")}`;
}
