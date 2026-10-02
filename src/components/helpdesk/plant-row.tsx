"use client";
import { useActionState } from "react";
import { savePlant } from "@/app/actions/plants";

type Opt = { id: number; name: string; location?: string | null };
type P = { id: number; plantNo: string; name: string; customerId: number | null; teamId: number | null; city: string | null; state: string | null; capacity: string | null; technology: string | null; active: boolean };

export function PlantRow({ p, customers, teams, canEdit }: { p?: P; customers: Opt[]; teams: Opt[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(savePlant.bind(null, p?.id ?? null), undefined);
  return (
    <form action={action} className={`grid gap-2 px-4 py-3 md:grid-cols-12 md:items-center ${p && !p.active ? "opacity-50" : ""}`}>
      <fieldset disabled={!canEdit} className="contents">
        <input name="plantNo" required defaultValue={p?.plantNo} placeholder="Plant no. *" className="input py-1.5 font-mono text-xs uppercase md:col-span-1" />
        <input name="name" required defaultValue={p?.name} placeholder="Plant name *" className="input py-1.5 md:col-span-3" />
        <select name="customerId" defaultValue={p?.customerId ?? ""} className="input py-1.5 md:col-span-2"><option value="">Customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="teamId" defaultValue={p?.teamId ?? ""} className="input py-1.5 md:col-span-2"><option value="">Zone</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.location ?? t.name}</option>)}</select>
        <input name="city" defaultValue={p?.city ?? ""} placeholder="City" className="input py-1.5 md:col-span-1" />
        <input name="state" defaultValue={p?.state ?? ""} placeholder="State" className="input py-1.5 md:col-span-1" />
        <input name="capacity" defaultValue={p?.capacity ?? ""} placeholder="Capacity" className="input py-1.5 md:col-span-1" />
        <div className="flex items-center gap-2 md:col-span-1">
          {p && <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" name="active" defaultChecked={p.active} className="accent-brand-600" />On</label>}
          {canEdit && <button disabled={pending} className={p ? "btn-secondary px-2 py-1 text-xs" : "btn-primary px-2 py-1 text-xs"}>{p ? "Save" : "Add"}</button>}
        </div>
        <input type="hidden" name="technology" defaultValue={p?.technology ?? ""} />
      </fieldset>
      {state?.error && <p className="text-xs text-red-600 md:col-span-12">{state.error}</p>}
      {state?.ok && !p && <p className="text-xs text-emerald-700 md:col-span-12">Added ✓</p>}
    </form>
  );
}
