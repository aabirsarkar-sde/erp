import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { requireDept } from "@/lib/access";
import { salesReport } from "@/lib/sales-stats";
import { lookups } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ParamSelect } from "@/components/url-filters";
import { BarChart } from "@/components/charts";
import { ACTIVITY_META } from "@/lib/crm";
import { inr, inrShort, fmtDateTime } from "@/lib/format";

export const metadata = { title: "Sales reports" };
export const dynamic = "force-dynamic";

const TABS = [["overview", "Overview"], ["salesperson", "By salesperson"], ["visits", "Visit report"], ["won", "Won / lost"]] as const;

export default async function SalesReports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview";
  const [r, lk] = await Promise.all([salesReport(sp, me), lookups()]);
  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), ...extra })}`;
  const t = r.totals;
  const th = "px-3 py-2.5", td = "px-3 py-2";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Sales & marketing reports" subtitle={r.label}
        actions={<><a href={`/api/export/sales${qs({})}`} className="btn-secondary">Excel</a><a href={`/print/sales${qs({ tab })}`} target="_blank" className="btn-secondary">PDF</a></>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <ParamSelect name="days" fallback="90" options={[["30", "Last 30 days"], ["90", "Last 90 days"], ["180", "Last 6 months"], ["365", "Last year"], ["all", "All time"]]} />
        {me.crmAccess === "all" && <ParamSelect name="user" fallback="all" options={[["all", "All salespeople"], ...lk.users.map((u) => [String(u.id), u.name] as [string, string])]} />}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {[["New leads", t.newLeads], ["Converted", t.converted], ["Open opps", t.openN], ["Pipeline", inrShort(t.openValue)], [`Won (${t.wonN})`, inrShort(t.wonValue)], ["Lost", t.lostN], ["Win rate", t.winRate != null ? `${t.winRate.toFixed(0)}%` : "—"], ["Visits", t.visits]].map(([k, v]) => (
          <div key={k} className="card p-3"><div className="text-[11px] text-slate-500">{k}</div><div className="mt-0.5 truncate text-lg font-semibold tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([k, l]) => <Link key={k} href={qs({ tab: k })} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</Link>)}
      </div>

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Open pipeline by stage</h2>
            <BarChart horizontal data={r.byStage.map((s) => ({ label: s.label, value: s.value }))} format="inr" valueLabel="Value" />
            <table className="mt-3 w-full text-sm tabular-nums"><thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Stage</th><th className="text-right">Deals</th><th className="text-right">Value</th><th className="text-right">Weighted</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{r.byStage.map((s) => <tr key={s.label}><td className="py-1.5">{s.label}</td><td className="text-right">{s.n}</td><td className="text-right">{inr(s.value)}</td><td className="text-right text-slate-500">{inr(s.weighted)}</td></tr>)}</tbody></table>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Leads by source <span className="font-normal text-slate-400">(new in period)</span></h2>
            <BarChart horizontal data={r.bySource.map((s) => ({ label: s.label, value: s.n }))} valueLabel="Leads" />
            <p className="mt-2 text-xs text-slate-500">{r.bySource.map((s) => `${s.label}: ${s.n} (${s.won} won)`).join(" · ") || "No leads in this period"}</p>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Proposal status</h2>
            <table className="w-full text-sm tabular-nums"><thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Status</th><th className="text-right">Opportunities</th><th className="text-right">Value</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{r.proposals.map((p) => <tr key={p.key}><td className="py-1.5">{p.label}</td><td className="text-right">{p.n}</td><td className="text-right">{inr(p.value)}</td></tr>)}</tbody></table>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Why we lose</h2>
            {r.lostReasons.length ? <BarChart horizontal data={r.lostReasons.map((s) => ({ label: s.label, value: s.n }))} color="#e05252" valueLabel="Lost" /> : <p className="text-sm text-slate-500">Nothing lost in this period.</p>}
          </section>
        </div>
      )}

      {tab === "salesperson" && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm tabular-nums">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500"><tr>
              <th className={th}>Salesperson</th><th className={`${th} text-right`}>New leads</th><th className={`${th} text-right`}>Open opps</th><th className={`${th} text-right`}>Pipeline</th><th className={`${th} text-right`}>Won</th><th className={`${th} text-right`}>Won value</th><th className={`${th} text-right`}>Lost</th><th className={`${th} text-right`}>🏭 Visits</th><th className={`${th} text-right`}>📞 Calls</th><th className={`${th} text-right`}>🤝 Meetings</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{r.bySalesperson.map((p) => (
              <tr key={p.label}><td className={`${td} font-medium`}>{p.label}</td><td className={`${td} text-right`}>{p.newLeads}</td><td className={`${td} text-right`}>{p.open}</td><td className={`${td} text-right`}>{inr(p.pipeline)}</td><td className={`${td} text-right`}>{p.won}</td><td className={`${td} text-right font-semibold`}>{inr(p.wonValue)}</td><td className={`${td} text-right`}>{p.lost}</td><td className={`${td} text-right`}>{p.visits}</td><td className={`${td} text-right`}>{p.calls}</td><td className={`${td} text-right`}>{p.meetings}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === "visits" && (
        r.visits.length === 0 ? <p className="card p-6 text-center text-sm text-slate-500">No visits or meetings logged in this period.</p> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500"><tr><th className={th}>Date</th><th className={th}>By</th><th className={th}>Client / contact</th><th className={th}>Opportunity</th><th className={th}>Discussion & outcome</th><th className={th}>Next action</th></tr></thead>
              <tbody className="divide-y divide-slate-100 align-top">{[...r.visits].reverse().map((a) => (
                <tr key={a.id}>
                  <td className={`${td} whitespace-nowrap text-xs text-slate-500`}>{ACTIVITY_META[a.type].emoji} {fmtDateTime(a.doneAt)}</td>
                  <td className={`${td} whitespace-nowrap`}>{a.user}</td>
                  <td className={td}><div className="font-medium">{a.customer ?? "—"}</div>{a.contact && <div className="text-xs text-slate-500">{a.contact}</div>}{a.location && <div className="text-xs text-slate-400">{a.location}</div>}</td>
                  <td className={td}>{a.leadId ? <Link href={`/crm/${a.leadId}`} className="text-brand-700 hover:underline">{a.lead}</Link> : "—"}</td>
                  <td className={`${td} max-w-md`}><Link href={`/activities/${a.id}`} className="font-medium hover:text-brand-700">{a.summary}</Link>{a.discussion && <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">{a.discussion}</p>}{a.outcome && <p className="mt-0.5 text-xs text-slate-800">→ {a.outcome}</p>}</td>
                  <td className={`${td} text-xs`}>{a.nextAction ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}

      {tab === "won" && (
        <div className="grid gap-5 lg:grid-cols-2">
          {([["Won", r.won, "text-emerald-700"], ["Lost", r.lost, "text-slate-500"]] as const).map(([title, xs, cls]) => (
            <section key={title} className="card">
              <h2 className={`border-b border-slate-100 px-4 py-3 text-sm font-semibold ${cls}`}>{title} ({xs.length}) · {inr(xs.reduce((a, x) => a + x.value, 0))}</h2>
              <ul className="divide-y divide-slate-100 text-sm">{xs.map((l) => (
                <li key={l.id}><Link href={`/crm/${l.id}`} className="flex gap-3 px-4 py-2 hover:bg-slate-50"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{l.title}</span><span className="block truncate text-xs text-slate-500">{l.customer ?? "—"} · {l.owner ?? "—"}{l.lostReason ? ` · ${l.lostReason}` : ""}</span></span><span className="tabular-nums">{inr(l.value)}</span></Link></li>
              ))}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
