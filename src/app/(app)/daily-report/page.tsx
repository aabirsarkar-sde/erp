import Link from "next/link";
import { requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { personDay, salesTeam } from "@/lib/crm/daily";
import { ACTIVITY_META } from "@/lib/crm/meta";
import { DAY_MS, fromLocalInput, localDateKey, fmtTime } from "@/lib/core/tz";
import { PageHeader } from "@/components/ui/ui";

export const metadata = { title: "Daily report" };

/** Everyone's day on one page — built from the calendar, nothing extra to fill in. */
export default async function DailyReport({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const anchor = (sp.date && fromLocalInput(sp.date)) || new Date();
  const day = localDateKey(anchor);
  const all = me.crmAccess === "all" || me.role === "admin";
  const team = (await salesTeam()).filter((u) => all || u.id === me.id);
  const d = await personDay(team.map((u) => u.id), day, me);
  const nav = (t: number) => `/daily-report?date=${localDateKey(+anchor + t * DAY_MS)}`;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Daily report" subtitle={`${day} · compiled from each person's calendar (planner, work done, diary)${all ? " · emailed every evening" : ""}`} />
      <div className="mb-4 flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm w-fit">
        <Link href={nav(-1)} className="rounded-md px-2.5 py-1 hover:bg-slate-100">‹</Link>
        <Link href="/daily-report" className="rounded-md px-3 py-1 font-medium hover:bg-slate-100">Today</Link>
        <Link href={nav(1)} className="rounded-md px-2.5 py-1 hover:bg-slate-100">›</Link>
      </div>
      <div className="space-y-4">
        {team.map((u) => {
          const done = d.done.filter((a) => a.userId === u.id), plan = d.planned.filter((a) => a.userId === u.id), evs = d.events.filter((e) => e.userId === u.id);
          const diary = d.diary.find((x) => x.userId === u.id)?.body.trim();
          const empty = !done.length && !diary;
          return (
            <section key={u.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold">{u.name}</h2>
                <span className="flex items-center gap-3 text-xs">
                  {empty ? <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700">No report filed</span> : <span className="text-slate-500">{done.length} done · {plan.length + evs.length} planned</span>}
                  <Link href={`/calendar?view=day&date=${day}${u.id === me.id ? "" : `&who=${u.id}`}`} className="font-medium text-brand-700 hover:underline">Open day →</Link>
                </span>
              </div>
              <div className="grid gap-4 p-4 text-sm md:grid-cols-3">
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Work done</h3>
                  {done.length ? <ul className="space-y-1.5">{done.map((a) => <li key={a.id}><Link href={`/activities/${a.id}`} className="hover:text-brand-700"><span className="text-xs text-slate-500">{fmtTime(a.doneAt!)}</span> {ACTIVITY_META[a.type].emoji} <b className="font-medium">{a.customer ? `${a.customer}: ` : ""}</b>{a.summary}</Link>{a.outcome && <div className="text-xs text-slate-600">→ {a.outcome}</div>}</li>)}</ul> : <p className="text-slate-400">—</p>}
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Planned</h3>
                  {plan.length + evs.length ? <ul className="space-y-1.5">{evs.map((e) => <li key={`e${e.id}`}><span className="text-xs text-slate-500">{e.allDay ? "All day" : fmtTime(e.startAt)}</span> 🗓 {e.title}</li>)}{plan.map((a) => <li key={a.id} className="text-slate-600"><span className="text-xs text-slate-500">{fmtTime(a.dueAt!)}</span> ○ {a.customer ? `${a.customer}: ` : ""}{a.summary}</li>)}</ul> : <p className="text-slate-400">—</p>}
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Diary</h3>
                  {diary ? <p className="whitespace-pre-wrap text-slate-700">{diary}</p> : <p className="text-slate-400">—</p>}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
