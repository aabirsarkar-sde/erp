import Link from "next/link";
import { requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { forecast, FC_GROUPS, FC_PERIODS, type FcGroup, type FcPeriod } from "@/lib/crm/forecast";
import { getTagDefs } from "@/lib/crm/tags";
import { FORECAST_META } from "@/lib/crm/meta";
import { PageHeader } from "@/components/ui/ui";
import { ParamSelect } from "@/components/ui/url-filters";
import { inr, inrShort, fmtDate } from "@/lib/core/format";
import { DAY_MS } from "@/lib/core/tz";

export const metadata = { title: "Forecast" };

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ p?: string; g?: string }> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const p = (sp.p && sp.p in FC_PERIODS ? sp.p : "quarter") as FcPeriod;
  const g = (sp.g && sp.g in FC_GROUPS ? sp.g : "owner") as FcGroup;
  const f = await forecast(me, p, g, await getTagDefs());
  const t = f.total;
  const end = new Date(+f.to - DAY_MS);
  const pct = (a: number, b: number | null) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Forecast" subtitle={`${FC_PERIODS[p]}: ${fmtDate(f.from)} – ${fmtDate(end)} · from expected closing dates and each deal's forecast category`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ParamSelect name="p" fallback="quarter" options={Object.entries(FC_PERIODS)} />
        <ParamSelect name="g" fallback="owner" options={Object.entries(FC_GROUPS).map(([k, l]) => [k, `By ${l.toLowerCase()}`] as [string, string])} />
        {(f.noDate > 0 || f.overdueClose > 0) && <span className="ml-auto text-xs text-amber-700">⚠ {f.noDate} open deal(s) without an expected closing date{f.overdueClose ? ` · ${f.overdueClose} with a closing date already passed` : ""} — they can&apos;t be forecast. <Link href="/crm?owner=all&view=list" className="underline">Fix in the pipeline</Link></span>}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="forecast-tiles">
        {[["Won (orders)", t.won, "booked in the period"], ["Commit", t.won + t.commit, "won + committed deals"], ["Best case", t.won + t.best, "won + commit + best case"], ["Weighted pipeline", t.weighted, `${t.deals} deals × probability`], ["Target", t.target ?? 0, t.target ? `${pct(t.won, t.target)} achieved` : g !== "owner" ? "shown when grouped by salesperson" : "set a monthly 'Order value won' KRA"]].map(([k, v, h]) => (
          <div key={k as string} className="card p-4"><div className="text-xs text-slate-500">{k}</div><div className="mt-0.5 text-xl font-semibold tabular-nums">{inrShort(v as number)}</div><div className="text-[11px] text-slate-400">{h}</div></div>
        ))}
      </div>
      <div className="card mb-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm tabular-nums" data-testid="forecast-table">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-4 py-2 font-medium">{FC_GROUPS[g]}</th><th className="px-3 py-2 text-right font-medium">Won</th><th className="px-3 py-2 text-right font-medium">Commit</th><th className="px-3 py-2 text-right font-medium">Best case</th><th className="px-3 py-2 text-right font-medium">Weighted</th><th className="px-3 py-2 text-right font-medium">Deals</th>{g === "owner" && <><th className="px-3 py-2 text-right font-medium">Target</th><th className="px-3 py-2 text-right font-medium">Won + commit vs target</th></>}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {f.rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">Nothing expected to close in this period.</td></tr>}
            {f.rows.map((r) => (
              <tr key={r.label}>
                <td className="px-4 py-2 font-medium">{r.label}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{r.won ? inr(r.won) : "—"}</td>
                <td className="px-3 py-2 text-right">{r.commit ? inr(r.commit) : "—"}</td>
                <td className="px-3 py-2 text-right">{r.best ? inr(r.best) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-600">{r.weighted ? inr(Math.round(r.weighted)) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-500">{r.deals}</td>
                {g === "owner" && <><td className="px-3 py-2 text-right text-slate-600">{r.target ? inr(r.target) : "—"}</td><td className={`px-3 py-2 text-right font-semibold ${r.target && r.won + r.commit >= r.target ? "text-emerald-700" : r.target ? "text-rose-700" : "text-slate-400"}`}>{pct(r.won + r.commit, r.target)}</td></>}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
            <tr><td className="px-4 py-2">Total</td><td className="px-3 py-2 text-right">{inr(t.won)}</td><td className="px-3 py-2 text-right">{inr(t.commit)}</td><td className="px-3 py-2 text-right">{inr(t.best)}</td><td className="px-3 py-2 text-right">{inr(Math.round(t.weighted))}</td><td className="px-3 py-2 text-right">{t.deals}</td>{g === "owner" && <><td className="px-3 py-2 text-right">{t.target ? inr(t.target) : "—"}</td><td className="px-3 py-2 text-right">{pct(t.won + t.commit, t.target)}</td></>}</tr>
          </tfoot>
        </table>
      </div>
      <section className="card">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Deals expected to close ({f.deals.length})</h2>
        <ul className="divide-y divide-slate-100">
          {f.deals.map((d) => (
            <li key={d.id}><Link href={`/crm/${d.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${FORECAST_META[d.forecast]?.cls}`}>{FORECAST_META[d.forecast]?.label}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{d.title}<span className="font-normal text-slate-500"> · {d.customer ?? "—"} · {d.owner ?? "—"}</span></span>
              <span className="text-xs text-slate-500">{fmtDate(d.closeAt)}</span>
              <span className="w-28 text-right font-semibold tabular-nums">{inrShort(d.value)}</span>
              <span className="w-10 text-right text-xs text-slate-500">{d.probability}%</span>
            </Link></li>
          ))}
        </ul>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Set each deal&apos;s category (Commit / Best case / Pipeline / Omitted) and expected closing date in its Details panel.</p>
      </section>
    </div>
  );
}
