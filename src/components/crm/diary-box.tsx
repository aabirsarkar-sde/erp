"use client";
import { useRef, useState, useTransition } from "react";
import { saveDiary } from "@/app/actions/crm";

/** Free-form notes for the day. Saves itself a moment after you stop typing. */
export function DiaryBox({ day, initial, readOnly }: { day: string; initial: string; readOnly?: boolean }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(true);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = (v: string) => start(async () => { await saveDiary(day, v); setSaved(true); });
  return (
    <div>
      <textarea
        defaultValue={initial} readOnly={readOnly} rows={10}
        onChange={(e) => { if (readOnly) return; setSaved(false); const v = e.target.value; if (t.current) clearTimeout(t.current); t.current = setTimeout(() => save(v), 900); }}
        onBlur={(e) => { if (!readOnly && !saved) save(e.target.value); }}
        placeholder={readOnly ? "No diary notes for this day." : "Notes for the day: who you met, market news, competitor moves, ideas, things to remember…"}
        className="input min-h-48 text-sm leading-relaxed"
      />
      {!readOnly && <p className="mt-1 text-right text-[11px] text-slate-400">{pending ? "Saving…" : saved ? "Saved" : "Typing…"}</p>}
    </div>
  );
}
