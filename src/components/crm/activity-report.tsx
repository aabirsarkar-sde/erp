"use client";
import { useActionState, useState } from "react";
import { saveActivityReport } from "@/app/actions/crm";
import { ACTIVITY_META, ACTIVITY_TYPE_LIST } from "@/lib/crm/meta";

type A = { id: number; type: string; discussion: string | null; outcome: string | null; nextAction: string | null; location: string | null; durationMin: number | null; done: boolean };

export function ActivityReport({ a }: { a: A }) {
  const [state, action, pending] = useActionState(saveActivityReport.bind(null, a.id), undefined);
  const [next, setNext] = useState("");
  const label = a.type === "visit" ? "Visit report" : a.type === "call" ? "Call report" : "Report";
  return (
    <form action={action} className="card space-y-3 p-5">
      <h2 className="text-sm font-semibold">{a.done ? `Edit ${label.toLowerCase()}` : `Complete — write the ${label.toLowerCase()}`}</h2>
      <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Discussion points / meeting notes</span>
        <textarea name="discussion" rows={5} defaultValue={a.discussion ?? ""} className="input" placeholder={"• Who attended\n• What was discussed\n• Issues raised"} /></label>
      <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Outcome *</span>
        <textarea name="outcome" required rows={2} defaultValue={a.outcome ?? ""} className="input" placeholder="What was decided?" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Location</span><input name="location" defaultValue={a.location ?? ""} className="input" /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Duration (minutes)</span><input name="durationMin" type="number" min={5} step={5} defaultValue={a.durationMin ?? ""} className="input" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Next action</span>
          <input name="nextAction" defaultValue={a.nextAction ?? ""} onChange={(e) => setNext(e.target.value)} className="input" placeholder="e.g. Send revised proposal" /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Follow-up on</span><input name="nextAt" type="datetime-local" disabled={!next} className="input" /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">As a</span>
          <select name="nextType" defaultValue="call" disabled={!next} className="input">{ACTIVITY_TYPE_LIST.map((t) => <option key={t} value={t}>{ACTIVITY_META[t].label}</option>)}</select></label>
      </div>
      <p className="text-xs text-slate-500">With a follow-up date, the next activity is scheduled on the calendar automatically.</p>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary">{pending ? "Saving…" : a.done ? "Update report" : "Mark done & save report"}</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">Saved ✓</span>}
      </div>
    </form>
  );
}
