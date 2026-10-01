import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { salesReport } from "@/lib/sales-stats";
import { PrintShell } from "@/components/print-shell";
import { ACTIVITY_META } from "@/lib/crm";
import { inr, inrShort, fmtDateTime } from "@/lib/format";

export const metadata = { title: "Sales report" };

const C = "border border-slate-200 px-1.5 py-0.5";
function Table({ head, rows, right = [] }: { head: string[]; rows: React.ReactNode[][]; right?: number[] }) {
  return (
    <table className="w-full border-collapse tabular-nums">
      <thead><tr className="bg-slate-100 text-left text-[10px] text-slate-600">{head.map((h, i) => <th key={i} className={`${C} py-1 ${right.includes(i) ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`${C} align-top ${right.includes(j) ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

export default async function PrintSales({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  if (me.crmAccess === "none") notFound();
  const sp = await searchParams;
  const r = await salesReport(sp, me);
  const t = r.totals;
  const visitsOnly = sp.tab === "visits";
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{children}</h2>;
  return (
    <PrintShell title={visitsOnly ? "Visit report" : "Sales & marketing report"} subtitle={r.label}>
      <div className="mb-2 grid grid-cols-6 gap-2 text-center">
        {[["New leads", t.newLeads], ["Open opps", t.openN], ["Pipeline", inrShort(t.openValue)], ["Won", `${t.wonN} · ${inrShort(t.wonValue)}`], ["Win rate", t.winRate != null ? `${t.winRate.toFixed(0)}%` : "—"], ["Visits", t.visits]].map(([k, v]) => (
          <div key={k} className="rounded border border-slate-200 p-2"><div className="text-[10px] text-slate-500">{k}</div><div className="text-base font-bold">{v}</div></div>
        ))}
      </div>
      {!visitsOnly && (
        <>
          <H>Pipeline by stage</H>
          <Table head={["Stage", "Deals", "Value", "Weighted"]} right={[1, 2, 3]} rows={r.byStage.map((s) => [s.label, s.n, inr(s.value), inr(s.weighted)])} />
          <H>By salesperson</H>
          <Table head={["Salesperson", "New leads", "Open", "Pipeline", "Won", "Won value", "Lost", "Visits", "Calls"]} right={[1, 2, 3, 4, 5, 6, 7, 8]} rows={r.bySalesperson.map((p) => [p.label, p.newLeads, p.open, inr(p.pipeline), p.won, inr(p.wonValue), p.lost, p.visits, p.calls])} />
          <div className="grid grid-cols-2 gap-4">
            <div><H>Leads by source</H><Table head={["Source", "Leads", "Won"]} right={[1, 2]} rows={r.bySource.map((s) => [s.label, s.n, s.won])} /></div>
            <div><H>Proposal status</H><Table head={["Status", "Opps", "Value"]} right={[1, 2]} rows={r.proposals.map((p) => [p.label, p.n, inr(p.value)])} /></div>
          </div>
        </>
      )}
      <H>Visit & meeting report</H>
      <Table head={["Date", "By", "Client / contact", "Opportunity", "Discussion & outcome", "Next action"]}
        rows={r.visits.map((a) => [`${ACTIVITY_META[a.type].emoji} ${fmtDateTime(a.doneAt)}`, a.user ?? "", `${a.customer ?? "—"}${a.contact ? ` / ${a.contact}` : ""}`, a.lead ?? "—",
          <div key="d"><b>{a.summary}</b>{a.discussion && <div className="whitespace-pre-wrap">{a.discussion}</div>}{a.outcome && <div>→ {a.outcome}</div>}</div>, a.nextAction ?? ""])} />
    </PrintShell>
  );
}
