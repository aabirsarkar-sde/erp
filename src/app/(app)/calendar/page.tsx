import Link from "next/link";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, events, eventAttendees, activities, tickets, plants } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { activityScope, ticketScope } from "@/lib/core/access";
import { lookups } from "@/lib/core/lookups";
import { regenerateCalendarToken } from "@/app/actions/calendar";
import { getOrCreateCalendarToken } from "@/lib/workspace/calendar";
import { PageHeader, LinkButton } from "@/components/ui/ui";
import { ParamSelect } from "@/components/ui/url-filters";
import { CopyField } from "@/components/ui/copy-field";
import { IconPlus } from "@/components/ui/icons";
import { ACTIVITY_META } from "@/lib/crm/meta";
import { typeMeta, ticketRef } from "@/lib/helpdesk/constants";
import { fmtTat } from "@/lib/core/format";
import { appUrl } from "@/lib/core/mail";
import { DayView } from "./day-view";
import { DAY_MS, fromLocalInput, localDateKey, localParts, startOfLocalMonth, startOfLocalWeek, fmtTime } from "@/lib/core/tz";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const HOUR_PX = 44, FIRST_H = 7, LAST_H = 21;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["bg-sky-100 border-sky-400 text-sky-900", "bg-violet-100 border-violet-400 text-violet-900", "bg-amber-100 border-amber-400 text-amber-900", "bg-emerald-100 border-emerald-400 text-emerald-900", "bg-rose-100 border-rose-400 text-rose-900", "bg-teal-100 border-teal-400 text-teal-900"];

