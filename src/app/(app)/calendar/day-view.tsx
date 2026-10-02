import Link from "next/link";
import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { db, leads, tasks } from "@/db";
import { leadScope } from "@/lib/core/access";
import { lookups } from "@/lib/core/lookups";
import { personDay } from "@/lib/crm/daily";
import { ACTIVITY_META } from "@/lib/crm/meta";
import { DAY_MS, fromLocalInput, localDateKey, localParts, fmtTime } from "@/lib/core/tz";
import { PageHeader } from "@/components/ui/ui";
import { ParamSelect } from "@/components/ui/url-filters";
import { QuickEntry } from "@/components/crm/quick-entry";
import { DiaryBox } from "@/components/crm/diary-box";
import type { CurrentUser } from "@/lib/core/auth";

const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Calendar "Day": planner, work done and diary for one person — the daily report writes itself. */
export async function DayView({ me, sp }: { me: CurrentUser; sp: Record<string, string | undefined> }) {
  const anchor = (sp.date && fromLocalInput(sp.date)) || new Date();
  const day = localDateKey(anchor);
  const canAll = me.crmAccess === "all" || me.role === "admin";
  const who = canAll && sp.who && sp.who !== "me" ? Number(sp.who) || me.id : me.id;
  const own = who === me.id;
  const [d, lk, openLeads, dueTasks] = await Promise.all([
    personDay([who], day, me),
    lookups(),
    db.select({ id: leads.id, title: leads.title, customerId: leads.customerId }).from(leads).where(and(eq(leads.status, "open"), leadScope(me))).orderBy(asc(leads.title)),
    db.select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt }).from(tasks).where(and(eq(tasks.assigneeId, who), ne(tasks.status, "done"), gte(tasks.dueAt, fromLocalInput(day)!), lt(tasks.dueAt, new Date(+fromLocalInput(day)! + DAY_MS)))),
  ]);
  const p = localParts(anchor);
  const link = (date: string, extra: Record<string, string> = {}) => `/calendar?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), view: "day", date, ...extra })}`;
  const prev = localDateKey(+anchor - DAY_MS), next = localDateKey(+anchor + DAY_MS), today = localDateKey(new Date());
  const diary = d.diary[0]?.body ?? "";
  const planItems = [
    ...d.events.map((e) => ({ key: `e${e.id}`, at: e.startAt, allDay: e.allDay, href: `/calendar/${e.id}`, icon: "🗓", title: e.title, sub: e.location })),
    ...dueTasks.map((t) => ({ key: `t${t.id}`, at: t.dueAt!, allDay: true, href: `/tasks?open=${t.id}`, icon: "☑", title: t.title, sub: "Task due" })),
    ...d.planned.map((a) => ({ key: `a${a.id}`, at: a.dueAt!, allDay: false, href: `/activities/${a.id}`, icon: ACTIVITY_META[a.type].emoji, title: a.summary, sub: [a.customer, a.lead].filter(Boolean).join(" · ") })),
  ].sort((x, y) => +x.at - +y.at);
  const card = "card flex flex-col";
  const head = "flex items-center justify-between border-b border-slate-100 px-4 py-3";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Calendar" subtitle={`${DOW[p.dow]}, ${p.d} ${MONTHS[p.m]} ${p.y}${own ? "" : ` · ${lk.users.find((u) => u.id === who)?.name ?? ""}`}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          <Link href={link(prev)} className="rounded-md px-2.5 py-1 hover:bg-slate-100">‹</Link>
          <Link href={link(today)} className="rounded-md px-3 py-1 font-medium hover:bg-slate-100">Today</Link>
          <Link href={link(next)} className="rounded-md px-2.5 py-1 hover:bg-slate-100">›</Link>
        </div>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(["day", "week", "month"] as const).map((v) => (
            <Link key={v} href={`/calendar?${new URLSearchParams({ date: day, view: v })}`} className={`rounded-md px-3 py-1 capitalize ${v === "day" ? "bg-slate-100 font-medium" : "text-slate-500"}`}>{v}</Link>
          ))}
        </div>
        {canAll && <ParamSelect name="who" fallback="me" options={[["me", "My day"], ...lk.users.filter((u) => u.id !== me.id).map((u) => [String(u.id), u.name] as [string, string])]} />}
        {canAll && <Link href={`/daily-report?date=${day}`} className="btn-secondary ml-auto">Team daily report</Link>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className={card}>
          <div className={head}><h2 className="text-sm font-semibold">📋 Planner</h2><span className="text-xs text-slate-500">{planItems.length} planned</span></div>
          <ul className="divide-y divide-slate-100">
            {planItems.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">Nothing planned.</li>}
            {planItems.map((x) => (
              <li key={x.key}>
                <Link href={x.href} className="flex gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                  <span className="w-14 shrink-0 text-xs text-slate-500">{x.allDay ? "All day" : fmtTime(x.at)}</span>
                  <span className="min-w-0"><span className="block truncate font-medium">{x.icon} {x.title}</span>{x.sub && <span className="block truncate text-xs text-slate-500">{x.sub}</span>}</span>
                </Link>
              </li>
            ))}
          </ul>
          {own && <div className="mt-auto border-t border-slate-100 bg-slate-50/60 p-3"><QuickEntry mode="plan" day={day} at={sp.at} customers={lk.customers} leads={openLeads} /></div>}
        </section>

        <section className={card}>
          <div className={head}><h2 className="text-sm font-semibold">✅ Work done</h2><span className="text-xs text-slate-500">{d.done.length} entries</span></div>
          <ul className="divide-y divide-slate-100">
            {d.done.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">Nothing logged yet.</li>}
            {d.done.map((a) => (
              <li key={a.id}>
                <Link href={`/activities/${a.id}`} className="block px-4 py-2.5 text-sm hover:bg-slate-50">
                  <div className="flex gap-2"><span className="w-12 shrink-0 text-xs text-slate-500">{fmtTime(a.doneAt!)}</span><span className="min-w-0 font-medium">{ACTIVITY_META[a.type].emoji} {a.summary}</span></div>
                  <div className="ml-14 text-xs text-slate-500">{[a.customer, a.lead].filter(Boolean).join(" · ")}</div>
                  {a.outcome && <div className="ml-14 text-xs text-slate-700">→ {a.outcome}</div>}
                </Link>
              </li>
            ))}
          </ul>
          {own && <div className="mt-auto border-t border-slate-100 bg-slate-50/60 p-3"><QuickEntry mode="done" day={day} customers={lk.customers} leads={openLeads} /></div>}
        </section>

        <section className={card}>
          <div className={head}><h2 className="text-sm font-semibold">📓 Diary</h2><span className="text-xs text-slate-500">{own ? "private notes for the day" : "read only"}</span></div>
          <div className="p-3"><DiaryBox key={`${who}-${day}`} day={day} initial={diary} readOnly={!own} /></div>
        </section>
      </div>
      <p className="mt-3 text-xs text-slate-500">Everything here goes into the evening daily report. Entries with a customer are added to that customer&apos;s opportunity history automatically.</p>
    </div>
  );
}
