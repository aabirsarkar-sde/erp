"use client";
import { useState, useTransition } from "react";
import { aiLeadBrief, aiFollowUp, scheduleSuggested } from "@/app/actions/ai";
import { AiButton, AiError, Sparkle } from "./ai-ui";
import { ACTIVITY_META } from "@/lib/crm";
import type { ActivityType } from "@/db/crm";

type Brief = { summary: string; health: string; risks: string[]; nextStep: string; suggestedActivity: { type: ActivityType; summary: string; dueInDays: number } };
const HEALTH: Record<string, string> = { "on track": "bg-emerald-50 text-emerald-700", "needs attention": "bg-amber-50 text-amber-700", "at risk": "bg-red-50 text-red-700", stalled: "bg-slate-100 text-slate-600" };

export function AiLeadPanel({ leadId, customerId, email }: { leadId: number; customerId: number | null; email: string | null }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [mail, setMail] = useState<{ subject: string; body: string } | null>(null);
  const [purpose, setPurpose] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [b1, s1] = useTransition();
  const [b2, s2] = useTransition();
  const [b3, s3] = useTransition();

  const runBrief = () => s1(async () => { setErr(null); setScheduled(false); const r = await aiLeadBrief(leadId); if (r.ok) setBrief(r.data as Brief); else setErr(r.error); });
  const runMail = () => s2(async () => { setErr(null); const r = await aiFollowUp(leadId, purpose || undefined); if (r.ok) setMail(r.data); else setErr(r.error); });
  const schedule = () => brief && s3(async () => { await scheduleSuggested(leadId, customerId, brief.suggestedActivity); setScheduled(true); });

  return (
    <div className="card border-violet-100 p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-violet-800"><Sparkle />AI assistant</h3>
      <div className="flex flex-wrap gap-2">
        <AiButton onClick={runBrief} busy={b1} className="flex-1 py-1.5 text-xs">{brief ? "Refresh brief" : "Brief me on this deal"}</AiButton>
      </div>
      <div className="mt-2"><AiError msg={err} /></div>
      {brief && (
        <div className="mt-3 space-y-2.5 text-sm">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize ${HEALTH[brief.health] ?? HEALTH.stalled}`}>{brief.health}</span>
          <p className="leading-relaxed text-slate-700">{brief.summary}</p>
          {brief.risks.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">{brief.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          <div className="rounded-lg bg-violet-50/70 p-2.5">
            <div className="text-xs font-semibold text-violet-800">Next step</div>
            <p className="text-slate-700">{brief.nextStep}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span>{ACTIVITY_META[brief.suggestedActivity.type].emoji} {brief.suggestedActivity.summary} · in {brief.suggestedActivity.dueInDays}d</span>
              {scheduled ? <span className="font-medium text-emerald-700">✓ Scheduled</span> : <button onClick={schedule} disabled={b3} className="btn-secondary px-2 py-1 text-xs">Schedule</button>}
            </div>
          </div>
        </div>
      )}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="flex gap-2">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Email purpose (optional)" className="input py-1.5 text-xs" />
          <AiButton onClick={runMail} busy={b2} className="shrink-0 px-2.5 py-1.5 text-xs">Draft email</AiButton>
        </div>
        {mail && (
          <div className="mt-3 space-y-2">
            <input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} className="input py-1.5 text-sm font-medium" />
            <textarea value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} rows={9} className="input text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={async () => { await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="btn-secondary flex-1 py-1.5 text-xs">{copied ? "Copied ✓" : "Copy"}</button>
              <a href={`mailto:${email ?? ""}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`} className="btn-primary flex-1 py-1.5 text-xs">Open in email</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
