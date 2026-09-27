import { and, eq, gte, isNull, inArray } from "drizzle-orm";
import { db, calendarTokens, events, eventAttendees, activities, users } from "@/db";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { appUrl } from "@/lib/mail";
import { ACTIVITY_META } from "@/lib/crm";

// Private iCal feed: subscribe from Outlook / Google / Apple Calendar with this URL.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  const t = await db.query.calendarTokens.findFirst({ where: eq(calendarTokens.token, token) });
  if (!t) return new Response("Not found", { status: 404 });
  const u = await db.query.users.findFirst({ where: eq(users.id, t.userId) });
  if (!u?.active) return new Response("Not found", { status: 404 });
  const since = new Date(Date.now() - 60 * 864e5);
  const mine = db.select({ id: eventAttendees.eventId }).from(eventAttendees).where(eq(eventAttendees.userId, u.id));
  const [evs, acts] = await Promise.all([
    db.query.events.findMany({ where: and(inArray(events.id, mine), gte(events.endAt, since)), with: { owner: true } }),
    db.query.activities.findMany({ where: and(eq(activities.userId, u.id), isNull(activities.doneAt), gte(activities.dueAt, since)), with: { lead: { columns: { id: true, title: true } }, customer: { columns: { name: true } } } }),
  ]);
  const items: IcsEvent[] = [
    ...evs.map((e) => ({ uid: e.uid, title: e.title, start: e.startAt, end: e.endAt, allDay: e.allDay, description: e.description, location: e.location, sequence: e.sequence, url: `${appUrl()}/calendar/${e.id}` })),
    ...acts.filter((a) => a.dueAt).map((a) => ({
      uid: `activity-${a.id}@raybon-erp`,
      title: `${ACTIVITY_META[a.type].label}: ${a.summary}${a.customer ? ` (${a.customer.name})` : ""}`,
      start: a.dueAt!, end: a.dueAt!, allDay: true,
      description: a.lead ? `Opportunity: ${a.lead.title}` : a.note,
      url: a.lead ? `${appUrl()}/crm/${a.lead.id}` : `${appUrl()}/activities`,
    })),
  ];
  return new Response(buildIcs(items, { name: `Raybon — ${u.name}` }), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
