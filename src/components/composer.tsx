"use client";
import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { addMessage } from "@/app/actions/tickets";
import { buildFormData } from "@/lib/compress";
import { FilePicker } from "./file-picker";
import { aiDraftReply } from "@/app/actions/ai";
import { AiButton } from "./ai-ui";

export function Composer({ ticketId, customerEmail, ai, canned = [], fill = {} }: { ticketId: number; customerEmail: string | null; ai?: boolean; canned?: { id: number; title: string; body: string }[]; fill?: Record<string, string> }) {
  const [kind, setKind] = useState<"reply" | "note">("note");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [state, action, pending] = useActionState(addMessage.bind(null, ticketId), undefined);
  const ref = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [drafting, setDrafting] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const draft = async () => {
    setDrafting(true); setAiErr(null);
    const instruction = bodyRef.current?.value.trim() || undefined;
    const r = await aiDraftReply(ticketId, instruction);
    setDrafting(false);
    if (!r.ok) return setAiErr(r.error);
    setKind("reply");
    if (bodyRef.current) { bodyRef.current.value = r.data.reply; bodyRef.current.focus(); }
  };
  useEffect(() => {
    if (state?.ok) { ref.current?.reset(); setFiles([]); }
  }, [state]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = await buildFormData(e.currentTarget, files);
    setBusy(false);
    startTransition(() => action(fd));
  };
  const working = pending || busy;

  return (
    <form ref={ref} onSubmit={onSubmit} className={`card overflow-hidden ${kind === "note" ? "ring-1 ring-amber-200" : ""}`}>
      <input type="hidden" name="kind" value={kind} />
      <div className="flex border-b border-slate-100 text-sm">
        {(["note", "reply"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`px-4 py-2 font-medium ${kind === k ? (k === "note" ? "border-b-2 border-amber-400 text-amber-700" : "border-b-2 border-brand-600 text-brand-700") : "text-slate-500"}`}>
            {k === "note" ? "Internal note" : "Reply to customer"}
          </button>
        ))}
      </div>
      {kind === "reply" && (
        <div className="border-b border-slate-100 bg-brand-50/40 px-4 py-1.5 text-xs text-slate-600">
          {customerEmail ? <>Will be emailed to <b className="font-medium">{customerEmail}</b></> : "No customer email on file — the reply will be logged but not emailed."}
        </div>
      )}
      <textarea ref={bodyRef} name="body" rows={kind === "reply" ? 6 : 3} className={`block w-full resize-y border-0 px-4 py-3 text-sm outline-none ${kind === "note" ? "bg-amber-50/40" : ""}`} placeholder={kind === "note" ? "Visible only to your team…" : ai ? "Write your reply — or type a hint (e.g. “visit Monday, ask for logs”) and press Draft reply…" : "Write your reply to the customer…"} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilePicker files={files} setFiles={setFiles} />
          {canned.length > 0 && (
            <select value="" onChange={(e) => { const c = canned.find((x) => String(x.id) === e.target.value); if (c && bodyRef.current) { bodyRef.current.value = c.body.replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? `{${k}}`); setKind("reply"); bodyRef.current.focus(); } }} className="input w-auto py-1 text-xs">
              <option value="">Canned reply…</option>
              {canned.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          )}
          {ai && <AiButton onClick={draft} busy={drafting} className="px-2.5 py-1 text-xs">Draft reply</AiButton>}
          {aiErr && <span className="text-xs text-red-600">{aiErr}</span>}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
          {state?.info && !state.error && <span className="text-xs text-slate-500">{state.info}</span>}
          <button disabled={working} className="btn-primary py-1.5">{working ? "Saving…" : kind === "note" ? "Add note" : "Send reply"}</button>
        </div>
      </div>
    </form>
  );
}
