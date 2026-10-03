"use client";
import { useTransition, useState } from "react";
import { updateLead } from "@/app/actions/crm";
import { LEAD_SOURCES, PROPOSAL_META, SEGMENTS, FORECAST_META } from "@/lib/crm/meta";
import { fmtDateInput } from "@/lib/core/format";
import { Field } from "@/components/ui/ui";

type Opt = { id: number; name: string };
type L = {
  id: number; customerId: number | null; contactName: string | null; email: string | null; phone: string | null; city: string | null; capacity: string | null;
  source: string | null; product: string | null; siteId: number | null; application: string | null; segment: string | null; forecast: string; proposalStatus: string; expectedRevenue: number; probability: number; priority: number; tags: string | null; description: string | null; ownerId: number | null; expectedCloseAt: Date | null;
};

export function LeadDetails({ l, users, customers, sites = [] }: { l: L; users: Opt[]; customers: Opt[]; sites?: { id: number; name: string; applications: string | null }[] }) {
  const [pending, start] = useTransition();
  const [stars, setStars] = useState(l.priority);
  const save = (form: HTMLFormElement) => start(() => updateLead(l.id, new FormData(form)));
  const onChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => save(e.currentTarget.form!);
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (e.target.value !== e.target.defaultValue) save(e.currentTarget.form!); };
  return (
    <form key={JSON.stringify(l)} onSubmit={(e) => { e.preventDefault(); save(e.currentTarget); }} className="card space-y-3.5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Details</h3>
        <span className={`text-xs text-slate-400 transition-opacity ${pending ? "opacity-100" : "opacity-0"}`}>Saving…</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expected (₹)"><input name="expectedRevenue" defaultValue={l.expectedRevenue || ""} onBlur={onBlur} inputMode="numeric" className="input tabular-nums" /></Field>
        <Field label="Probability %"><input name="probability" type="number" min={0} max={100} defaultValue={l.probability} onBlur={onBlur} className="input tabular-nums" /></Field>
      </div>
      <div>
        <span className="label">Priority</span>
        <input type="hidden" name="priority" value={stars} />
        <div className="flex gap-1 text-xl">
          {[1, 2, 3].map((i) => (
            <button key={i} type="button" onClick={(e) => { const n = stars === i ? 0 : i; setStars(n); const f = e.currentTarget.form!; setTimeout(() => save(f)); }} className={i <= stars ? "text-amber-400" : "text-slate-200 hover:text-amber-200"}>★</button>
          ))}
        </div>
      </div>
      <Field label="Product / service"><input name="product" defaultValue={l.product ?? ""} onBlur={onBlur} className="input" /></Field>
      <Field label="Plant / site">
        <select name="siteId" defaultValue={l.siteId ?? ""} onChange={onChange} className="input"><option value="">{sites.length ? "—" : l.customerId ? "No sites yet — add on the customer page" : "Pick a customer first"}</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </Field>
      <Field label="Application"><input name="application" list="ld-apps" defaultValue={l.application ?? ""} onBlur={onBlur} placeholder="e.g. Brine clarification" className="input" />
        <datalist id="ld-apps">{[...new Set(sites.flatMap((s) => (s.applications ?? "").split(",").map((x) => x.trim()).filter(Boolean)))].map((a) => <option key={a} value={a} />)}</datalist></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Business line"><input name="segment" list="ld-seg" defaultValue={l.segment ?? ""} onBlur={onBlur} className="input" /><datalist id="ld-seg">{SEGMENTS.map((x) => <option key={x} value={x} />)}</datalist></Field>
        <Field label="Forecast"><select name="forecast" defaultValue={l.forecast} onChange={onChange} className="input" title={FORECAST_META[l.forecast]?.hint}>{Object.entries(FORECAST_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select></Field>
      </div>
      <Field label="Proposal status">
        <select name="proposalStatus" defaultValue={l.proposalStatus} onChange={onChange} className="input">{Object.entries(PROPOSAL_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select>
      </Field>
      <Field label="Salesperson">
        <select name="ownerId" defaultValue={l.ownerId ?? ""} onChange={onChange} className="input"><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </Field>
      <Field label="Customer">
        <select name="customerId" defaultValue={l.customerId ?? ""} onChange={onChange} className="input"><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </Field>
      <Field label="Expected closing"><input name="expectedCloseAt" type="date" defaultValue={fmtDateInput(l.expectedCloseAt)} onChange={onChange} className="input" /></Field>
      <Field label="Capacity"><input name="capacity" defaultValue={l.capacity ?? ""} onBlur={onBlur} className="input" /></Field>
      <Field label="Source">
        <select name="source" defaultValue={l.source ?? ""} onChange={onChange} className="input"><option value="">—</option>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
      </Field>
      <Field label="Inquiry details"><textarea name="description" rows={4} defaultValue={l.description ?? ""} onBlur={onBlur} className="input" /></Field>
    </form>
  );
}
