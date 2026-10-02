"use client";
import { useState, useTransition } from "react";
import { aiParseNotes, saveParsedLog } from "@/app/actions/ai";
import { AiButton, AiError, Sparkle } from "@/components/workspace/ai-ui";
import { ACTIVITY_META } from "@/lib/crm/meta";
import type { ActivityType } from "@/db/crm";
import { ACTIVITY_TYPE_LIST as ACTIVITY_TYPES } from "@/lib/crm/meta";
import { inr } from "@/lib/core/format";

type P = { summary: string; type: ActivityType; outcome: string; nextActivity: { type: ActivityType; summary: string; dueInDays: number } | null; updates: { expectedRevenue: number | null; probability: number | null } };

export function AiQuickLog({ leadId, customerId }: { leadId?: number; customerId?: number | null }) {
  const [notes, setNotes] = useState("");
  const [p, setP] = useState<P | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const [saving, startSave] = useTransition();

  const parse = () => start(async () => { setErr(null); setSaved(false); const r = await aiParseNotes(notes, leadId); if (r.ok) setP(r.data as P); else setErr(r.error); });
  const save = () => p && startSave(async () => { await saveParsedLog(leadId ?? null, customerId ?? null, p, notes); setSaved(true); setP(null); setNotes(""); });

  return (
    <div className="space-y-2">
      <label className="label flex items-center gap-1 text-violet-800"><Sparkle className="size-3.5" />Quick log — type or dictate what happened</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input" placeholder="e.g. spoke to Vikas ji, they liked the offer but want 5% less, board meeting next Tuesday, call back Wednesday" />
      <div className="flex items-center gap-3">
        <AiButton onClick={parse} busy={busy} disabled={notes.trim().length < 5} className="py-1.5 text-xs">Turn into log</AiButton>
        {saved && <span className="text-xs font-medium text-emerald-700">✓ Logged{leadId ? " and follow-up scheduled" : ""}</span>}
      </div>
      <AiError msg={err} />
      {p && (
        <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-sm">
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <select value={p.type} onChange={(e) => setP({ ...p, type: e.target.value as ActivityType })} className="input w-auto py-1 text-xs">
              {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_META[t].emoji} {ACTIVITY_META[t].label}</option>)}
            </select>
            <input value={p.summary} onChange={(e) => setP({ ...p, summary: e.target.value })} className="input py-1 text-sm font-medium" />
          </div>
          <textarea value={p.outcome} onChange={(e) => setP({ ...p, outcome: e.target.value })} rows={3} className="input text-sm" />
          {p.nextActivity ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-slate-600">Next:</span>
              <input value={p.nextActivity.summary} onChange={(e) => setP({ ...p, nextActivity: { ...p.nextActivity!, summary: e.target.value } })} className="input w-auto flex-1 py-1 text-xs" />
              <span>in</span>
              <input type="number" min={0} value={p.nextActivity.dueInDays} onChange={(e) => setP({ ...p, nextActivity: { ...p.nextActivity!, dueInDays: Number(e.target.value) } })} className="input w-16 py-1 text-xs" />
              <span>days</span>
              <button type="button" onClick={() => setP({ ...p, nextActivity: null })} className="text-slate-400 hover:text-red-600">✕</button>
            </div>
          ) : <p className="text-xs text-slate-500">No follow-up detected.</p>}
          {leadId && (p.updates.expectedRevenue || p.updates.probability != null) && (
            <p className="text-xs text-violet-800">Will also update the deal: {p.updates.expectedRevenue ? `value → ${inr(p.updates.expectedRevenue)} ` : ""}{p.updates.probability != null ? `probability → ${p.updates.probability}%` : ""}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className="btn-primary py-1.5 text-xs">{saving ? "Saving…" : "Save log"}</button>
            <button type="button" onClick={() => setP(null)} className="btn-ghost py-1.5 text-xs">Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
