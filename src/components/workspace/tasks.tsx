"use client";
import Link from "next/link";
import { useActionState, useEffect, useOptimistic, useRef, useState, startTransition, useTransition } from "react";
import { createTask, moveTask, updateTask, deleteTask } from "@/app/actions/tasks";
import { Avatar } from "@/components/ui/ui";
import { fmtDateInput } from "@/lib/core/format";
import { startOfLocalDay } from "@/lib/core/tz";

export type TaskCard = {
  id: number; title: string; notes: string | null; status: "todo" | "doing" | "done"; priority: number; dueAt: Date | null;
  assigneeId: number | null; assignee: string | null; createdBy: string | null;
  leadId: number | null; lead: string | null; ticketId: number | null; ticketRef: string | null;
};
type Opt = { id: number; name: string };
const COLS = [["todo", "To do"], ["doing", "In progress"], ["done", "Done"]] as const;
const PRIO = ["Low", "Normal", "High", "Urgent"];
const PRIO_CLS = ["text-slate-400", "text-slate-500", "text-orange-600", "text-red-600"];

function due(d: Date | null, status: string) {
  if (!d) return null;
  const today = +startOfLocalDay(Date.now());
  const t = +startOfLocalDay(d);
  const label = new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  const cls = status === "done" ? "text-slate-400" : t < today ? "font-semibold text-red-600" : t === today ? "font-semibold text-amber-700" : "text-slate-500";
  return <span className={cls} suppressHydrationWarning>{t < today && status !== "done" ? `Overdue · ${label}` : t === today ? "Today" : label}</span>;
}

