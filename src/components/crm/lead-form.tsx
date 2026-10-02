"use client";
import { useActionState, useState } from "react";
import { createLead } from "@/app/actions/crm";
import { LEAD_SOURCES, PROPOSAL_META } from "@/lib/crm/meta";
import { Field } from "@/components/ui/ui";

type Opt = { id: number; name: string; city?: string | null };

export function NewLeadForm({ customers, users, stages, meId, defaultCustomer, products = [], defaultKind = "opportunity" }: { customers: Opt[]; users: Opt[]; stages: Opt[]; meId: number; defaultCustomer?: number; products?: string[]; defaultKind?: "lead" | "opportunity" }) {
  const [state, action, pending] = useActionState(createLead, undefined);
  const [mode, setMode] = useState<"existing" | "new">(defaultCustomer || customers.length ? "existing" : "new");
  const [stars, setStars] = useState(0);
  const [kind, setKind] = useState(defaultKind);
  return (
    <form action={action} className="grid gap-5 lg:grid-cols-3">
      <div className="card space-y-4 p-5 lg:col-span-2">
        <input type="hidden" name="kind" value={kind} />
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
          {(["lead", "opportunity"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 rounded-md px-3 py-1 font-medium ${kind === k ? "bg-white shadow-sm" : "text-slate-500"}`}>{k === "lead" ? "Lead (early interest)" : "Opportunity (real requirement)"}</button>
          ))}
        </div>
        <Field label={kind === "lead" ? "Lead *" : "Opportunity *"}><input name="title" required autoFocus className="input" placeholder="e.g. Apcotex — 450 KLD ZLD plant" /></Field>
        <Field label="Product / service being offered">
          <input name="product" list="product-list" className="input" placeholder="e.g. ZLD system (RO + MEE + ATFD)" />
          <datalist id="product-list">{products.map((p) => <option key={p} value={p} />)}</datalist>
        </Field>
        <div>
          <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
            {(["existing", "new"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-md px-3 py-1 font-medium ${mode === m ? "bg-white shadow-sm" : "text-slate-500"}`}>{m === "existing" ? "Existing customer" : "New company"}</button>
            ))}
          </div>
          {mode === "existing" ? (
            <select name="customerId" defaultValue={defaultCustomer ?? ""} className="input">
              <option value="">— Select customer —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ""}</option>)}
            </select>
          ) : (
            <input name="companyName" className="input" placeholder="Company name" />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person"><input name="contactName" className="input" /></Field>
          <Field label="Phone"><input name="phone" type="tel" className="input" /></Field>
          <Field label="Email"><input name="email" type="email" className="input" /></Field>
          <Field label="City / location"><input name="city" className="input" /></Field>
          <Field label="Address" className="sm:col-span-2"><input name="address" className="input" placeholder="Plant / office address" /></Field>
          <Field label="Capacity"><input name="capacity" className="input" placeholder="e.g. 450 KLD" /></Field>
          <Field label="Source">
            <select name="source" className="input" defaultValue=""><option value="">—</option>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
        </div>
        <Field label="Inquiry details / brief requirement"><textarea name="description" rows={4} className="input" placeholder="Requirement, effluent characteristics, capacity, competition, decision makers…" /></Field>
      </div>
      <div className="space-y-5">
        <div className="card space-y-4 p-5">
          <Field label="Expected revenue (₹)"><input name="expectedRevenue" inputMode="numeric" className="input tabular-nums" placeholder="0" /></Field>
          <Field label="Stage">
            <select name="stageId" className="input">{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
          <Field label="Proposal status">
            <select name="proposalStatus" className="input" defaultValue="not_started">{Object.entries(PROPOSAL_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select>
          </Field>
          <Field label="Salesperson">
            <select name="ownerId" defaultValue={meId} className="input">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </Field>
          <Field label="Expected closing"><input name="expectedCloseAt" type="date" className="input" /></Field>
          <div>
            <span className="label">Priority</span>
            <input type="hidden" name="priority" value={stars} />
            <div className="flex gap-1 text-2xl">
              {[1, 2, 3].map((i) => <button key={i} type="button" onClick={() => setStars(stars === i ? 0 : i)} className={i <= stars ? "text-amber-400" : "text-slate-200 hover:text-amber-200"}>★</button>)}
            </div>
          </div>
          <Field label="Tags"><input name="tags" className="input" placeholder="ROSERVE, Dahej, 2026" /></Field>
        </div>
        {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button disabled={pending} className="btn-primary w-full py-2.5">{pending ? "Creating…" : kind === "lead" ? "Create lead" : "Create opportunity"}</button>
      </div>
    </form>
  );
}
