"use client";
import { useTransition } from "react";
import { updateTicket } from "@/app/actions/tickets";
import { STAGE_META, PRIORITIES, CATEGORIES } from "@/lib/helpdesk/constants";
import { Field } from "@/components/ui/ui";

type Opt = { id: number; name: string; location?: string | null; city?: string | null };
type T = { id: number; stage: string; priority: number; teamId: number; assigneeId: number | null; customerId: number | null; category: string | null; site: string | null; tags: string | null; dueAt: Date | null };

const d = (x: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : "");

export function TicketProps({ t, teams, users, customers }: { t: T; teams: Opt[]; users: Opt[]; customers: Opt[] }) {
  const [pending, start] = useTransition();
  const save = (form: HTMLFormElement) => start(() => updateTicket(t.id, new FormData(form)));
  const auto = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => save(e.currentTarget.form!);
  return (
    <form key={JSON.stringify(t)} onSubmit={(e) => { e.preventDefault(); save(e.currentTarget); }} className="card space-y-3.5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Details</h3>
        <span className={`text-xs text-slate-400 transition-opacity ${pending ? "opacity-100" : "opacity-0"}`}>Saving…</span>
      </div>
      <Field label="Stage">
        <select name="stage" defaultValue={t.stage} onChange={auto} className="input">
          {Object.entries(STAGE_META).filter(([k]) => k !== "closed" || t.stage === "closed").map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
      </Field>
      <Field label="Priority">
        <select name="priority" defaultValue={t.priority} onChange={auto} className="input">
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </Field>
      <Field label="Assignee">
        <select name="assigneeId" defaultValue={t.assigneeId ?? ""} onChange={auto} className="input">
          <option value="">Unassigned</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Zone">
        <select name="teamId" defaultValue={t.teamId} onChange={auto} className="input">
          {teams.map((x) => <option key={x.id} value={x.id}>{x.location ?? x.name}</option>)}
        </select>
      </Field>
      <Field label="Customer">
        <select name="customerId" defaultValue={t.customerId ?? ""} onChange={auto} className="input">
          <option value="">—</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Type of complaint">
        <select name="category" defaultValue={t.category ?? ""} onChange={auto} className="input">
          <option value="">—</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Due date">
        <input type="date" name="dueAt" defaultValue={d(t.dueAt)} onChange={auto} className="input" />
      </Field>
      <Field label="Site / plant">
        <input name="site" defaultValue={t.site ?? ""} onBlur={(e) => e.target.value !== (t.site ?? "") && save(e.currentTarget.form!)} className="input" />
      </Field>
      <Field label="Tags">
        <input name="tags" defaultValue={t.tags ?? ""} onBlur={(e) => e.target.value !== (t.tags ?? "") && save(e.currentTarget.form!)} className="input" placeholder="comma separated" />
      </Field>
    </form>
  );
}
