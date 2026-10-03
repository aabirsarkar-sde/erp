"use client";
import { useActionState, useState, useTransition } from "react";
import { savePlaybook, togglePlaybook, deletePlaybook } from "@/app/actions/playbooks";
import { STEP_KINDS, type PlaybookStep } from "@/lib/crm/playbook-meta";

type Opt = { id: number; name: string };
type PB = { id: number; name: string; trigger: "created" | "stage"; stageId: number | null; matchProduct: string | null; matchSegment: string | null; steps: PlaybookStep[]; active: boolean };

export function PlaybookForm({ pb, stages, users, segments, onDone }: { pb?: PB; stages: Opt[]; users: Opt[]; segments: string[]; onDone?: () => void }) {
  const [steps, setSteps] = useState<PlaybookStep[]>(pb?.steps ?? [{ title: "", days: 0, kind: "task", assign: "owner" }]);
  const [trigger, setTrigger] = useState(pb?.trigger ?? "created");
  const [state, action, pending] = useActionState(async (p: { ok?: number; error?: string } | undefined, fd: FormData) => {
    const r = await savePlaybook(pb?.id ?? null, p, fd);
    if (r.ok) { if (!pb) setSteps([{ title: "", days: 0, kind: "task", assign: "owner" }]); onDone?.(); }
    return r;
  }, undefined);
  const set = (i: number, patch: Partial<PlaybookStep>) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <form action={action} className="space-y-3" data-testid="playbook-form">
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-600">Name<input name="name" required defaultValue={pb?.name} placeholder="e.g. Membrane enquiry" className="input mt-1 py-1.5 text-sm" /></label>
        <label className="text-xs text-slate-600">Starts when
          <div className="mt-1 flex gap-2">
            <select name="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as "created" | "stage")} className="input py-1.5 text-sm"><option value="created">a lead / opportunity is created</option><option value="stage">it moves into a stage</option></select>
            {trigger === "stage" && <select name="stageId" defaultValue={pb?.stageId ?? ""} className="input py-1.5 text-sm" aria-label="Stage"><option value="">Stage…</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          </div>
        </label>
        <label className="text-xs text-slate-600">Only if product / application mentions (comma = any; blank = all)<input name="matchProduct" defaultValue={pb?.matchProduct ?? ""} placeholder="membrane, RO, DTRO" className="input mt-1 py-1.5 text-sm" /></label>
        <label className="text-xs text-slate-600">Only for business line (optional)<input name="matchSegment" list="pb-segments" defaultValue={pb?.matchSegment ?? ""} className="input mt-1 py-1.5 text-sm" /><datalist id="pb-segments">{segments.map((s) => <option key={s} value={s} />)}</datalist></label>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">Steps</div>
        <ol className="space-y-2">
          {steps.map((st, i) => (
            <li key={i} className="grid grid-cols-[1.5rem_1fr_5.5rem] items-center gap-2 sm:grid-cols-[1.5rem_1fr_7rem_6rem_9rem_1.5rem]">
              <span className="text-xs text-slate-400">{i + 1}.</span>
              <input value={st.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="e.g. Get water analysis from {{customer}}" className="input py-1 text-sm" aria-label={`Step ${i + 1}`} />
              <select value={st.kind} onChange={(e) => set(i, { kind: e.target.value as PlaybookStep["kind"] })} className="input py-1 text-sm" aria-label="Kind">{STEP_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <label className="flex items-center gap-1 text-xs text-slate-500">day<input type="number" min={0} max={365} value={st.days} onChange={(e) => set(i, { days: Number(e.target.value) })} className="input w-14 py-1 text-sm" aria-label="Days after start" /></label>
              <select value={String(st.assign)} onChange={(e) => set(i, { assign: e.target.value === "owner" || e.target.value === "creator" ? e.target.value : Number(e.target.value) })} className="input py-1 text-sm" aria-label="Who">
                <option value="owner">Salesperson (owner)</option><option value="creator">Whoever triggered it</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button type="button" onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600" title="Remove step">✕</button>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setSteps((xs) => [...xs, { title: "", days: (xs.at(-1)?.days ?? 0) + 2, kind: "task", assign: "owner" }])} className="mt-2 text-xs font-medium text-brand-700 hover:underline">+ Add step</button>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className="btn-primary py-1.5 text-sm">{pending ? "Saving…" : pb ? "Save" : "Create playbook"}</button>
        {pb && <button type="button" onClick={onDone} className="btn-secondary py-1.5 text-sm">Cancel</button>}
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}

export function PlaybookCard({ pb, stages, users, segments, canEdit }: { pb: PB; stages: Opt[]; users: Opt[]; segments: string[]; canEdit: boolean }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  if (edit) return <div className="card p-4"><PlaybookForm pb={pb} stages={stages} users={users} segments={segments} onDone={() => setEdit(false)} /></div>;
  const who = (a: PlaybookStep["assign"]) => (a === "owner" ? "salesperson" : a === "creator" ? "whoever triggered it" : users.find((u) => u.id === a)?.name ?? "—");
  return (
    <div className={`card p-4 ${pb.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{pb.name}</div>
          <div className="text-xs text-slate-500">
            When {pb.trigger === "created" ? "a lead / opportunity is created" : `it enters “${stages.find((s) => s.id === pb.stageId)?.name ?? "?"}”`}
            {pb.matchProduct ? ` · mentions ${pb.matchProduct}` : ""}{pb.matchSegment ? ` · ${pb.matchSegment}` : ""}
          </div>
        </div>
        {canEdit && <span className="flex gap-3 text-xs">
          <button onClick={() => setEdit(true)} className="text-brand-700 hover:underline">Edit</button>
          <button disabled={pending} onClick={() => start(() => togglePlaybook(pb.id, !pb.active))} className="text-slate-500 hover:underline">{pb.active ? "Pause" : "Resume"}</button>
          <button disabled={pending} onClick={() => confirm(`Delete "${pb.name}"?`) && start(() => deletePlaybook(pb.id))} className="text-slate-400 hover:text-red-600">Delete</button>
        </span>}
      </div>
      <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        {pb.steps.map((st, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-slate-300">→</span>}
            <span className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-inset ring-slate-200"><b className="font-medium">{st.title}</b> <span className="text-slate-500">· day {st.days} · {who(st.assign)}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
