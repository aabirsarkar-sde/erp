"use client";
import { useState, useTransition } from "react";

/** a button that runs a server action and shows what came back */
export function RunButton({ action, label, format }: { action: () => Promise<unknown>; label: string; format?: "nudges" | "mailbox" }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const show = (r: unknown) => {
    const x = r as Record<string, unknown>;
    if (format === "nudges") return `${x.created ?? 0} new suggestion(s) for ${x.people ?? 0} people${x.ai ? " (worded by AI)" : ""}`;
    return x.ok ? String(x.detail ?? "Done") : `Failed: ${x.error ?? "unknown error"}`;
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => { try { setMsg(show(await action())); } catch (e) { setMsg((e as Error).message); } })} className="btn-secondary py-1.5 text-sm">{pending ? "Running…" : label}</button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </span>
  );
}
