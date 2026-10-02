import { requireUser } from "@/lib/core/auth";
import { helpdeskRows, groupBy, summary } from "@/lib/helpdesk/stats";
import { PrintShell } from "@/components/ui/print-shell";
import { fmtTat } from "@/lib/core/format";

export const metadata = { title: "Helpdesk report" };

export default async function PrintHelpdesk({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const rows = await helpdeskRows(sp, me);
  const s = summary(rows);
  const period = sp.from || sp.to ? `${sp.from ?? "…"} → ${sp.to ?? "today"}` : sp.days === "all" ? "All time" : `Last ${sp.days ?? 90} days`;
  const sections = [["type", "By type of complaint", "Type"], ["zone", "By zone", "Zone"], ["geo", "By geography", "City / state"], ["employee", "By employee (tickets solved)", "Employee"], ["plant", "By plant (top 20)", "Plant"]] as const;
  return (
    <PrintShell title="Helpdesk report" subtitle={period}>
      <div className="mb-4 grid grid-cols-5 gap-2 text-center">
        {[["Total", s.total], ["Open", s.open], ["Done", s.closed], ["Avg TAT", fmtTat(s.avgTat)], ["Rating", s.csat != null ? `${s.csat.toFixed(1)}/5` : "—"]].map(([k, v]) => (
          <div key={k} className="rounded border border-slate-200 p-2"><div className="text-[10px] text-slate-500">{k}</div><div className="text-base font-bold">{v}</div></div>
        ))}
      </div>
      {sections.map(([v, title, first]) => {
        const gs = groupBy(rows, v).slice(0, v === "plant" ? 20 : 50);
        const max = Math.max(1, ...gs.map((g) => (v === "employee" ? g.closed : g.total)));
        return (
          <section key={v} className="mb-4 break-inside-avoid">
            <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
            <table className="w-full border-collapse tabular-nums">
              <thead><tr className="bg-slate-100 text-left text-[10px] text-slate-600">
                <th className="border border-slate-200 px-1.5 py-1">{first}</th><th className="border border-slate-200 px-1.5 py-1 text-right">{v === "employee" ? "Solved" : "Total"}</th><th className="w-1/3 border border-slate-200 px-1.5 py-1" />
                <th className="border border-slate-200 px-1.5 py-1 text-right">Open</th><th className="border border-slate-200 px-1.5 py-1 text-right">Avg TAT</th>
              </tr></thead>
              <tbody>
                {gs.map((g) => {
                  const n = v === "employee" ? g.closed : g.total;
                  return (
                    <tr key={g.key}>
                      <td className="border border-slate-200 px-1.5 py-0.5">{g.label}</td>
                      <td className="border border-slate-200 px-1.5 py-0.5 text-right font-semibold">{n}</td>
                      <td className="border border-slate-200 px-1.5 py-0.5"><div className="h-2.5 rounded-r bg-[#2a78d6]" style={{ width: `${(n / max) * 100}%`, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} /></td>
                      <td className="border border-slate-200 px-1.5 py-0.5 text-right">{g.open}</td>
                      <td className="border border-slate-200 px-1.5 py-0.5 text-right">{fmtTat(g.avgTat)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </PrintShell>
  );
}
