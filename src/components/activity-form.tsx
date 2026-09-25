"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { createActivity } from "@/app/actions/crm";
import { ACTIVITY_META } from "@/lib/crm";
import { ACTIVITY_TYPE_LIST as ACTIVITY_TYPES } from "@/lib/crm";
import { fmtDateInput } from "@/lib/format";

export function ActivityForm({ leadId, customerId, users, meId, compact, customers }: { leadId?: number; customerId?: number; users: { id: number; name: string }[]; meId: number; compact?: boolean; customers?: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState(createActivity, undefined);
  const [done, setDone] = useState(false);
  const [type, setType] = useState<(typeof ACTIVITY_TYPES)[number]>("call");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setDone(false); } }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      {leadId && <input type="hidden" name="leadId" value={leadId} />}
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      <input type="hidden" name="type" value={type} />
      <div className="flex flex-wrap gap-1">
        {ACTIVITY_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${type === t ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300"}`}>
            {ACTIVITY_META[t].emoji} {ACTIVITY_META[t].label}
          </button>
        ))}
      </div>
      {customers && !customerId && (
        <select name="customerId" className="input" defaultValue=""><option value="">Customer (optional)</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      )}
      <input name="summary" required className="input" placeholder={done ? "What happened? e.g. Discussed revised offer" : "e.g. Follow up on quotation"} />
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "sm:grid-cols-3"}`}>
        {!done && <input name="dueAt" type="date" defaultValue={fmtDateInput(new Date())} className="input" />}
        <select name="userId" defaultValue={meId} className="input">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="done" checked={done} onChange={(e) => setDone(e.target.checked)} className="size-4 accent-brand-600" /> Already done
        </label>
      </div>
      {done && <textarea name="outcome" rows={2} className="input" placeholder="Outcome / call report — what did the customer say?" />}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary py-1.5">{done ? "Log activity" : "Schedule"}</button>
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
