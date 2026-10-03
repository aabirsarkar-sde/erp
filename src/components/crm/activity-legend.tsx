import { ACT_STATE } from "@/lib/crm/meta";

/** colour key for calendar views */
export function ActivityLegend({ meetings = true, className = "" }: { meetings?: boolean; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 ${className}`} aria-label="Colour key">
      {(["planned", "done", "overdue"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1"><span className={`size-2.5 rounded-sm ${ACT_STATE[k].dot}`} />{ACT_STATE[k].label}</span>
      ))}
      {meetings && <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-violet-400" />Meeting</span>}
    </div>
  );
}
