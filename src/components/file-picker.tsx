"use client";
import { useRef } from "react";

import { fmtSize } from "@/lib/format";

export function FilePicker({ files, setFiles, compact }: { files: File[]; setFiles: (f: File[]) => void; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <input
        ref={ref}
        type="file"
        multiple
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
        className="hidden"
        onChange={(e) => {
          setFiles([...files, ...Array.from(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} className="btn-ghost px-2 py-1 text-xs" title="Attach photos or files">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></svg>
        {!compact && "Attach"}
      </button>
      {files.map((f, i) => (
        <span key={i} className="inline-flex max-w-[12rem] items-center gap-1 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-xs text-slate-700">
          <span className="truncate">{f.name}</span>
          <span className="shrink-0 text-slate-400">{fmtSize(f.size)}</span>
          <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Remove">×</button>
        </span>
      ))}
    </div>
  );
}
