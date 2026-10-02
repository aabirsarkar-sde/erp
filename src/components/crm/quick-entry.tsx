"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createActivity } from "@/app/actions/crm";
import { ACTIVITY_META, ACTIVITY_TYPE_LIST } from "@/lib/crm/meta";
import { localDateKey } from "@/lib/core/tz";

type Opt = { id: number; name: string };
type Lead = { id: number; title: string; customerId: number | null };

/**
 * The short calendar form: who (customer), what kind, one line, and — for work done — the outcome.
 * Picking a customer with one open opportunity links the entry to it automatically.
 */
export function QuickEntry({ mode, day, at, customers, leads }: { mode: "plan" | "done"; day: string; at?: string; customers: Opt[]; leads: Lead[] }) {
  const [state, action, pending] = useActionState(createActivity, undefined);
  const [type, setType] = useState<string>(mode === "done" ? "visit" : "call");
  const [cust, setCust] = useState("");
  const [leadId, setLeadId] = useState<number | "">("");
  const [time, setTime] = useState(at ?? (mode === "done" ? "" : "10:00"));
  const ref = useRef<HTMLFormElement>(null);
  const customer = customers.find((c) => c.name.toLowerCase() === cust.trim().toLowerCase());
  const options = useMemo(() => (customer ? leads.filter((l) => l.customerId === customer.id) : []), [customer, leads]);
  useEffect(() => { setLeadId(options.length === 1 ? options[0]!.id : ""); }, [options]);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setCust(""); setTime(at ?? (mode === "done" ? "" : "10:00")); } }, [state, at, mode]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="type" value={type} />
      {mode === "done" && <input type="hidden" name="done" value="on" />}
      {/* blank time on "work done" = now */}
      {(time || mode === "plan" || day !== localDateKey(Date.now())) && <input type="hidden" name="dueAt" value={`${day}T${time || (mode === "plan" ? "10:00" : "18:00")}`} />}
      {customer && <input type="hidden" name="customerId" value={customer.id} />}
      {leadId !== "" && <input type="hidden" name="leadId" value={leadId} />}
      <div className="flex flex-wrap gap-1">
        {ACTIVITY_TYPE_LIST.map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${type === t ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300"}`}>{ACTIVITY_META[t as keyof typeof ACTIVITY_META].emoji} {ACTIVITY_META[t as keyof typeof ACTIVITY_META].label}</button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <input value={cust} onChange={(e) => setCust(e.target.value)} list={`qe-cust-${mode}`} placeholder="Customer (type to search)" className="input py-1.5 text-sm" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input py-1.5 text-sm" aria-label="Time" />
      </div>
      <datalist id={`qe-cust-${mode}`}>{customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      {customer && (
        <select value={leadId} onChange={(e) => setLeadId(e.target.value ? Number(e.target.value) : "")} className="input py-1.5 text-sm">
          <option value="">{options.length ? "— Not for a specific opportunity —" : "No open opportunity for this customer"}</option>
          {options.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
      )}
      <input name="summary" required placeholder={mode === "done" ? "What was done? e.g. Met plant head, discussed MEE offer" : "What's planned? e.g. Follow up on revised offer"} className="input py-1.5 text-sm" />
      {mode === "done" && <input name="outcome" required placeholder="Outcome / next step" className="input py-1.5 text-sm" />}
      <div className="flex items-center gap-2">
        <button disabled={pending} className="btn-primary py-1 text-sm">{pending ? "Saving…" : mode === "done" ? "Add to work done" : "Add to plan"}</button>
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-xs text-emerald-700">✓ Saved{leadId !== "" ? " to the opportunity" : ""}</span>}
      </div>
    </form>
  );
}
