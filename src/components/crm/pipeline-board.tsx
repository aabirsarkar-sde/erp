"use client";
import { startOfLocalDay, localDateKey } from "@/lib/core/tz";
import Link from "next/link";
import { useOptimistic, useState, startTransition } from "react";
import { moveLead, updateLead } from "@/app/actions/crm";
import { stageColor, tagList, tagCls, ageTone, daysBetween, missingContact, type TagDef } from "@/lib/crm/meta";
import { inrShort } from "@/lib/core/format";
import { Avatar } from "@/components/ui/ui";

type Stage = { id: number; name: string; color: string };
export type Card = {
  id: number; title: string; stageId: number; expectedRevenue: number; priority: number; tags: string | null; sortOrder: number;
  customerName: string | null; ownerName: string | null; ownerId: number | null; nextActivity: number | null; status: string; createdAt: Date;
  product: string | null; city: string | null; contactName: string | null; phone: string | null; email: string | null; address: string | null;
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


export type GroupBy = "stage" | "owner" | "product" | "geography" | "temperature";
export type SortBy = "manual" | "revenue" | "age";

/** Kanban board. Grouped by stage (drag to move stage) or salesperson (drag to reassign); other groupings are read-only views. */
export function PipelineBoard({ stages, cards, groupBy = "stage", sortBy = "manual", users, defs }: { stages: Stage[]; cards: Card[]; groupBy?: GroupBy; sortBy?: SortBy; users: { id: number; name: string }[]; defs: TagDef[] }) {
  const [items, move] = useOptimistic(cards, (state, m: { id: number; stageId?: number; ownerId?: number | null; ownerName?: string | null; sortOrder?: number }) =>
    state.map((c) => (c.id === m.id ? { ...c, ...m } : c)),
  );
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<{ col: string; before: number | null } | null>(null);
  const draggable = groupBy === "stage" || groupBy === "owner";

  const groupOf = (tagGroup: string) => (c: Card) => tagList(c.tags).find((t) => defs.find((d) => d.name.toLowerCase() === t.toLowerCase())?.group === tagGroup);
  const cols: { key: string; label: string; dot?: string; match: (c: Card) => boolean; stageId?: number; ownerId?: number | null }[] =
    groupBy === "stage" ? stages.map((s) => ({ key: `s${s.id}`, label: s.name, dot: stageColor(s.color).dot, match: (c) => c.stageId === s.id, stageId: s.id }))
    : groupBy === "owner" ? [...users.map((u) => ({ key: `u${u.id}`, label: u.name, match: (c: Card) => c.ownerId === u.id, ownerId: u.id as number | null })), { key: "u0", label: "Unassigned", match: (c: Card) => !c.ownerId, ownerId: null }]
    : (() => {
        const keyOf = groupBy === "product" ? (c: Card) => c.product ?? "" : groupBy === "geography" ? (c: Card) => groupOf("Geography")(c) ?? c.city ?? "" : (c: Card) => groupOf("Temperature")(c) ?? "";
        const keys = [...new Set(items.map(keyOf))].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1));
        return keys.map((k) => ({ key: `k${k}`, label: k || (groupBy === "temperature" ? "No temperature label" : "Not set"), match: (c: Card) => keyOf(c) === k }));
      })();
  const order = (a: Card, b: Card) => (sortBy === "revenue" ? b.expectedRevenue - a.expectedRevenue : sortBy === "age" ? +a.createdAt - +b.createdAt : a.sortOrder - b.sortOrder);

  const drop = (col: (typeof cols)[number], beforeId: number | null) => {
    if (drag == null || !draggable) return;
    const id = drag;
    setDrag(null); setOver(null);
    if (groupBy === "owner") {
      const card = items.find((c) => c.id === id);
      if (card?.ownerId === col.ownerId) return;
      const fd = new FormData(); fd.set("ownerId", col.ownerId ? String(col.ownerId) : "");
      startTransition(async () => { move({ id, ownerId: col.ownerId ?? null, ownerName: users.find((u) => u.id === col.ownerId)?.name ?? null }); await updateLead(id, fd); });
      return;
    }
    const list = items.filter((c) => c.stageId === col.stageId && c.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = beforeId == null ? list.length : list.findIndex((c) => c.id === beforeId);
    const prev = list[idx - 1]?.sortOrder, next = list[idx]?.sortOrder;
    const sortOrder = prev == null && next == null ? 0 : prev == null ? next! - 1 : next == null ? prev + 1 : (prev + next) / 2;
    startTransition(async () => { move({ id, stageId: col.stageId!, sortOrder }); await moveLead(id, col.stageId!, sortOrder); });
  };

  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      {cols.map((colDef) => {
        const col = items.filter(colDef.match).sort(order);
        const total = col.reduce((a, c) => a + c.expectedRevenue, 0);
        const isOver = over?.col === colDef.key;
        return (
          <div
            key={colDef.key}
            onDragOver={(e) => { if (!draggable) return; e.preventDefault(); if (!isOver || over?.before !== null) setOver({ col: colDef.key, before: null }); }}
            onDrop={(e) => { e.preventDefault(); drop(colDef, isOver ? over!.before : null); }}
            className={`flex w-72 shrink-0 snap-start flex-col rounded-xl p-2 transition-colors ${isOver ? "bg-brand-50 ring-2 ring-brand-200" : "bg-slate-100/80"}`}
          >
            <div className="px-2 pb-2 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">{colDef.dot && <span className={`size-2 shrink-0 rounded-full ${colDef.dot}`} />}<span className="truncate">{colDef.label}</span></span>
                <span className="text-xs font-medium text-slate-500">{col.length}</span>
              </div>
              <div className="mt-1 text-right text-xs font-semibold tabular-nums text-slate-700">{inrShort(total)}</div>
            </div>
            <div className="min-h-16 flex-1 space-y-2">
              {col.map((c) => {
                const age = daysBetween(c.createdAt, Date.now());
                const missing = missingContact(c);
                return (
                  <div
                    key={c.id}
                    draggable={draggable}
                    onDragStart={(e) => { setDrag(c.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onDragOver={(e) => { if (!draggable) return; e.preventDefault(); e.stopPropagation(); if (over?.before !== c.id) setOver({ col: colDef.key, before: c.id }); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(colDef, c.id); }}
                    className={`${drag === c.id ? "opacity-40" : ""} ${over?.before === c.id && drag !== c.id ? "border-t-2 border-brand-500 pt-1" : ""}`}
                  >
                    <Link href={`/crm/${c.id}`} draggable={false} className={`card block p-3 transition hover:border-brand-200 hover:shadow-sm ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium leading-snug">{c.title}</div>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ageTone(age)}`} title="Days since the opportunity was created" suppressHydrationWarning>{age}d</span>
                      </div>
                      {c.expectedRevenue > 0 && <div className="mt-1 text-sm font-semibold tabular-nums text-slate-800">{inrShort(c.expectedRevenue)}</div>}
                      <div className="mt-0.5 truncate text-xs text-slate-500">{c.customerName ?? "—"}{c.product ? ` · ${c.product}` : ""}</div>
                      {tagList(c.tags).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tagList(c.tags).slice(0, 5).map((t) => <span key={t} className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${tagCls(t, defs)}`}>{t}</span>)}
                        </div>
                      )}
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="flex items-center gap-2"><Stars n={c.priority} /><ActivityDot ts={c.nextActivity} />{missing.length > 0 && <span className="text-[10px] font-medium text-amber-700" title={`Missing: ${missing.join(", ")}`}>⚠ contact</span>}</span>
                        <Avatar name={c.ownerName} size="sm" />
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
