import Link from "next/link";
import { KpiProgress } from "@/components/crm/kpi";
import { PERIOD_LABEL, type KpiPeriod } from "@/lib/crm/kpi-meta";

type Item = { def: { id: number; name: string; kind: "kpi" | "kra"; metric: string }; period: KpiPeriod; cell: { actual: number; target: number } };

/** "Today's targets" strip — shown on the calendar day and the dashboard */
export function KpiStrip({ items, title = "My targets", date }: { items: Item[]; title?: string; date?: string }) {
  if (!items.length) return null;
  return (
    <section className="card mb-4 p-3" data-testid="kpi-strip">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">🎯 {title}</h2>
        <Link href={`/kpi${date ? `?date=${date}` : ""}`} className="text-xs text-brand-700 hover:underline">Scoreboard →</Link>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((x) => (
          <div key={`${x.period}-${x.def.id}`} className="min-w-0">
            <div className="mb-1 truncate text-[11px] text-slate-500" title={x.def.name}>
              <span className={`mr-1 font-semibold uppercase ${x.def.kind === "kra" ? "text-violet-700" : "text-sky-700"}`}>{x.period === "daily" ? "Today" : PERIOD_LABEL[x.period]}</span>{x.def.name}
            </div>
            <KpiProgress actual={x.cell.actual} target={x.cell.target} metric={x.def.metric} compact />
          </div>
        ))}
      </div>
    </section>
  );
}
