import Link from "next/link";
import { requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { listDashboards, dashboardData, parseWidgets, type WidgetResult } from "@/lib/crm/dashboards";
import { W_METRICS, W_RANGES, STARTER, type Widget } from "@/lib/crm/dashboards-meta";
import { createDashboard, copyDashboard } from "@/app/actions/dashboards";
import { PageHeader } from "@/components/ui/ui";
import { BarChart, LineChart } from "@/components/ui/charts";
import { WidgetForm, WidgetControls, BoardSettings } from "@/components/crm/dashboard-builder";
import { inr, inrShort } from "@/lib/core/format";

export const metadata = { title: "Dashboards" };

function fmtVal(w: Widget, v: number, short = true) {
  const u = W_METRICS[w.metric]?.unit;
  if (u === "inr") return short ? inrShort(v) : inr(v);
  if (u === "pct") return `${Math.round(v)}%`;
  if (u === "days") return `${Math.round(v)} d`;
  return v.toLocaleString("en-IN");
}

function WidgetBody({ w, d }: { w: Widget; d: WidgetResult }) {
  const fmt = W_METRICS[w.metric]?.unit === "inr" ? "inr" : "num";
  if (w.chart === "number") return <div className="text-3xl font-semibold tabular-nums">{fmtVal(w, d.total)}</div>;
  if (!d.rows.length || d.rows.every((r) => !r.value)) return <p className="py-6 text-center text-sm text-slate-400">No data for this period.</p>;
  if (w.chart === "line" && d.months) return <LineChart labels={d.months.labels} series={[{ name: W_METRICS[w.metric].label, values: d.months.values }]} format={fmt} />;
  if (w.chart === "table") {
    return (
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-sm tabular-nums"><tbody className="divide-y divide-slate-100">
          {d.rows.map((r) => <tr key={r.label}><td className="py-1.5 pr-2">{r.label}</td><td className="py-1.5 text-right font-medium">{fmtVal(w, r.value, false)}</td></tr>)}
        </tbody></table>
      </div>
    );
  }
  return <BarChart horizontal={w.chart === "hbar"} data={d.rows.slice(0, 12)} format={fmt} valueLabel={W_METRICS[w.metric].label} />;
}

export default async function DashboardsPage({ searchParams }: { searchParams: Promise<{ d?: string; edit?: string }> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const boards = await listDashboards(me);
  const cur = boards.find((b) => String(b.id) === sp.d) ?? boards.find((b) => b.userId === me.id) ?? boards[0];
  const widgets = cur ? parseWidgets(cur.widgets) : [];
  const data = cur ? await dashboardData(me, widgets) : {};
  const own = cur?.userId === me.id;
  const editing = own && (sp.edit === "1" || widgets.length === 0);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Dashboards" subtitle="Build your own boards — pick the measure, the grouping and the chart. Up to 8 boards each." />

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-slate-200">
        {boards.map((b) => (
          <Link key={b.id} href={`/dashboards?d=${b.id}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${b.id === cur?.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {b.name}{b.userId !== me.id && <span className="ml-1 text-[11px] font-normal text-slate-400">· {b.owner}</span>}{b.shared && b.userId === me.id && <span className="ml-1 text-[11px] font-normal text-slate-400">· shared</span>}
          </Link>
        ))}
        <details className="relative ml-1">
          <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">+ New dashboard</summary>
          <form action={createDashboard} className="absolute left-0 z-20 mt-1 w-72 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <input name="name" required placeholder="Name — e.g. My monthly review" className="input py-1.5 text-sm" />
            <select name="starter" defaultValue="" className="input py-1.5 text-sm" aria-label="Start from"><option value="">Start empty</option>{STARTER.map((x) => <option key={x.name} value={x.name}>Start from “{x.name}”</option>)}</select>
            <button className="btn-primary w-full py-1.5 text-sm">Create</button>
          </form>
        </details>
      </div>

      {!cur ? (
        <div className="card p-8 text-center">
          <p className="font-medium">No dashboards yet</p>
          <p className="mt-1 text-sm text-slate-500">Start with a ready-made board (CEO view or sales overview) and change it as you like, or build one from scratch.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {STARTER.map((x) => (
              <form key={x.name} action={createDashboard}><input type="hidden" name="name" value={x.name} /><input type="hidden" name="starter" value={x.name} /><button className={x.name === "CEO view" ? "btn-primary" : "btn-secondary"}>Create {x.name.toLowerCase()}</button></form>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {own ? (
              editing ? <Link href={`/dashboards?d=${cur.id}`} className="btn-primary py-1.5 text-sm">Done editing</Link> : <Link href={`/dashboards?d=${cur.id}&edit=1`} className="btn-secondary py-1.5 text-sm">Edit dashboard</Link>
            ) : (
              <form action={copyDashboard.bind(null, cur.id)}><button className="btn-secondary py-1.5 text-sm">Copy to my dashboards</button></form>
            )}
          </div>
          {editing && (
            <div className="card mb-4 space-y-3 p-4">
              <BoardSettings id={cur.id} name={cur.name} shared={cur.shared} />
              <div className="border-t border-slate-100 pt-3"><div className="mb-2 text-sm font-semibold">Add a chart</div><WidgetForm boardId={cur.id} /></div>
            </div>
          )}
          {widgets.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Add your first chart above.</p> : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="dashboard-grid">
              {widgets.map((w, i) => (
                <section key={w.id} className={`card min-w-0 p-4 ${w.chart === "number" ? "col-span-1" : w.size === "full" ? "col-span-2 lg:col-span-4" : "col-span-2"}`}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{w.title}</h3>
                      <div className="text-[11px] text-slate-500">{W_RANGES[w.range]}{w.chart !== "number" && data[w.id] ? ` · total ${fmtVal(w, data[w.id]!.total)}` : ""}</div>
                    </div>
                    {editing && <WidgetControls boardId={cur.id} wid={w.id} first={i === 0} last={i === widgets.length - 1} />}
                  </div>
                  {data[w.id] && <WidgetBody w={w} d={data[w.id]!} />}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
