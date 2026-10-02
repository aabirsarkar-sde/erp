"use client";
import { useActionState, useMemo, useState } from "react";
import { createActivity } from "@/app/actions/crm";
import { ACTIVITY_META, ACTIVITY_TYPE_LIST } from "@/lib/crm/meta";

type Opt = { id: number; name: string };
type Props = {
  users: Opt[];
  customers: Opt[];
  contacts: (Opt & { customerId: number | null })[];
  leads: { id: number; title: string; customerId: number | null }[];
  meId: number;
  start: string;
  initial?: { customerId?: number | null; leadId?: number | null; type?: string; done?: boolean };
};

const L = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={`block ${className}`}><span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>{children}</label>
);

/** one form for planning an activity from the calendar — or logging one that already happened (call / visit report) */
export function ActivityPlanner({ users, customers, contacts, leads, meId, start, initial }: Props) {
  const [state, action, pending] = useActionState(createActivity, undefined);
  const [type, setType] = useState<string>(initial?.type ?? "visit");
  const [done, setDone] = useState(!!initial?.done);
  const [leadId, setLeadId] = useState<number | "">(initial?.leadId ?? "");
  const [customerId, setCustomerId] = useState<number | "">(initial?.customerId ?? leads.find((l) => l.id === initial?.leadId)?.customerId ?? "");
  const cContacts = useMemo(() => contacts.filter((c) => c.customerId === customerId), [contacts, customerId]);
  const cLeads = useMemo(() => (customerId ? leads.filter((l) => l.customerId === customerId) : leads), [leads, customerId]);
  const [nextAction, setNextAction] = useState("");

  return (
    <form action={action} className="card space-y-4 p-5">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="redirect" value={`/calendar?date=${start.slice(0, 10)}`} />
      <div className="flex flex-wrap gap-1.5">
        {ACTIVITY_TYPE_LIST.map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${type === t ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>
            {ACTIVITY_META[t].emoji} {ACTIVITY_META[t].label}
          </button>
        ))}
      </div>
      <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
        {[[false, "Plan it (upcoming)"], [true, "Log it (already happened)"]].map(([v, l]) => (
          <button key={String(v)} type="button" onClick={() => setDone(v as boolean)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${done === v ? "bg-white shadow-xs" : "text-slate-500"}`}>{l as string}</button>
        ))}
      </div>
      {done && <input type="hidden" name="done" value="on" />}

      <L label="Subject *"><input name="summary" required className="input" placeholder={type === "visit" ? "e.g. Site visit — RO plant audit" : "e.g. Discuss revised offer"} /></L>

      <div className="grid gap-3 sm:grid-cols-2">
        <L label="Client">
          <select name="customerId" value={customerId} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ""; setCustomerId(v); if (leadId && leads.find((l) => l.id === leadId)?.customerId !== v) setLeadId(""); }} className="input">
            <option value="">— Select client —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </L>
        <L label="Contact person">
          <select name="contactId" className="input" disabled={!cContacts.length}>
            <option value="">{customerId ? (cContacts.length ? "— Select contact —" : "No contacts saved") : "Pick a client first"}</option>
            {cContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </L>
        <L label="Opportunity" className="sm:col-span-2">
          <select name="leadId" value={leadId} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ""; setLeadId(v); const c = leads.find((l) => l.id === v)?.customerId; if (c) setCustomerId(c); }} className="input">
            <option value="">— Not linked to an opportunity —</option>
            {cLeads.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </L>
        <L label={done ? "When did it happen?" : "Date & time"}><input name="dueAt" type="datetime-local" defaultValue={start} className="input" /></L>
        <L label="Duration (minutes)"><input name="durationMin" type="number" min={5} step={5} defaultValue={type === "visit" ? 120 : 30} className="input" /></L>
        <L label="Location"><input name="location" className="input" placeholder={type === "visit" ? "Plant / site address" : "Office, phone, Teams…"} /></L>
        <L label="Assigned to">
          <select name="userId" defaultValue={meId} className="input">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </L>
      </div>
      {!done && <L label="Agenda / notes"><textarea name="note" rows={2} className="input" placeholder="What do you want to cover?" /></L>}

      {done && (
        <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <legend className="px-1 text-sm font-semibold">{type === "visit" ? "Visit report" : type === "call" ? "Call report" : "Report"}</legend>
          <L label="Discussion points / meeting notes"><textarea name="discussion" rows={4} className="input" placeholder={"• Plant running at 70%, membrane fouling\n• Customer wants a revised offer with MEE"} /></L>
          <L label="Outcome *"><textarea name="outcome" required rows={2} className="input" placeholder="What was decided? What did the customer say?" /></L>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <L label="Next action"><input name="nextAction" value={nextAction} onChange={(e) => setNextAction(e.target.value)} className="input" placeholder="e.g. Send revised proposal" /></L>
            <L label="Follow-up on"><input name="nextAt" type="datetime-local" className="input" disabled={!nextAction} /></L>
            <L label="As a">
              <select name="nextType" defaultValue="call" className="input" disabled={!nextAction}>{ACTIVITY_TYPE_LIST.map((t) => <option key={t} value={t}>{ACTIVITY_META[t].label}</option>)}</select>
            </L>
          </div>
          <p className="text-xs text-slate-500">Pick a follow-up date and the next activity is put on the calendar automatically.</p>
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary">{pending ? "Saving…" : done ? "Save report" : "Add to calendar"}</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
