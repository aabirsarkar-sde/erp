"use client";
import { startOfLocalDay, localDateKey } from "@/lib/tz";
import Link from "next/link";
import { useOptimistic, useState, startTransition } from "react";
import { moveLead } from "@/app/actions/crm";
import { stageColor, tagList } from "@/lib/crm";
import { inrShort } from "@/lib/format";
import { Avatar } from "./ui";

type Stage = { id: number; name: string; color: string };
export type Card = {
  id: number; title: string; stageId: number; expectedRevenue: number; priority: number; tags: string | null; sortOrder: number;
  customerName: string | null; ownerName: string | null; nextActivity: number | null; status: string;
};

export function Stars({ n, size = "text-sm" }: { n: number; size?: string }) {
  return (
    <span className={`${size} leading-none tracking-tight`} title={`Priority ${n}/3`}>
      {[1, 2, 3].map((i) => <span key={i} className={i <= n ? "text-amber-400" : "text-slate-200"}>★</span>)}
    </span>
  );
}

export function ActivityDot({ ts }: { ts: number | null }) {
  if (!ts) return <span className="size-2 rounded-full bg-slate-200" title="No activity planned" />;
  const d = new Date(ts * 1000);
  const today = startOfLocalDay(Date.now()); // IST, same on server and browser
  const tomorrow = new Date(today.getTime() + 864e5);
  const [cls, t] = d < today ? ["bg-red-500", "Overdue activity"] : d < tomorrow ? ["bg-amber-400", "Activity due today"] : ["bg-emerald-500", "Activity planned"];
  return <span className={`size-2 rounded-full ${cls}`} title={`${t} · ${localDateKey(d)}`} suppressHydrationWarning />;
}


export function PipelineBoard({ stages, cards }: { stages: Stage[]; cards: Card[] }) {
  const [items, move] = useOptimistic(cards, (state, m: { id: number; stageId: number; sortOrder: number }) =>
    state.map((c) => (c.id === m.id ? { ...c, stageId: m.stageId, sortOrder: m.sortOrder } : c)),
  );
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<{ stage: number; before: number | null } | null>(null);

  const drop = (stageId: number, beforeId: number | null) => {
    if (drag == null) return;
    const col = items.filter((c) => c.stageId === stageId && c.id !== drag).sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = beforeId == null ? col.length : col.findIndex((c) => c.id === beforeId);
    const prev = col[idx - 1]?.sortOrder, next = col[idx]?.sortOrder;
    const sortOrder = prev == null && next == null ? 0 : prev == null ? next! - 1 : next == null ? prev + 1 : (prev + next) / 2;
    const id = drag;
    setDrag(null); setOver(null);
    startTransition(async () => { move({ id, stageId, sortOrder }); await moveLead(id, stageId, sortOrder); });
  };

  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      {stages.map((s) => {
        const col = items.filter((c) => c.stageId === s.id).sort((a, b) => a.sortOrder - b.sortOrder);
        const total = col.reduce((a, c) => a + c.expectedRevenue, 0);
        const sc = stageColor(s.color);
        return (
          <div
            key={s.id}
            onDragOver={(e) => { e.preventDefault(); if (over?.stage !== s.id || over.before !== null) setOver({ stage: s.id, before: null }); }}
            onDrop={(e) => { e.preventDefault(); drop(s.id, over?.stage === s.id ? over.before : null); }}
            className={`flex w-72 shrink-0 snap-start flex-col rounded-xl p-2 transition-colors ${over?.stage === s.id ? "bg-brand-50 ring-2 ring-brand-200" : "bg-slate-100/80"}`}
          >
            <div className="px-2 pb-2 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><span className={`size-2 shrink-0 rounded-full ${sc.dot}`} /><span className="truncate">{s.name}</span></span>
                <span className="text-xs font-medium text-slate-500">{col.length}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${sc.bar}`} style={{ width: col.length ? "100%" : "0%" }} /></div>
                <span className="text-xs font-semibold tabular-nums text-slate-700">{inrShort(total)}</span>
              </div>
            </div>
            <div className="min-h-16 flex-1 space-y-2">
              {col.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => { setDrag(c.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (over?.before !== c.id) setOver({ stage: s.id, before: c.id }); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(s.id, c.id); }}
                  className={`${drag === c.id ? "opacity-40" : ""} ${over?.before === c.id && drag !== c.id ? "border-t-2 border-brand-500 pt-1" : ""}`}
                >
                  <Link href={`/crm/${c.id}`} draggable={false} className="card block cursor-grab p-3 transition hover:border-brand-200 hover:shadow-sm active:cursor-grabbing">
                    <div className="text-sm font-medium leading-snug">{c.title}</div>
                    {c.expectedRevenue > 0 && <div className="mt-1 text-sm font-semibold tabular-nums text-slate-800">{inrShort(c.expectedRevenue)}</div>}
                    <div className="mt-0.5 truncate text-xs text-slate-500">{c.customerName ?? "—"}</div>
                    {tagList(c.tags).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tagList(c.tags).slice(0, 4).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{t}</span>)}
                      </div>
                    )}
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="flex items-center gap-2"><Stars n={c.priority} /><ActivityDot ts={c.nextActivity} /></span>
                      <Avatar name={c.ownerName} size="sm" />
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
