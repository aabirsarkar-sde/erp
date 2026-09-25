"use client";
import { useState, useTransition } from "react";
import { aiSummarizeTicket } from "@/app/actions/ai";
import { AiButton, AiError, Sparkle } from "./ai-ui";

type S = { summary: string; status: string; nextSteps: string[]; sentiment: string };
const MOOD: Record<string, string> = { calm: "bg-emerald-50 text-emerald-700", concerned: "bg-amber-50 text-amber-700", frustrated: "bg-orange-50 text-orange-700", angry: "bg-red-50 text-red-700" };

export function AiTicketPanel({ ticketId }: { ticketId: number }) {
  const [data, setData] = useState<S | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = () => start(async () => {
    setErr(null);
    const r = await aiSummarizeTicket(ticketId);
    if (r.ok) setData(r.data); else setErr(r.error);
  });
  return (
    <div className="card border-violet-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-violet-800"><Sparkle />AI summary</h3>
        {data && <button onClick={run} disabled={busy} className="text-xs text-violet-600 hover:underline">{busy ? "…" : "Refresh"}</button>}
      </div>
      {!data && <div className="mt-3"><AiButton onClick={run} busy={busy} className="w-full">Summarize this ticket</AiButton></div>}
      <div className="mt-2"><AiError msg={err} /></div>
      {data && (
        <div className="mt-3 space-y-2.5 text-sm">
          <p className="leading-relaxed text-slate-700">{data.summary}</p>
          <p className="text-slate-600"><b className="font-medium text-slate-800">Status:</b> {data.status}</p>
          {data.nextSteps.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-slate-700">{data.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          )}
          <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${MOOD[data.sentiment] ?? MOOD.calm}`}>Customer: {data.sentiment}</span>
        </div>
      )}
    </div>
  );
}
