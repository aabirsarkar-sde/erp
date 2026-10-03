"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { saveKpiDef, setKpiTarget, setKpiValue, toggleKpiDef, deleteKpiDef } from "@/app/actions/kpi";
import { KPI_METRICS, kpiTone, metricMeta } from "@/lib/crm/kpi-meta";
import { inrShort } from "@/lib/core/format";

const fmt = (n: number, metric: string) => (metricMeta(metric).unit === "inr" ? inrShort(n) : Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "3 / 5" with a coloured progress bar */
export function KpiProgress({ actual, target, metric, compact }: { actual: number; target: number; metric: string; compact?: boolean }) {
  const t = kpiTone(actual, target);
  if (!target) return <span className="text-xs text-slate-400">n/a</span>;
  return (
    <div className={compact ? "min-w-16" : "min-w-24"} title={`${t.label}: ${t.pct}%`}>
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <span className={`text-sm font-semibold ${t.text}`}>{fmt(actual, metric)}</span>
        <span className="text-[11px] text-slate-400">/ {fmt(target, metric)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.min(100, t.pct)}%` }} /></div>
    </div>
  );
}

/** cell of a hand-entered KPI: click the number to type the achieved figure */
export function KpiManualCell({ kpiId, userId, period, actual, target, metric, canEdit }: { kpiId: number; userId: number; period: string; actual: number; target: number; metric: string; canEdit: boolean }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  if (!canEdit || !edit) {
    return (
      <button type="button" disabled={!canEdit} onClick={() => setEdit(true)} className={`block w-full rounded text-left ${canEdit ? "hover:bg-slate-50" : ""}`} title={canEdit ? "Click to enter the achieved figure" : undefined}>
        <KpiProgress actual={actual} target={target} metric={metric} />
        {canEdit && <span className="text-[10px] text-brand-700">✎ enter</span>}
      </button>
    );
  }
  return (
    <form action={(fd) => start(async () => { await setKpiValue(kpiId, userId, period, String(fd.get("v") ?? "")); setEdit(false); })} className="flex items-center gap-1">
      <input name="v" autoFocus defaultValue={actual || ""} inputMode="decimal" aria-label="Achieved" className="input w-24 py-1 text-sm" />
      <button disabled={pending} className="btn-primary px-2 py-1 text-xs">{pending ? "…" : "Save"}</button>
    </form>
  );
}

type Def = { id: number; name: string; kind: "kpi" | "kra"; period: "daily" | "weekly" | "monthly"; metric: string; target: number; sortOrder: number; active: boolean };

export function KpiDefForm({ def, onDone }: { def?: Def; onDone?: () => void }) {
  const [state, action, pending] = useActionState(async (p: { error?: string; ok?: boolean } | undefined, fd: FormData) => {
    const r = await saveKpiDef(def?.id ?? null, p, fd);
    if (r.ok) onDone?.();
    return r;
  }, undefined);
  const [metric, setMetric] = useState(def?.metric ?? "calls");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && !def) ref.current?.reset(); }, [state, def]);
  return (
    <form ref={ref} action={action} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_2fr_1fr_auto]">
      <input name="name" required defaultValue={def?.name} placeholder="Name — e.g. Customer calls" className="input py-1.5 text-sm" aria-label="Name" />
      <select name="kind" defaultValue={def?.kind ?? "kpi"} className="input py-1.5 text-sm" aria-label="Type"><option value="kpi">KPI</option><option value="kra">KRA</option></select>
      <select name="period" defaultValue={def?.period ?? "daily"} className="input py-1.5 text-sm" aria-label="Period"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
      <select name="metric" value={metric} onChange={(e) => setMetric(e.target.value)} className="input py-1.5 text-sm" aria-label="Measured by">
        <optgroup label="Counted automatically">{Object.entries(KPI_METRICS).filter(([k]) => !k.startsWith("manual")).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</optgroup>
        <optgroup label="Typed in by hand">{Object.entries(KPI_METRICS).filter(([k]) => k.startsWith("manual")).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</optgroup>
      </select>
      <input name="target" type="number" min={0} step="any" required defaultValue={def?.target ?? ""} placeholder={metricMeta(metric).unit === "inr" ? "Target ₹" : "Target"} className="input py-1.5 text-sm" aria-label="Target" />
      <input type="hidden" name="sortOrder" value={def?.sortOrder ?? 0} />
      <button disabled={pending} className="btn-primary py-1.5 text-sm">{pending ? "Saving…" : def ? "Save" : "Add"}</button>
      <p className="text-[11px] text-slate-500 sm:col-span-6">{metricMeta(metric).hint}{state?.error && <span className="ml-2 text-red-600">{state.error}</span>}</p>
    </form>
  );
}

export function KpiDefRow({ def }: { def: Def }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  if (edit) return <div className="rounded-lg bg-slate-50 p-2"><KpiDefForm def={def} onDone={() => setEdit(false)} /></div>;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm ${def.active ? "" : "opacity-50"}`}>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${def.kind === "kra" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>{def.kind}</span>
      <span className="font-medium">{def.name}</span>
      <span className="text-xs text-slate-500">{metricMeta(def.metric).label} · target {fmt(def.target, def.metric)}</span>
      <span className="ml-auto flex gap-3 text-xs">
        <button onClick={() => setEdit(true)} className="text-brand-700 hover:underline">Edit</button>
        <button disabled={pending} onClick={() => start(() => toggleKpiDef(def.id, !def.active))} className="text-slate-500 hover:underline">{def.active ? "Pause" : "Resume"}</button>
        <button disabled={pending} onClick={() => confirm(`Delete "${def.name}"?`) && start(() => deleteKpiDef(def.id))} className="text-slate-400 hover:text-red-600">Delete</button>
      </span>
    </div>
  );
}

/** per-person target box: blank = default, 0 = not applicable */
export function KpiTargetInput({ kpiId, userId, value, placeholder }: { kpiId: number; userId: number; value: number | null; placeholder: string }) {
  const [pending, start] = useTransition();
  return (
    <input defaultValue={value ?? ""} placeholder={placeholder} inputMode="decimal" aria-label="Target" disabled={pending}
      onBlur={(e) => { if (e.target.value !== String(value ?? "")) start(() => setKpiTarget(kpiId, userId, e.target.value)); }}
      className={`input w-20 py-1 text-right text-sm tabular-nums ${value != null ? "border-brand-300 bg-brand-50/40" : ""}`} />
  );
}
