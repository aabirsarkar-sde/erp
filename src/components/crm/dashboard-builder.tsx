"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addWidget, moveWidget, removeWidget, renameDashboard, shareDashboard, deleteDashboard } from "@/app/actions/dashboards";
import { W_CHARTS, W_GROUPS, W_METRICS, W_RANGES, groupsFor, type WMetric } from "@/lib/crm/dashboards-meta";

export function WidgetForm({ boardId }: { boardId: number }) {
  const [state, action, pending] = useActionState(addWidget.bind(null, boardId), undefined);
  const [metric, setMetric] = useState<WMetric>("pipeline_value");
  const [chart, setChart] = useState("hbar");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  const groups = groupsFor(metric);
  return (
    <form ref={ref} action={action} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.4fr_1fr_1fr_1fr_0.8fr_auto]" data-testid="widget-form">
      <select name="metric" value={metric} onChange={(e) => setMetric(e.target.value as WMetric)} className="input py-1.5 text-sm" aria-label="Measure">
        {Object.entries(W_METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
      </select>
      <input name="title" placeholder="Title (optional)" className="input py-1.5 text-sm" aria-label="Title" />
      <select name="chart" value={chart} onChange={(e) => setChart(e.target.value)} className="input py-1.5 text-sm" aria-label="Chart">
        {Object.entries(W_CHARTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select name="groupBy" key={`${metric}-${chart}`} defaultValue={chart === "number" ? "none" : chart === "line" ? "month" : groups[1]} disabled={chart === "number" || chart === "line"} className="input py-1.5 text-sm disabled:opacity-50" aria-label="Group by">
        {groups.map((g) => <option key={g} value={g}>{W_GROUPS[g]}</option>)}
      </select>
      {(chart === "number" || chart === "line") && <input type="hidden" name="groupBy" value={chart === "number" ? "none" : "month"} />}
      <select name="range" defaultValue={W_METRICS[metric].src === "open" ? "all" : "fy"} key={`r-${metric}`} className="input py-1.5 text-sm" aria-label="Period">
        {Object.entries(W_RANGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select name="size" defaultValue="half" className="input py-1.5 text-sm" aria-label="Width"><option value="half">Half width</option><option value="full">Full width</option></select>
      <button disabled={pending} className="btn-primary py-1.5 text-sm">{pending ? "Adding…" : "Add chart"}</button>
      {state?.error && <p className="text-xs text-red-600 sm:col-span-full">{state.error}</p>}
    </form>
  );
}

export function WidgetControls({ boardId, wid, first, last }: { boardId: number; wid: string; first: boolean; last: boolean }) {
  const [pending, start] = useTransition();
  const b = "rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30";
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-xs">
      <button disabled={pending || first} onClick={() => start(() => moveWidget(boardId, wid, -1))} className={b} title="Move earlier">←</button>
      <button disabled={pending || last} onClick={() => start(() => moveWidget(boardId, wid, 1))} className={b} title="Move later">→</button>
      <button disabled={pending} onClick={() => start(() => removeWidget(boardId, wid))} className={`${b} hover:text-red-600`} title="Remove chart">✕</button>
    </span>
  );
}

export function BoardSettings({ id, name, shared }: { id: number; name: string; shared: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <form action={renameDashboard.bind(null, id)} className="flex gap-1">
        <input name="name" defaultValue={name} className="input w-48 py-1 text-sm" aria-label="Dashboard name" />
        <button className="btn-secondary py-1 text-xs">Rename</button>
      </form>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" defaultChecked={shared} disabled={pending} onChange={(e) => start(() => shareDashboard(id, e.target.checked))} /> Share with the sales team
      </label>
      <button disabled={pending} onClick={() => confirm(`Delete "${name}"?`) && start(() => deleteDashboard(id))} className="ml-auto text-xs text-slate-400 hover:text-red-600">Delete dashboard</button>
    </div>
  );
}
