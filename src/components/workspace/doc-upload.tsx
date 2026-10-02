"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { uploadDocuments } from "@/app/actions/documents";
import { fmtSize } from "@/lib/core/format";

type Opt = { id: number; name: string };
export function DocUpload({ folders, customers, folderId, customerId }: { folders: Opt[]; customers: Opt[]; folderId?: number | null; customerId?: number | null }) {
  const [state, action, pending] = useActionState(uploadDocuments, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setFiles([]); } }, [state]);
  const setInput = (list: File[]) => { const dt = new DataTransfer(); list.forEach((f) => dt.items.add(f)); if (input.current) input.current.files = dt.files; setFiles(list); };
  return (
    <form ref={ref} action={action} className="card space-y-3 p-4">
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); setInput([...files, ...Array.from(e.dataTransfer.files)]); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition ${drag ? "border-brand-500 bg-brand-50" : "border-slate-300 text-slate-500 hover:border-brand-400"}`}
      >
        <input ref={input} name="files" type="file" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        <span className="font-medium text-slate-700">Drop files here or click to choose</span>
        <span className="text-xs">Brochures, drawings, water analysis reports, P&IDs, manuals — up to 15 MB each</span>
      </label>
      {files.length > 0 && <ul className="space-y-0.5 text-xs text-slate-600">{files.map((f, i) => <li key={i} className="flex justify-between"><span className="truncate">{f.name}</span><span className="text-slate-400">{fmtSize(f.size)}</span></li>)}</ul>}
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="folderId" defaultValue={folderId ?? ""} className="input py-1.5"><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <select name="customerId" defaultValue={customerId ?? ""} className="input py-1.5"><option value="">Not linked to a customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <input name="description" className="input py-1.5" placeholder="Description (optional)" />
      <div className="flex items-center gap-3">
        <button disabled={pending || !files.length} className="btn-primary">{pending ? "Uploading…" : `Upload${files.length ? ` ${files.length} file${files.length > 1 ? "s" : ""}` : ""}`}</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">Uploaded ✓</span>}
      </div>
    </form>
  );
}
