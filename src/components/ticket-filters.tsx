"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { IconSearch, IconList, IconBoard } from "./icons";
import { STAGE_META, PRIORITIES, COMPLAINT_TYPES } from "@/lib/constants";

type Opt = { id: number; name: string; location?: string | null };

export function TicketFilters({ teams, users }: { teams: Opt[]; users: Opt[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    start(() => router.replace(`${path}?${p.toString()}`));
  };
  useEffect(() => {
    const id = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set("q", q); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const view = sp.get("view") ?? "list";
  const sel = "input py-1.5 sm:w-auto";
  const presets = [
    { k: "", l: "All" },
    { k: "unattended", l: "No reply" },
    { k: "high", l: "High priority" },
    { k: "overdue", l: "Overdue" },
  ];

  return (
    <div className={`mb-4 space-y-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plant no., customer, complainant, TKT-0012…" className="input pl-9" />
        </div>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
          {[["list", IconList], ["board", IconBoard]].map(([v, I]) => {
            const Icon = I as typeof IconList;
            return (
              <button key={v as string} onClick={() => set("view", v === "list" ? "" : (v as string))} className={`rounded-md px-2.5 ${view === v ? "bg-slate-100 text-slate-900" : "text-slate-400"}`} title={`${v} view`}>
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {presets.map((p) => {
          const a = (sp.get("preset") ?? "") === p.k;
          return (
            <button key={p.k} onClick={() => set("preset", p.k)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${a ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>
              {p.l}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <select className={sel} value={sp.get("team") ?? ""} onChange={(e) => set("team", e.target.value)}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.location ?? t.name}</option>)}
        </select>
        <select className={sel} value={sp.get("type") ?? ""} onChange={(e) => set("type", e.target.value)}>
          <option value="">All types</option>
          {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={sel} value={sp.get("stage") ?? (view === "board" ? "all" : "open")} onChange={(e) => set("stage", e.target.value === (view === "board" ? "all" : "open") ? "" : e.target.value)}>
          <option value="open">Open</option>
          <option value="all">All stages</option>
          {Object.entries(STAGE_META).filter(([k]) => k !== "closed").map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
        <select className={sel} value={sp.get("assignee") ?? ""} onChange={(e) => set("assignee", e.target.value)}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className={sel} value={sp.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select className={sel} value={sp.get("sort") ?? ""} onChange={(e) => set("sort", e.target.value)}>
          <option value="">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="priority">Priority</option>
          <option value="updated">Last updated</option>
        </select>
      </div>
    </div>
  );
}
