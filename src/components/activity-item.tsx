import Link from "next/link";
import { completeActivity, deleteActivity } from "@/app/actions/crm";
import { ACTIVITY_META } from "@/lib/crm";
import { fmtDate } from "@/lib/format";
import type { ActivityType } from "@/db/crm";

type A = { id: number; type: ActivityType; summary: string; note: string | null; dueAt: Date | null; doneAt: Date | null; outcome: string | null; userName?: string | null; leadId?: number | null; leadTitle?: string | null; customerName?: string | null };

export function dueTone(d: Date | null) {
  if (!d) return "text-slate-500";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(d).getTime();
  return t < today.getTime() ? "text-red-600" : t < today.getTime() + 864e5 ? "text-amber-600" : "text-emerald-700";
}

export function ActivityItem({ a, showLead }: { a: A; showLead?: boolean }) {
  const m = ACTIVITY_META[a.type];
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none" title={m.label}>{m.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{a.summary}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
            <span className={`font-medium ${dueTone(a.dueAt)}`}>{fmtDate(a.dueAt)}</span>
            {a.userName && <span>· {a.userName}</span>}
            {showLead && a.leadId && <Link href={`/crm/${a.leadId}`} className="truncate text-brand-700 hover:underline">· {a.leadTitle}</Link>}
            {showLead && !a.leadId && a.customerName && <span>· {a.customerName}</span>}
          </div>
          {a.note && <p className="mt-1 text-xs text-slate-600">{a.note}</p>}
          <details className="group mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">✓ Mark done</summary>
            <form action={completeActivity.bind(null, a.id)} className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input name="outcome" className="input py-1.5 text-sm" placeholder="Outcome (optional) — what did they say?" />
              <button className="btn-primary py-1.5">Done</button>
            </form>
          </details>
        </div>
        <form action={deleteActivity.bind(null, a.id)}><button className="text-xs text-slate-300 hover:text-red-600" title="Delete">✕</button></form>
      </div>
    </li>
  );
}
