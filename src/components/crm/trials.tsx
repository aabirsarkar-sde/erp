"use client";
import { useActionState, useState, useTransition } from "react";
import { saveTrial, deleteTrial, recordOrder } from "@/app/actions/structure";
import { TRIAL_KINDS, TRIAL_STATUS_META } from "@/lib/crm/meta";
import { fmtDateInput } from "@/lib/core/format";

type T = { id: number; kind: string; product: string | null; status: string; startAt: Date | null; endAt: Date | null; result: string | null };

export function TrialForm({ leadId, t, onDone }: { leadId: number; t?: T; onDone?: () => void }) {
  const [state, action, pending] = useActionState(async (p: { ok?: number; error?: string } | undefined, fd: FormData) => { const r = await saveTrial(leadId, t?.id ?? null, p, fd); if (r.ok) onDone?.(); return r; }, undefined);
  return (
    <form action={action} key={state?.ok && !t ? state.ok : undefined} className="space-y-2" data-testid="trial-form">
      <div className="grid gap-2 sm:grid-cols-4">
        <input name="kind" list="trial-kinds" required defaultValue={t?.kind ?? "Jar test"} className="input py-1.5 text-sm" aria-label="Kind" />
        <datalist id="trial-kinds">{TRIAL_KINDS.map((k) => <option key={k} value={k} />)}</datalist>
        <input name="product" defaultValue={t?.product ?? ""} placeholder="Product / chemical tested" className="input py-1.5 text-sm sm:col-span-2" aria-label="Product" />
        <select name="status" defaultValue={t?.status ?? "planned"} className="input py-1.5 text-sm" aria-label="Status">{Object.entries(TRIAL_STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select>
        <label className="flex items-center gap-1 text-xs text-slate-500">From<input name="startAt" type="date" defaultValue={fmtDateInput(t?.startAt ?? null)} className="input py-1 text-sm" /></label>
        <label className="flex items-center gap-1 text-xs text-slate-500">To<input name="endAt" type="date" defaultValue={fmtDateInput(t?.endAt ?? null)} className="input py-1 text-sm" /></label>
        <input name="result" defaultValue={t?.result ?? ""} placeholder="Result — e.g. turbidity 45 → 4 NTU at 2 ppm" className="input py-1.5 text-sm sm:col-span-2" aria-label="Result" />
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className="btn-primary py-1 text-sm">{pending ? "Saving…" : t ? "Save" : "Add"}</button>
        {t && <button type="button" onClick={onDone} className="btn-secondary py-1 text-sm">Cancel</button>}
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}

export function TrialRow({ leadId, t }: { leadId: number; t: T }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  if (edit) return <li className="px-4 py-3"><TrialForm leadId={leadId} t={t} onDone={() => setEdit(false)} /></li>;
  const m = TRIAL_STATUS_META[t.status] ?? TRIAL_STATUS_META.planned!;
  const d = (x: Date | null) => (x ? new Date(x).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) : null);
  return (
    <li className="flex items-start gap-3 px-4 py-3 text-sm">
      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>{m.label}</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{t.kind}{t.product && <span className="font-normal text-slate-600"> · {t.product}</span>}</div>
        <div className="text-xs text-slate-500" suppressHydrationWarning>{[d(t.startAt), d(t.endAt)].filter(Boolean).join(" → ")}</div>
        {t.result && <p className="mt-1 text-sm text-slate-700">{t.result}</p>}
      </div>
      <span className="flex shrink-0 gap-2 text-xs"><button onClick={() => setEdit(true)} className="text-brand-700 hover:underline">Edit</button><button disabled={pending} onClick={() => confirm("Delete this trial?") && start(() => deleteTrial(leadId, t.id))} className="text-slate-300 hover:text-red-600">✕</button></span>
    </li>
  );
}

/** "Won" — record the purchase order at the same time */
export function WonButton({ leadId, value, label = "Won" }: { leadId: number; value: number; label?: string }) {
  return (
    <details className="relative">
      <summary className="btn cursor-pointer list-none bg-emerald-600 text-white hover:bg-emerald-700" data-testid="won">{label}</summary>
      <form action={recordOrder.bind(null, leadId)} className="card absolute left-0 z-20 mt-1 w-72 space-y-2 p-3 shadow-lg">
        <div className="text-sm font-semibold">Record the order</div>
        <input name="poNumber" placeholder="PO number (optional)" className="input py-1.5 text-sm" aria-label="PO number" />
        <div className="grid grid-cols-2 gap-2">
          <input name="poDate" type="date" defaultValue={fmtDateInput(new Date())} className="input py-1.5 text-sm" aria-label="PO date" />
          <input name="value" defaultValue={value || ""} inputMode="numeric" placeholder="Value ₹" className="input py-1.5 text-sm" aria-label="Order value" />
        </div>
        <button className="btn w-full bg-emerald-600 text-white hover:bg-emerald-700">Mark as won</button>
      </form>
    </details>
  );
}
