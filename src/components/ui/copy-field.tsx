"use client";
import { useState } from "react";
export function CopyField({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} onFocus={(e) => e.target.select()} className="input py-1.5 font-mono text-xs" />
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }} className="btn-secondary shrink-0 py-1.5 text-xs">{ok ? "Copied ✓" : "Copy"}</button>
    </div>
  );
}
