import Link from "next/link";
import { and, asc, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { db, activities, ACTIVITY_TYPES } from "@/db";
import { requireUser } from "@/lib/auth";
import { requireDept } from "@/lib/access";
import { activityScope } from "@/lib/access";
import { lookups } from "@/lib/queries";
import { PageHeader, Empty, Avatar } from "@/components/ui";
import { ActivityItem } from "@/components/activity-item";
import { ActivityForm } from "@/components/activity-form";
import { AiQuickLog } from "@/components/ai-quick-log";
import { aiEnabled } from "@/lib/ai";
import { ParamSelect } from "@/components/url-filters";
import { ACTIVITY_META } from "@/lib/crm";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  if (me.crmAccess === "none" && me.hdAccess === "none") requireDept(me, "crm");
  const sp = await searchParams;
  const tab = sp.tab === "report" ? "report" : "todo";
  const who = sp.user === "all" ? undefined : sp.user ? Number(sp.user) || me.id : me.id;
  const lk = await lookups();
  const userOpts: [string, string][] = [["me", "Me"], ["all", "Everyone"], ...lk.users.filter((u) => u.id !== me.id).map((u) => [String(u.id), u.name] as [string, string])];
  const withRel = { lead: { columns: { id: true, title: true } }, customer: { columns: { name: true } }, user: { columns: { name: true } } } as const;

  const tabs = (
    <div className="mb-4 flex gap-1 border-b border-slate-200">
      {[["todo", "To do"], ["report", "Call report"]].map(([k, l]) => (
        <Link key={k} href={`/activities${k === "report" ? "?tab=report" : ""}`} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</Link>
      ))}
    </div>
  );

  if (tab === "report") {
    const days = Number(sp.days) || 30;
    const rows = await db.query.activities.findMany({
      where: and(activityScope(me), isNotNull(activities.doneAt), gte(activities.doneAt, new Date(Date.now() - days * 864e5)), who ? eq(activities.userId, who) : undefined, sp.type ? eq(activities.type, sp.type as (typeof ACTIVITY_TYPES)[number]) : undefined),
      orderBy: desc(activities.doneAt),
      with: withRel,
      limit: 500,
    });
    const counts = ACTIVITY_TYPES.map((t) => [t, rows.filter((r) => r.type === t).length] as const);
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Activities" subtitle="Calls, meetings and site visits that were logged" />
        {tabs}
        <div className="mb-4 flex flex-wrap gap-2">
          <ParamSelect name="user" fallback="me" options={userOpts} />
          <ParamSelect name="type" options={[["", "All types"], ...ACTIVITY_TYPES.map((t) => [t, ACTIVITY_META[t].label] as [string, string])]} />
          <ParamSelect name="days" fallback="30" options={[["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last year"]]} />
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 sm:ml-auto">
            {counts.filter(([, n]) => n).map(([t, n]) => <span key={t}>{ACTIVITY_META[t].emoji} {n}</span>)}
          </div>
        </div>
        {rows.length === 0 ? <Empty title="Nothing logged in this period" /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr><th className="px-4 py-2.5">When</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Customer / opportunity</th><th className="px-3 py-2.5">Summary & outcome</th><th className="px-4 py-2.5">By</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{fmtDateTime(a.doneAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{ACTIVITY_META[a.type].emoji} {ACTIVITY_META[a.type].label}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{a.customer?.name ?? "—"}</div>
                      {a.lead && <Link href={`/crm/${a.lead.id}`} className="text-xs text-brand-700 hover:underline">{a.lead.title}</Link>}
                    </td>
                    <td className="max-w-md px-3 py-2.5"><div>{a.summary}</div>{a.outcome && <div className="mt-0.5 text-xs text-slate-600">→ {a.outcome}</div>}</td>
                    <td className="px-4 py-2.5"><span className="flex items-center gap-2 whitespace-nowrap"><Avatar name={a.user?.name} size="sm" />{a.user?.name}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const open = await db.query.activities.findMany({ where: and(activityScope(me), isNull(activities.doneAt), who ? eq(activities.userId, who) : undefined), orderBy: asc(activities.dueAt), with: withRel, limit: 300 });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 864e5);
  const groups = [
    ["Overdue", open.filter((a) => a.dueAt && a.dueAt < today)],
    ["Today", open.filter((a) => !a.dueAt || (a.dueAt >= today && a.dueAt < tomorrow))],
    ["Upcoming", open.filter((a) => a.dueAt && a.dueAt >= tomorrow)],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Activities" subtitle="Follow-ups, calls and visits to do" />
      {tabs}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ParamSelect name="user" fallback="me" options={userOpts} />
          {open.length === 0 && <Empty title="Nothing to do 🎉" hint="Schedule follow-ups from an opportunity or with the form." />}
          {groups.map(([label, list]) =>
            list.length ? (
              <section key={label} className="card">
                <h2 className={`border-b border-slate-100 px-4 py-2.5 text-sm font-semibold ${label === "Overdue" ? "text-red-600" : ""}`}>{label} ({list.length})</h2>
                <ul className="divide-y divide-slate-100">
                  {list.map((a) => <ActivityItem key={a.id} showLead a={{ ...a, userName: who ? null : a.user?.name, leadTitle: a.lead?.title, customerName: a.customer?.name }} />)}
                </ul>
              </section>
            ) : null,
          )}
        </div>
        <aside className="space-y-4 self-start">
          {aiEnabled() && <div className="card p-4"><AiQuickLog /></div>}
          <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Log or schedule (without an opportunity)</h2>
          <CustomerPickerNote />
          <ActivityForm users={lk.users} meId={me.id} compact customers={lk.customers} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function CustomerPickerNote() {
  return <p className="mb-3 text-xs text-slate-500">For deal-related work, open the opportunity and log it there so it shows in its history.</p>;
}
