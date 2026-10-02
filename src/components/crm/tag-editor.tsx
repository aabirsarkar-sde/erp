"use client";
import { useMemo, useOptimistic, useRef, useState, startTransition } from "react";
import { setLeadTags } from "@/app/actions/crm";
import { tagCls, TAG_GROUP_LIST, type TagDef } from "@/lib/crm/meta";

/** Google Keep–style labels: click "+ Label", type to search or create, × to remove. Saves instantly. */
export function TagEditor({ leadId, tags, defs, size = "md" }: { leadId: number; tags: string[]; defs: TagDef[]; size?: "sm" | "md" }) {
  const [list, setList] = useOptimistic(tags);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const save = (next: string[]) => startTransition(async () => { setList(next); await setLeadTags(leadId, next); });
  const has = (t: string) => list.some((x) => x.toLowerCase() === t.toLowerCase());
  const add = (t: string) => { const v = t.trim(); if (v && !has(v)) save([...list, v]); setQ(""); input.current?.focus(); };
  const remove = (t: string) => save(list.filter((x) => x !== t));

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pool = defs.filter((d) => !has(d.name) && (!s || d.name.toLowerCase().includes(s)));
    return TAG_GROUP_LIST.map((g) => [g, pool.filter((d) => d.group === g)] as const).filter(([, xs]) => xs.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, defs, list]);
  const exact = defs.some((d) => d.name.toLowerCase() === q.trim().toLowerCase());
  const chip = size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs";

  return (
    <div className="relative flex flex-wrap items-center gap-1">
      {list.map((t) => (
        <span key={t} className={`group inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${chip} ${tagCls(t, defs)}`}>
          {t}
          <button type="button" onClick={() => remove(t)} className="opacity-40 hover:opacity-100" aria-label={`Remove ${t}`}>×</button>
        </span>
      ))}
      <button type="button" onClick={() => { setOpen((o) => !o); setTimeout(() => input.current?.focus(), 0); }} className={`rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-700 ${chip}`}>+ Label</button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(q); } }} placeholder="Search or create a label…" className="input py-1.5 text-sm" />
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {q.trim() && !exact && <button type="button" onClick={() => add(q)} className="w-full rounded px-2 py-1 text-left text-sm text-brand-700 hover:bg-brand-50">+ Create “{q.trim()}”</button>}
            {groups.map(([g, xs]) => (
              <div key={g}>
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {xs.map((d) => <button key={d.name} type="button" onClick={() => add(d.name)} className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset hover:brightness-95 ${tagCls(d.name, defs)}`}>{d.name}</button>)}
                </div>
              </div>
            ))}
            {!groups.length && !q.trim() && <p className="px-1 text-xs text-slate-500">Type to create a label.</p>}
          </div>
          <button type="button" onClick={() => setOpen(false)} className="mt-2 w-full rounded py-1 text-xs text-slate-500 hover:bg-slate-50">Done</button>
        </div>
      )}
    </div>
  );
}
