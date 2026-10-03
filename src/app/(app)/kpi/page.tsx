import Link from "next/link";
import { requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { kpiBoard, canEditKpiValue } from "@/lib/crm/kpi";
import { PERIOD_LABEL, periodLabel, shiftPeriod, metricMeta, kpiTone, type KpiPeriod } from "@/lib/crm/kpi-meta";
import { fromLocalInput, localDateKey } from "@/lib/core/tz";
import { PageHeader, LinkButton, Empty, Avatar } from "@/components/ui/ui";
import { KpiProgress, KpiManualCell } from "@/components/crm/kpi";

export const metadata = { title: "KPI & KRA" };

export default async function KpiPage({ searchParams }: { searchParams: Promise<{ p?: string; date?: string }> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const period: KpiPeriod = sp.p === "weekly" || sp.p === "monthly" ? sp.p : "daily";
  const anchor = (sp.date && fromLocalInput(sp.date)) || new Date();
  const b = await kpiBoard(period, anchor);
  const href = (p: KpiPeriod, d: Date) => `/kpi?p=${p}&date=${localDateKey(d)}`;
  const isAdmin = me.role === "admin";
  // team-level score: share of KPI cells achieved
  const cells = b.rows.flatMap((r) => b.defs.map((d) => r.cells[d.id]!)).filter((c) => c.target > 0);
  const achieved = cells.filter((c) => c.actual >= c.target).length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="KPI & KRA" subtitle="Targets set by the sales head — progress fills in from the activities everyone logs"
        actions={isAdmin ? <LinkButton href="/kpi/setup" variant="secondary">Set targets</LinkButton> : undefined} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(["daily", "weekly", "monthly"] as const).map((p) => (
            <Link key={p} href={href(p, anchor)} className={`rounded-md px-3 py-1 ${p === period ? "bg-slate-100 font-medium" : "text-slate-500"}`}>{PERIOD_LABEL[p]}</Link>
          ))}
        </div>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          <Link href={href(period, shiftPeriod(period, b.from, -1))} className="rounded-md px-2.5 py-1 hover:bg-slate-100" aria-label="Previous">‹</Link>
          <Link href={href(period, new Date())} className="rounded-md px-3 py-1 font-medium hover:bg-slate-100">{period === "daily" ? "Today" : period === "weekly" ? "This week" : "This month"}</Link>
          <Link href={href(period, shiftPeriod(period, b.from, 1))} className="rounded-md px-2.5 py-1 hover:bg-slate-100" aria-label="Next">›</Link>
        </div>
        <span className="text-sm font-medium">{periodLabel(period, b.from)}</span>
        {cells.length > 0 && <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Team: {achieved} of {cells.length} targets achieved</span>}
      </div>

      {b.defs.length === 0 ? (
        <Empty title={`No ${PERIOD_LABEL[period].toLowerCase()} KPIs yet`} hint={isAdmin ? "Add KPIs and KRAs with their targets — progress is counted automatically from calls, visits, quotations and orders." : "The sales head hasn't set any targets for this period yet."}
          action={isAdmin ? <LinkButton href="/kpi/setup">Set targets</LinkButton> : undefined} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" data-testid="kpi-board">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-4 py-2 font-medium">Salesperson</th>
                {b.defs.map((d) => (
                  <th key={d.id} className="px-3 py-2 font-medium" title={metricMeta(d.metric).hint}>
                    <span className={`mr-1 rounded px-1 py-px text-[9px] font-bold uppercase ${d.kind === "kra" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>{d.kind}</span>{d.name}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {b.rows.map((r) => {
                const mine = b.defs.map((d) => r.cells[d.id]!).filter((c) => c.target > 0);
                const avg = mine.length ? Math.round(mine.reduce((s, c) => s + Math.min(100, (c.actual / c.target) * 100), 0) / mine.length) : 0;
                const tone = kpiTone(avg, 100);
                return (
                  <tr key={r.id} className={r.id === me.id ? "bg-brand-50/30" : ""}>
                    <td className="sticky left-0 bg-white px-4 py-2.5"><div className="flex items-center gap-2"><Avatar name={r.name} size="sm" /><span className="font-medium">{r.name}</span></div></td>
                    {b.defs.map((d) => {
                      const c = r.cells[d.id]!;
                      return (
                        <td key={d.id} className="px-3 py-2.5 align-top">
                          {c.manual && c.target > 0
                            ? <KpiManualCell kpiId={d.id} userId={r.id} period={b.key} actual={c.actual} target={c.target} metric={d.metric} canEdit={canEditKpiValue(me, r.id)} />
                            : <KpiProgress actual={c.actual} target={c.target} metric={d.metric} />}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2.5 text-right text-sm font-semibold tabular-nums ${tone.text}`}>{mine.length ? `${avg}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Green = achieved · amber = 60–99 % · red = below 60 %. Numbers come from activities marked done, opportunities, quotations and orders — log once in the calendar or on the opportunity and it counts here.</p>
    </div>
  );
}
