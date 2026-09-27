"use client";
import { useActionState, useMemo, useRef, useState, startTransition } from "react";
import { createTicket } from "@/app/actions/tickets";
import { aiTriage } from "@/app/actions/ai";
import { COMPLAINT_TYPES, PRIORITIES, TYPE_META } from "@/lib/constants";
import { buildFormData } from "@/lib/compress";
import { FilePicker } from "./file-picker";
import { AiButton, AiError } from "./ai-ui";
import { Field } from "./ui";

type Opt = { id: number; name: string; location?: string | null; city?: string | null };
export type PlantOpt = { id: number; plantNo: string; name: string; customerId: number | null; customerName: string | null; teamId: number | null; zone: string | null; city: string | null; state: string | null };

export function NewTicketForm({ teams, users, customers, plants, defaultDate, defaultPlant, defaultCustomer, ai }: {
  teams: Opt[]; users: Opt[]; customers: Opt[]; plants: PlantOpt[]; defaultDate: string; defaultPlant?: number; defaultCustomer?: number; ai?: boolean;
}) {
  const [state, action, pending] = useActionState(createTicket, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [plantId, setPlantId] = useState<string>(defaultPlant ? String(defaultPlant) : "");
  const [q, setQ] = useState("");
  const [noPlant, setNoPlant] = useState(!plants.length);
  const [type, setType] = useState<string>("");
  const [prio, setPrio] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const plant = plants.find((p) => String(p.id) === plantId);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? plants.filter((p) => `${p.plantNo} ${p.name} ${p.customerName} ${p.city} ${p.zone}`.toLowerCase().includes(s)) : plants;
    return list.slice(0, 60);
  }, [q, plants]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = await buildFormData(e.currentTarget, files);
    setBusy(false);
    startTransition(() => action(fd));
  };
  const suggest = async () => {
    const f = formRef.current!;
    const narr = (f.elements.namedItem("description") as HTMLTextAreaElement).value;
    setTriaging(true); setAiMsg(null);
    const r = await aiTriage({ subject: narr.slice(0, 120) || "complaint", description: narr, customer: plant?.customerName ?? undefined, city: plant?.city ?? undefined });
    setTriaging(false);
    if (!r.ok) return setAiMsg({ ok: false, text: r.error });
    if ((COMPLAINT_TYPES as readonly string[]).includes(r.data.category)) setType(r.data.category);
    setPrio(r.data.priority);
    setAiMsg({ ok: true, text: r.data.reason });
  };

  const step = (n: number, label: string) => <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{n}</span>;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      <div className="card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <Field label="Complaint date *">
            <input name="reportedAt" type="date" required defaultValue={defaultDate} className="input" />
          </Field>
          <div>
            <span className="label">{step(1, "")}Plant number *</span>
            {!noPlant ? (
              <>
                <input type="hidden" name="plantId" value={plantId} />
                {plant ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2">
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold">{plant.plantNo} · {plant.name}</div>
                      <div className="truncate text-xs text-slate-600">{plant.customerName ?? "—"} · Zone: {plant.zone ?? "—"} · {[plant.city, plant.state].filter(Boolean).join(", ")}</div>
                    </div>
                    <button type="button" onClick={() => setPlantId("")} className="btn-ghost px-2 py-1 text-xs">Change</button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-300">
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type plant no., plant or customer name, city…" className="w-full rounded-t-lg border-b border-slate-200 px-3 py-2 text-sm outline-none" autoFocus />
                    <ul className="max-h-48 overflow-y-auto">
                      {shown.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => setPlantId(String(p.id))} className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm hover:bg-brand-50">
                            <span className="font-mono text-xs font-semibold text-brand-700">{p.plantNo}</span>
                            <span className="truncate">{p.name}</span>
                            <span className="ml-auto shrink-0 text-xs text-slate-400">{p.zone}</span>
                          </button>
                        </li>
                      ))}
                      {shown.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">No plant matches.</li>}
                    </ul>
                  </div>
                )}
                <button type="button" onClick={() => { setNoPlant(true); setPlantId(""); }} className="mt-1 text-xs text-slate-500 underline">Plant not listed?</button>
              </>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="customerId" defaultValue={defaultCustomer ?? ""} className="input"><option value="">— Customer —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <select name="teamId" className="input"><option value="">— Zone / team —</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.location ?? t.name}</option>)}</select>
                <input name="site" placeholder="Plant / site description" className="input sm:col-span-2" />
                {plants.length > 0 && <button type="button" onClick={() => setNoPlant(false)} className="text-left text-xs text-slate-500 underline">Pick from plant list</button>}
              </div>
            )}
          </div>
        </div>

        <div>
          <span className="label">{step(2, "")}Type of complaint *</span>
          <input type="hidden" name="category" value={type} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {COMPLAINT_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition ${type === t ? "border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-600/20" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
                <span className="text-lg leading-none">{TYPE_META[t]!.icon}</span>{t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">{step(3, "")}Narration *</span>
          <textarea name="description" required minLength={5} rows={5} className="input" placeholder="Describe the problem: what happened, since when, readings/alarms, what has been tried…" />
          {ai && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <AiButton onClick={suggest} busy={triaging} className="py-1 text-xs">Suggest type & priority</AiButton>
              {aiMsg?.ok && <span className="text-xs text-violet-800">✓ {aiMsg.text}</span>}
              {aiMsg && !aiMsg.ok && <AiError msg={aiMsg.text} />}
            </div>
          )}
        </div>

        <div>
          <span className="label">{step(4, "")}Complaint made by *</span>
          <div className="grid gap-2 sm:grid-cols-3">
            <input name="complainantName" required placeholder="Name *" className="input" />
            <input name="complainantPhone" type="tel" placeholder="Phone" className="input" />
            <input name="complainantEmail" type="email" placeholder="Email (gets updates)" className="input" />
          </div>
        </div>
      </div>

      <details className="card p-5">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">More options — priority, assign, attachments</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">Priority</span>
            <input type="hidden" name="priority" value={prio} />
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
              {PRIORITIES.map((p) => (
                <button key={p.value} type="button" onClick={() => setPrio(p.value)} className={`rounded-md py-1.5 text-xs font-medium ${prio === p.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>{p.label}</button>
              ))}
            </div>
          </div>
          <Field label="Assign to">
            <select name="assigneeId" className="input" defaultValue=""><option value="">Unassigned (zone team picks it up)</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </Field>
          <Field label="Short title (optional)"><input name="subject" className="input" placeholder="Auto: “Mechanical — PLT-012 …”" /></Field>
          <Field label="Tags"><input name="tags" className="input" placeholder="ROSERVE, AMC" /></Field>
          <div className="sm:col-span-2"><span className="label">Photos / documents</span><FilePicker files={files} setFiles={setFiles} /></div>
        </div>
      </details>

      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="flex justify-end">
        <button disabled={pending || busy} className="btn-primary px-8 py-2.5">{pending || busy ? "Submitting…" : "Submit complaint"}</button>
      </div>
    </form>
  );
}
