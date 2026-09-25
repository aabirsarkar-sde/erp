"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { IconSearch } from "./icons";

export function useUrlParam() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    start(() => router.replace(`${path}?${p.toString()}`));
  };
  return { sp, set, pending };
}

export function SearchBox({ placeholder }: { placeholder: string }) {
  const { sp, set } = useUrlParam();
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => {
    const id = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set("q", q); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="relative min-w-0 flex-1">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="input pl-9" />
    </div>
  );
}

export function ParamSelect({ name, options, fallback = "", className = "" }: { name: string; options: [string, string][]; fallback?: string; className?: string }) {
  const { sp, set } = useUrlParam();
  return (
    <select className={`input py-1.5 sm:w-auto ${className}`} value={sp.get(name) ?? fallback} onChange={(e) => set(name, e.target.value === fallback ? "" : e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function ParamToggle({ name, options, fallback }: { name: string; options: [string, React.ReactNode, string][]; fallback: string }) {
  const { sp, set } = useUrlParam();
  const cur = sp.get(name) ?? fallback;
  return (
    <div className="flex shrink-0 rounded-lg border border-slate-300 bg-white p-0.5">
      {options.map(([v, label, title]) => (
        <button key={v} title={title} onClick={() => set(name, v === fallback ? "" : v)} className={`rounded-md px-2.5 py-1 text-sm ${cur === v ? "bg-slate-100 text-slate-900" : "text-slate-400"}`}>{label}</button>
      ))}
    </div>
  );
}
