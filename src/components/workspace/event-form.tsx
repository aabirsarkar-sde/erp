"use client";
import { useActionState, useState } from "react";
import { Field } from "@/components/ui/ui";

type Opt = { id: number; name: string };
type E = { title: string; description: string | null; location: string | null; start: string; end: string; allDay: boolean; attendees: number[]; externalEmails: string | null; customerId: number | null; leadId: number | null };

export function EventForm({ action, users, customers, initial, meId, submitLabel }: {
  action: (p: { error?: string } | undefined, fd: FormData) => Promise<{ error?: string } | undefined>;
  users: Opt[]; customers: Opt[]; initial: E; meId: number; submitLabel: string;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [att, setAtt] = useState<number[]>(initial.attendees.length ? initial.attendees : [meId]);
  return (
    <form action={run} className="card space-y-4 p-5">
      {initial.leadId && <input type="hidden" name="leadId" value={initial.leadId} />}
      <Field label="Title *"><input name="title" required defaultValue={initial.title} autoFocus className="input" placeholder="e.g. Site visit — Neogen Dahej" /></Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Starts"><input name="start" type={allDay ? "date" : "datetime-local"} required defaultValue={allDay ? initial.start.slice(0, 10) : initial.start} className="input" /></Field>
        {!allDay && <Field label="Ends"><input name="end" type="datetime-local" defaultValue={initial.end} className="input" /></Field>}
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-brand-600" /> All day</label>
      </div>
      <Field label="Location"><input name="location" defaultValue={initial.location ?? ""} className="input" placeholder="Plant address, office, or video call link" /></Field>
      <div>
        <span className="label">Team attendees</span>
        <div className="flex flex-wrap gap-1.5">
          {users.map((u) => {
            const on = att.includes(u.id);
            return (
              <label key={u.id} className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${on ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-white text-slate-500 ring-slate-200"}`}>
                <input type="checkbox" name="attendees" value={u.id} checked={on} onChange={() => setAtt(on ? att.filter((x) => x !== u.id) : [...att, u.id])} className="sr-only" />
                {on ? "✓ " : "+ "}{u.name}
              </label>
            );
          })}
        </div>
      </div>
      <Field label="Guests outside the company (emails, comma separated)"><input name="externalEmails" defaultValue={initial.externalEmails ?? ""} className="input" placeholder="plant.head@customer.com" /></Field>
      <Field label="Customer">
        <select name="customerId" defaultValue={initial.customerId ?? ""} className="input"><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </Field>
      <Field label="Notes / agenda"><textarea name="description" rows={3} defaultValue={initial.description ?? ""} className="input" /></Field>
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="notify" defaultChecked className="size-4 accent-brand-600" /> Email calendar invites to attendees and guests</label>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="btn-primary">{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}
