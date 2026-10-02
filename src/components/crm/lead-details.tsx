"use client";
import { useTransition, useState } from "react";
import { updateLead } from "@/app/actions/crm";
import { LEAD_SOURCES, PROPOSAL_META } from "@/lib/crm/meta";
import { fmtDateInput } from "@/lib/core/format";
import { Field } from "@/components/ui/ui";

type Opt = { id: number; name: string };
type L = {
  id: number; customerId: number | null; contactName: string | null; email: string | null; phone: string | null; city: string | null; capacity: string | null;
  source: string | null; product: string | null; proposalStatus: string; expectedRevenue: number; probability: number; priority: number; tags: string | null; description: string | null; ownerId: number | null; expectedCloseAt: Date | null;
};

export function LeadDetails({ l, users, customers }: { l: L; users: Opt[]; customers: Opt[] }) {
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact"><input name="contactName" defaultValue={l.contactName ?? ""} onBlur={onBlur} className="input" /></Field>
        <Field label="Phone"><input name="phone" defaultValue={l.phone ?? ""} onBlur={onBlur} className="input" /></Field>
      </div>
      <Field label="Email"><input name="email" type="email" defaultValue={l.email ?? ""} onBlur={onBlur} className="input" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City"><input name="city" defaultValue={l.city ?? ""} onBlur={onBlur} className="input" /></Field>
        <Field label="Capacity"><input name="capacity" defaultValue={l.capacity ?? ""} onBlur={onBlur} className="input" /></Field>
      </div>
      <Field label="Source">
        <select name="source" defaultValue={l.source ?? ""} onChange={onChange} className="input"><option value="">—</option>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
      </Field>
      <Field label="Tags"><input name="tags" defaultValue={l.tags ?? ""} onBlur={onBlur} className="input" placeholder="comma separated" /></Field>
      <Field label="Inquiry details"><textarea name="description" rows={4} defaultValue={l.description ?? ""} onBlur={onBlur} className="input" /></Field>
    </form>
  );
}
