"use client";
import { useActionState, useState, startTransition, useRef } from "react";
import { buildFormData } from "@/lib/compress";
import { FilePicker } from "./file-picker";
import { aiTriage } from "@/app/actions/ai";
import { AiButton, AiError } from "./ai-ui";
import { createTicket } from "@/app/actions/tickets";
import { CATEGORIES, PRIORITIES } from "@/lib/constants";
import { Field } from "./ui";

type Opt = { id: number; name: string; location?: string | null; city?: string | null };

export function NewTicketForm({ teams, users, customers, defaultCustomer, ai }: { teams: Opt[]; users: Opt[]; customers: Opt[]; defaultCustomer?: number; ai?: boolean }) {
  const [state, action, pending] = useActionState(createTicket, undefined);
  const [team, setTeam] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const [triaging, setTriaging] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const suggest = async () => {
    const f = formRef.current!;
    const el = (n: string) => f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null;
    const c = customers.find((x) => String(x.id) === customer);
    setTriaging(true); setAiMsg(null);
    const r = await aiTriage({ subject: el("subject")?.value ?? "", description: el("description")?.value, customer: c?.name, city: c?.city ?? undefined });
    setTriaging(false);
    if (!r.ok) return setAiMsg({ ok: false, text: r.error });
    const d = r.data;
    if (el("category")) el("category")!.value = d.category;
    const pr = f.querySelector<HTMLInputElement>(`input[name=priority][value="${d.priority}"]`); if (pr) pr.checked = true;
    if (d.teamId) setTeam(String(d.teamId));
    if (el("tags") && d.tags.length) el("tags")!.value = d.tags.join(", ");
    setAiMsg({ ok: true, text: `${d.reason}` });
  };
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = await buildFormData(e.currentTarget, files);
    setBusy(false);
    startTransition(() => action(fd));
  };
  const [customer, setCustomer] = useState<string>(defaultCustomer ? String(defaultCustomer) : "");

  // auto-suggest team from customer city
  const onCustomer = (v: string) => {
    setCustomer(v);
    const c = customers.find((x) => String(x.id) === v);
    const match = c?.city && teams.find((t) => t.location?.toLowerCase().includes(c.city!.toLowerCase()));
    if (match && !team) setTeam(String(match.id));
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-3">
      <div className="card space-y-4 p-5 lg:col-span-2">
        <Field label="Subject *">
          <input name="subject" required className="input" placeholder="e.g. RO permeate TDS rising above 250 ppm" autoFocus />
        </Field>
        <Field label="Description">
          <textarea name="description" rows={6} className="input" placeholder="What did the customer report? Any readings, alarms, photos to follow…" />
        </Field>
        {ai && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-violet-50/50 p-2.5">
            <AiButton onClick={suggest} busy={triaging} className="py-1.5">Suggest category, priority & team</AiButton>
            {aiMsg?.ok && <span className="text-xs text-violet-800">✓ Filled in. {aiMsg.text}</span>}
            {aiMsg && !aiMsg.ok && <AiError msg={aiMsg.text} />}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer">
            <select name="customerId" className="input" value={customer} onChange={(e) => onCustomer(e.target.value)}>
              <option value="">— Select customer —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ""}</option>)}
            </select>
          </Field>
          <Field label="Site / plant">
            <input name="site" className="input" placeholder="e.g. 450 KLD RO, Unit II" />
          </Field>
          <Field label="Contact person">
            <input name="contactName" className="input" placeholder="Name" />
          </Field>
          <Field label="Contact phone">
            <input name="contactPhone" type="tel" className="input" placeholder="+91 …" />
          </Field>
          <Field label="Contact email (replies are emailed here)" className="sm:col-span-2">
            <input name="contactEmail" type="email" className="input" placeholder="name@company.com" />
          </Field>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <span className="label">Photos / documents</span>
          <FilePicker files={files} setFiles={setFiles} />
        </div>
      </div>

      <div className="space-y-5">
        <div className="card space-y-4 p-5">
          <Field label="Team *">
            <select name="teamId" required className="input" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">— Select team —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.location ?? t.name}</option>)}
            </select>
          </Field>
          <Field label="Assign to">
            <select name="assigneeId" className="input" defaultValue="">
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
              {PRIORITIES.map((p) => (
                <label key={p.value} className="cursor-pointer">
                  <input type="radio" name="priority" value={p.value} defaultChecked={p.value === 1} className="peer sr-only" />
                  <span className="block rounded-md py-1.5 text-center text-xs font-medium text-slate-600 peer-checked:bg-white peer-checked:text-slate-900 peer-checked:shadow-sm">{p.label}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Category">
            <select name="category" className="input" defaultValue="">
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Due date">
            <input name="dueAt" type="date" className="input" />
          </Field>
          <Field label="Tags">
            <input name="tags" className="input" placeholder="ROSERVE, AMC" />
          </Field>
        </div>
        {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button disabled={pending || busy} className="btn-primary w-full py-2.5">{pending || busy ? "Creating…" : "Create ticket"}</button>
      </div>
    </form>
  );
}