type Ev = { id: number; title: string; startAt: Date; endAt: Date; allDay: boolean; location: string | null; ownerId: number | null };
type Act = { id: number; type: keyof typeof ACTIVITY_META; summary: string; dueAt: Date | null; leadId: number | null; doneAt: Date | null; durationMin: number | null; location: string | null };
const timed = (a: Act) => { if (!a.dueAt) return false; const p = localParts(a.dueAt); return p.h !== 0 || p.min !== 0; };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  // Sales people live in the Day view (planner · work done · diary); others start on the week
  const defView = me.crmAccess !== "none" && me.hdAccess === "none" ? "day" : "week";
  if ((sp.view ?? defView) === "day" && me.crmAccess !== "none") return <DayView me={me} sp={sp} />;
  const view = sp.view === "month" ? "month" : "week";
  const anchor = (sp.date && fromLocalInput(sp.date)) || new Date();
  const from = view === "week" ? startOfLocalWeek(anchor) : startOfLocalWeek(startOfLocalMonth(anchor));
  const days = view === "week" ? 7 : 42;
  const to = new Date(+from + days * DAY_MS);
  const canAll = me.crmAccess === "all" || me.hdAccess === "all" || me.role === "admin";
  const who = !canAll ? me.id : sp.who === "all" ? null : sp.who ? Number(sp.who) || me.id : me.id;

  const mine = who ? db.select({ id: eventAttendees.eventId }).from(eventAttendees).where(eq(eventAttendees.userId, who)) : null;
  const show = sp.show ?? "all";
  const tAt = sql<number>`coalesce(${tickets.reportedAt}, ${tickets.createdAt})`;
  const [lk, evs, acts, token, tks] = await Promise.all([
    lookups(),
    db.select().from(events).where(and(lt(events.startAt, to), gte(events.endAt, from), mine ? inArray(events.id, mine) : undefined)),
    // planned items sit on their due time, finished ones on when they were done
    db.select().from(activities).where(and(activityScope(me), or(and(isNull(activities.doneAt), gte(activities.dueAt, from), lt(activities.dueAt, to)), and(gte(activities.doneAt, from), lt(activities.doneAt, to))), who ? eq(activities.userId, who) : undefined))
      .then((xs) => xs.map((x) => ({ ...x, dueAt: x.doneAt ?? x.dueAt }))),
    getOrCreateCalendarToken(me.id),
    db.select({ id: tickets.id, category: tickets.category, stage: tickets.stage, tat: tickets.tatMinutes, at: tAt, plantNo: plants.plantNo, subject: tickets.subject })
      .from(tickets).leftJoin(plants, eq(plants.id, tickets.plantId))
      .where(and(ticketScope(me), gte(tAt, Math.floor(+from / 1000)), lt(tAt, Math.floor(+to / 1000)), who && sp.who ? eq(tickets.assigneeId, who) : undefined)),
  ]);
  const showEvents = show !== "tickets", showTickets = show !== "events";
  const hasCrm = me.crmAccess !== "none", hasHd = me.hdAccess !== "none";
  const slotHref = (d: Date, h: number) => (hasCrm ? `/calendar?view=day&date=${localDateKey(d)}&at=${String(h).padStart(2, "0")}:00` : `/calendar/new?start=${localDateKey(d)}T${String(h).padStart(2, "0")}:00`);
  type Tk = (typeof tks)[number];
  const tksOn = (d: Date) => (showTickets ? tks.filter((t) => localDateKey(Number(t.at) * 1000) === localDateKey(d)) : []);
  const TicketChip = ({ t }: { t: Tk }) => {
    const done = t.stage === "resolved" || t.stage === "closed";
    return (
      <Link href={`/tickets/${t.id}`} className={`block truncate rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset ${done ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : typeMeta(t.category).chip}`} title={`${ticketRef(t.id)} ${t.subject}`}>
        {done ? "✓" : typeMeta(t.category).icon} {t.plantNo ?? ticketRef(t.id)} · {t.category ?? "Complaint"}{done && t.tat != null ? ` · ${fmtTat(t.tat)}` : ""}
      </Link>
    );
  };
  const dayList = Array.from({ length: days }, (_, i) => new Date(+from + i * DAY_MS));
  const todayKey = localDateKey(new Date());
  const colorOf = (e: Ev) => COLORS[(e.ownerId ?? e.id) % COLORS.length]!;
  const evsOn = (d: Date) => (showEvents ? evs.filter((e) => +e.startAt < +d + DAY_MS && +e.endAt > +d) : []);
  const actsOn = (d: Date) => (showEvents ? acts.filter((a) => a.dueAt && localDateKey(a.dueAt) === localDateKey(d)) : []) as Act[];
  const step = view === "week" ? 7 : 30;
  const nav = (delta: number) => { const t = new Date(+(view === "week" ? from : startOfLocalMonth(anchor)) + delta * DAY_MS + (view === "month" && delta > 0 ? 3 * DAY_MS : 0)); return `/calendar?${new URLSearchParams({ ...(sp as Record<string, string>), date: localDateKey(view === "month" ? startOfLocalMonth(t) : t) })}`; };
  const a = localParts(anchor), f = localParts(from), l = localParts(new Date(+from + 6 * DAY_MS));
  const title = view === "month" ? `${MONTHS[a.m]} ${a.y}` : f.m === l.m ? `${f.d}–${l.d} ${MONTHS[f.m]} ${f.y}` : `${f.d} ${MONTHS[f.m]} – ${l.d} ${MONTHS[l.m]} ${l.y}`;
  const feed = `${appUrl()}/api/calendar/${token}.ics`;

  const ActChip = ({ x }: { x: Act }) => (
    <Link href={`/activities/${x.id}`} className={`block truncate rounded px-1.5 py-0.5 text-[11px] hover:bg-slate-200 ${x.doneAt ? "bg-emerald-50 text-emerald-800 line-through decoration-emerald-400" : "bg-slate-100 text-slate-700"}`} title={x.summary}>
      {x.doneAt ? "✓" : ACTIVITY_META[x.type].emoji} {timed(x) ? `${fmtTime(x.dueAt!)} ` : ""}{x.summary}
    </Link>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Calendar" subtitle={title} actions={<><LinkButton href="/calendar/new" variant="secondary"><IconPlus className="size-4" />Event</LinkButton>{hasCrm && <LinkButton href={`/calendar/activity?start=${localDateKey(anchor)}T10:00`} variant={hasHd ? "secondary" : "primary"}><IconPlus className="size-4" />Activity / visit</LinkButton>}{hasHd && <LinkButton href={`/tickets/new?date=${localDateKey(anchor)}`}><IconPlus className="size-4" />Complaint</LinkButton>}</>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          <Link href={nav(-step)} className="rounded-md px-2.5 py-1 hover:bg-slate-100">‹</Link>
          <Link href={`/calendar?${new URLSearchParams({ ...(sp as Record<string, string>), date: todayKey })}`} className="rounded-md px-3 py-1 font-medium hover:bg-slate-100">Today</Link>
          <Link href={nav(step)} className="rounded-md px-2.5 py-1 hover:bg-slate-100">›</Link>
        </div>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(hasCrm ? (["day", "week", "month"] as const) : (["week", "month"] as const)).map((v) => (
            <Link key={v} href={`/calendar?${new URLSearchParams({ ...(sp as Record<string, string>), view: v })}`} className={`rounded-md px-3 py-1 capitalize ${view === v ? "bg-slate-100 font-medium" : "text-slate-500"}`}>{v}</Link>
          ))}
        </div>
        <ParamSelect name="show" fallback="all" options={[["all", hasHd && hasCrm ? "Complaints + activities" : "Everything"], ...(hasHd ? [["tickets", "Complaints only"]] : []), ["events", "Meetings & activities only"]] as [string, string][]} />
        {canAll && <ParamSelect name="who" fallback="me" options={[["me", "My calendar"], ["all", "Everyone"], ...lk.users.filter((u) => u.id !== me.id).map((u) => [String(u.id), u.name] as [string, string])]} />}
      </div>

      {view === "week" ? (
        <>
          {/* desktop week grid */}
          <div className="card hidden overflow-hidden md:block">
            <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50 text-xs">
              <div />
              {dayList.map((d) => {
                const p = localParts(d), today = localDateKey(d) === todayKey;
                return <div key={+d} className="border-l border-slate-200 px-2 py-2 text-center"><span className="text-slate-500">{DOW[p.dow]}</span> <span className={`ml-1 inline-flex size-6 items-center justify-center rounded-full font-semibold ${today ? "bg-brand-600 text-white" : ""}`}>{p.d}</span></div>;
              })}
            </div>
            <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-slate-200">
              <div className="px-1 py-1.5 text-right text-[10px] text-slate-400">all-day</div>
              {dayList.map((d) => (
                <div key={+d} className="group min-h-8 space-y-0.5 border-l border-slate-200 p-1">
                  {tksOn(d).map((t) => <TicketChip key={`t${t.id}`} t={t} />)}
                  {evsOn(d).filter((e) => e.allDay).map((e) => <Link key={e.id} href={`/calendar/${e.id}`} className={`block truncate rounded border-l-2 px-1.5 py-0.5 text-[11px] font-medium ${colorOf(e)}`}>{e.title}</Link>)}
                  {actsOn(d).filter((x) => !timed(x)).map((x) => <ActChip key={x.id} x={x} />)}
                  {hasHd && <Link href={`/tickets/new?date=${localDateKey(d)}`} className="block rounded px-1.5 py-0.5 text-[11px] text-brand-700 opacity-0 hover:bg-brand-50 group-hover:opacity-100">+ complaint</Link>}
                </div>
              ))}
            </div>
            <div className="relative grid max-h-[62vh] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] overflow-y-auto">
              <div>{Array.from({ length: LAST_H - FIRST_H }, (_, i) => <div key={i} style={{ height: HOUR_PX }} className="pr-1 text-right text-[10px] text-slate-400">{((FIRST_H + i) % 12 || 12) + (FIRST_H + i < 12 ? "am" : "pm")}</div>)}</div>
              {dayList.map((d) => {
                type Blk = { key: string; href: string; title: string; sub: string; startAt: Date; endAt: Date; cls: string };
                const dayEvs: Blk[] = [
                  ...evsOn(d).filter((e) => !e.allDay).map((e) => ({ key: `e${e.id}`, href: `/calendar/${e.id}`, title: e.title, sub: `${fmtTime(e.startAt)}${e.location ? ` · ${e.location}` : ""}`, startAt: e.startAt, endAt: e.endAt, cls: colorOf(e) })),
                  ...actsOn(d).filter(timed).map((x) => ({ key: `a${x.id}`, href: `/activities/${x.id}`, title: `${x.doneAt ? "✓" : ACTIVITY_META[x.type].emoji} ${x.summary}`, sub: `${fmtTime(x.dueAt!)}${x.location ? ` · ${x.location}` : ""}`, startAt: x.dueAt!, endAt: new Date(+x.dueAt! + (x.durationMin || 30) * 60e3), cls: x.doneAt ? "bg-emerald-50 border-emerald-500 text-emerald-900" : "bg-white border-slate-500 text-slate-800 ring-1 ring-slate-200" })),
                ].sort((x, y) => +x.startAt - +y.startAt);
                // simple lane assignment for overlaps
                const lanes: number[] = []; const laneOf = new Map<string, number>();
                for (const e of dayEvs) { let li = lanes.findIndex((end) => end <= +e.startAt); if (li < 0) { li = lanes.length; lanes.push(0); } lanes[li] = +e.endAt; laneOf.set(e.key, li); }
                const n = Math.max(1, lanes.length);
                return (
                  <div key={+d} className={`relative border-l border-slate-200 ${localDateKey(d) === todayKey ? "bg-brand-50/30" : ""}`}>
                    {Array.from({ length: LAST_H - FIRST_H }, (_, i) => (
                      <Link key={i} href={slotHref(d, FIRST_H + i)} style={{ height: HOUR_PX }} className="block border-b border-slate-100 hover:bg-brand-50/60" aria-label={hasCrm ? "New activity" : "New event"} />
                    ))}
                    {dayEvs.map((e) => {
                      const sh = Math.max(FIRST_H, (+e.startAt - +d) / 3600e3), eh = Math.min(LAST_H, (+e.endAt - +d) / 3600e3);
                      if (eh <= FIRST_H || sh >= LAST_H) return null;
                      const li = laneOf.get(e.key)!;
                      return (
                        <Link key={e.key} href={e.href} className={`absolute overflow-hidden rounded border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight shadow-xs hover:z-10 hover:shadow ${e.cls}`}
                          style={{ top: (sh - FIRST_H) * HOUR_PX + 1, height: Math.max(20, (eh - sh) * HOUR_PX - 2), left: `calc(${(li / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}>
                          <div className="truncate font-semibold">{e.title}</div>
                          <div className="truncate opacity-75">{e.sub}</div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {/* mobile agenda */}
          <div className="space-y-3 md:hidden">
            {dayList.map((d) => {
              const es = evsOn(d).sort((x, y) => +x.startAt - +y.startAt), as = actsOn(d), ts = tksOn(d), p = localParts(d);
              return (
                <section key={+d} className="card overflow-hidden">
                  <div className={`flex items-center justify-between px-4 py-2 text-sm font-semibold ${localDateKey(d) === todayKey ? "bg-brand-50 text-brand-800" : "bg-slate-50"}`}>
                    <span>{DOW[p.dow]} {p.d} {MONTHS[p.m]}</span>
                    <span className="flex gap-3">{hasHd && <Link href={`/tickets/new?date=${localDateKey(d)}`} className="text-xs font-medium text-brand-700">+ Complaint</Link>}{hasCrm && <Link href={slotHref(d, 10)} className="text-xs font-medium text-brand-700">+ Activity</Link>}<Link href={`/calendar/new?start=${localDateKey(d)}T10:00`} className="text-xs font-medium text-slate-500">+ Event</Link></span>
                  </div>
                  {ts.length > 0 && <div className="space-y-1 px-4 pt-2">{ts.map((t) => <TicketChip key={t.id} t={t} />)}</div>}
                  {es.length + as.length + ts.length === 0 ? <p className="px-4 py-2 text-xs text-slate-400">Nothing scheduled</p> : (
                    <ul className="divide-y divide-slate-100">
                      {es.map((e) => <li key={e.id}><Link href={`/calendar/${e.id}`} className="flex gap-3 px-4 py-2.5 text-sm"><span className="w-16 shrink-0 text-xs text-slate-500">{e.allDay ? "All day" : fmtTime(e.startAt)}</span><span className="min-w-0"><span className="block truncate font-medium">{e.title}</span>{e.location && <span className="block truncate text-xs text-slate-500">{e.location}</span>}</span></Link></li>)}
                      {as.map((x) => <li key={`a${x.id}`} className="px-4 py-2"><ActChip x={x} /></li>)}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50 text-center text-xs text-slate-500">{DOW.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))]">
            {dayList.map((d) => {
              const p = localParts(d), inMonth = p.m === a.m, es = evsOn(d).sort((x, y) => +x.startAt - +y.startAt), as = actsOn(d);
              const items = [...tksOn(d).map((t) => ({ k: `t${t.id}`, node: <TicketChip t={t} /> })), ...es.map((e) => ({ k: `e${e.id}`, node: <Link href={`/calendar/${e.id}`} className={`block truncate rounded border-l-2 px-1 text-[11px] ${colorOf(e)}`}>{e.allDay ? "" : `${fmtTime(e.startAt)} `}{e.title}</Link> })), ...as.map((x) => ({ k: `a${x.id}`, node: <ActChip x={x} /> }))];
              return (
                <div key={+d} className={`min-h-24 border-b border-l border-slate-100 p-1 ${inMonth ? "" : "bg-slate-50/70"}`}>
                  <Link href={`/calendar?date=${localDateKey(d)}`} className={`mb-0.5 inline-flex size-6 items-center justify-center rounded-full text-xs ${localDateKey(d) === todayKey ? "bg-brand-600 font-semibold text-white" : inMonth ? "text-slate-700" : "text-slate-400"}`}>{p.d}</Link>
                  <div className="space-y-0.5">{items.slice(0, 3).map((it) => <div key={it.k}>{it.node}</div>)}{items.length > 3 && <div className="px-1 text-[10px] text-slate-500">+{items.length - 3} more</div>}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <details className="card mt-5 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Sync with Outlook, Google or Apple Calendar</summary>
        <div className="mt-3 space-y-2 text-slate-600">
          <p>Subscribe to this private link and your Raybon meetings and follow-ups appear in your phone and Outlook calendar (updates every ~30 min). Don&apos;t share it.</p>
          <CopyField value={feed} />
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            <li><b>Outlook:</b> Calendar → Add calendar → Subscribe from web → paste the link.</li>
            <li><b>Google Calendar:</b> Other calendars → + → From URL → paste the link.</li>
            <li><b>iPhone:</b> Settings → Calendar → Accounts → Add subscribed calendar.</li>
          </ul>
          <form action={regenerateCalendarToken}><button className="text-xs text-slate-500 underline">Reset link (old link stops working)</button></form>
        </div>
      </details>
    </div>
  );
}