/** Quick task form. Pass leadId / ticketId to attach the task to an opportunity or ticket. */
export function TaskForm({ users, meId, leadId, ticketId, compact }: { users: Opt[]; meId: number; leadId?: number; ticketId?: number; compact?: boolean }) {
  const [state, action, pending] = useActionState(createTask, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      {leadId && <input type="hidden" name="leadId" value={leadId} />}
      {ticketId && <input type="hidden" name="ticketId" value={ticketId} />}
      <input name="title" required placeholder="New task — e.g. Send revised drawing to customer" className="input py-1.5 text-sm" />
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "sm:grid-cols-4"}`}>
        <select name="assigneeId" defaultValue={meId} className="input py-1.5 text-sm" aria-label="Assign to">{users.map((u) => <option key={u.id} value={u.id}>{u.id === meId ? `Me (${u.name})` : u.name}</option>)}</select>
        <input name="dueAt" type="date" className="input py-1.5 text-sm" aria-label="Due date" />
        <select name="priority" defaultValue={1} className="input py-1.5 text-sm" aria-label="Priority">{PRIO.map((p, i) => <option key={p} value={i}>{p}</option>)}</select>
        <button disabled={pending} className="btn-primary py-1.5 text-sm">{pending ? "Adding…" : "Add task"}</button>
      </div>
      {!compact && <textarea name="notes" rows={2} placeholder="Details (optional)" className="input py-1.5 text-sm" />}
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function TaskDetails({ t, users, onClose }: { t: TaskCard; users: Opt[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  return (
    <form action={(fd) => start(async () => { await updateTask(t.id, fd); onClose(); })} className="mt-2 space-y-2 border-t border-slate-100 pt-2" onClick={(e) => e.stopPropagation()}>
      <input name="title" defaultValue={t.title} className="input py-1 text-sm" />
      <textarea name="notes" defaultValue={t.notes ?? ""} rows={3} placeholder="Notes" className="input py-1 text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <select name="assigneeId" defaultValue={t.assigneeId ?? ""} className="input py-1 text-xs">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <input name="dueAt" type="date" defaultValue={fmtDateInput(t.dueAt)} className="input py-1 text-xs" />
        <select name="priority" defaultValue={t.priority} className="input py-1 text-xs">{PRIO.map((p, i) => <option key={p} value={i}>{p}</option>)}</select>
        <button disabled={pending} className="btn-primary py-1 text-xs">{pending ? "Saving…" : "Save"}</button>
      </div>
      <button type="button" onClick={() => start(async () => { await deleteTask(t.id); })} className="text-xs text-slate-400 hover:text-red-600">Delete task</button>
    </form>
  );
}

function Card({ t, users, open, setOpen, onDrag }: { t: TaskCard; users: Opt[]; open: boolean; setOpen: (v: boolean) => void; onDrag?: (id: number | null) => void }) {
  return (
    <div draggable={!!onDrag && !open} onDragStart={(e) => { onDrag?.(t.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => onDrag?.(null)}
      onClick={() => !open && setOpen(true)} className={`card cursor-pointer p-3 text-sm transition hover:border-brand-200 hover:shadow-sm ${t.status === "done" ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-2">
        <button type="button" title={t.status === "done" ? "Mark not done" : "Mark done"} onClick={(e) => { e.stopPropagation(); startTransition(() => moveTask(t.id, t.status === "done" ? "todo" : "done")); }}
          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px] ${t.status === "done" ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 hover:border-brand-500"}`}>{t.status === "done" ? "✓" : ""}</button>
        <div className="min-w-0 flex-1">
          <div className={`font-medium leading-snug ${t.status === "done" ? "line-through" : ""}`}>{t.title}</div>
          {t.notes && !open && <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.notes}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            {due(t.dueAt, t.status)}
            {t.priority >= 2 && <span className={PRIO_CLS[t.priority]}>● {PRIO[t.priority]}</span>}
            {t.lead && <Link href={`/crm/${t.leadId}`} onClick={(e) => e.stopPropagation()} className="truncate text-brand-700 hover:underline">{t.lead}</Link>}
            {t.ticketRef && <Link href={`/tickets/${t.ticketId}`} onClick={(e) => e.stopPropagation()} className="text-brand-700 hover:underline">{t.ticketRef}</Link>}
          </div>
        </div>
        <span title={`${t.assignee ?? "Unassigned"}${t.createdBy ? ` · from ${t.createdBy}` : ""}`}><Avatar name={t.assignee} size="sm" /></span>
      </div>
      {open && <TaskDetails t={t} users={users} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Kanban: To do → In progress → Done. Drag a card between columns, tick the box to finish it. */
export function TaskBoard({ tasks, users, openId }: { tasks: TaskCard[]; users: Opt[]; openId?: number }) {
  const [items, move] = useOptimistic(tasks, (s, m: { id: number; status: TaskCard["status"] }) => s.map((t) => (t.id === m.id ? { ...t, status: m.status } : t)));
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(openId ?? null);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {COLS.map(([k, label]) => {
        const col = items.filter((t) => t.status === k);
        return (
          <div key={k} onDragOver={(e) => { e.preventDefault(); setOver(k); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = drag; if (id == null) return; setDrag(null); startTransition(async () => { move({ id, status: k }); await moveTask(id, k); }); }}
            className={`rounded-xl p-2 transition-colors ${over === k ? "bg-brand-50 ring-2 ring-brand-200" : "bg-slate-100/80"}`}>
            <div className="flex items-center justify-between px-2 pb-2 pt-1 text-sm font-semibold">{label}<span className="text-xs font-medium text-slate-500">{col.length}</span></div>
            <div className="min-h-16 space-y-2">
              {col.map((t) => <Card key={t.id} t={t} users={users} open={open === t.id} setOpen={(v) => setOpen(v ? t.id : null)} onDrag={setDrag} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact list for an opportunity or ticket page */
export function TaskList({ tasks, users }: { tasks: TaskCard[]; users: Opt[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!tasks.length) return <p className="px-4 py-3 text-sm text-slate-500">No tasks yet.</p>;
  return <div className="space-y-2 p-3">{tasks.map((t) => <Card key={t.id} t={t} users={users} open={open === t.id} setOpen={(v) => setOpen(v ? t.id : null)} />)}</div>;
}
