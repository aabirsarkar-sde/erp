"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { aiAsk } from "@/app/actions/ai";
import { MiniMarkdown } from "@/components/ui/mini-markdown";
import { Sparkle } from "@/components/workspace/ai-ui";

type M = { role: "user" | "assistant"; content: string; error?: boolean };
const HD_Q = ["Which urgent tickets are still open?", "Which zone has the most open tickets?"];
const CRM_Q = ["How is my pipeline looking this month?", "Show HOT deals above 1 crore", "What are my overdue follow-ups?"];

export function AskChat({ name, crm = true, hd = true }: { name: string; crm?: boolean; hd?: boolean }) {
  const SUGGESTIONS = [...(hd ? HD_Q : []), ...(crm ? CRM_Q : []), "Summarise everything open for Neogen Chemicals"];
  const sp = useSearchParams();
  const [msgs, setMsgs] = useState<M[]>([]);
  const [input, setInput] = useState("");
  const [busy, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const send = (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    const next: M[] = [...msgs.filter((m) => !m.error), { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    start(async () => {
      const r = await aiAsk(next.map(({ role, content }) => ({ role, content })));
      setMsgs((cur) => [...cur, r.ok ? { role: "assistant", content: r.data || "(no answer)" } : { role: "assistant", content: r.error, error: true }]);
    });
  };

  useEffect(() => { const q = sp.get("q"); if (q && !asked.current) { asked.current = true; send(q); } });  
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <div className="flex-1 space-y-4 pb-4">
        {msgs.length === 0 && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow"><Sparkle className="size-6" /></div>
            <h2 className="text-lg font-semibold">Hi {name.split(" ")[0]}, what do you want to know?</h2>
            <p className="mt-1 text-sm text-slate-500">Ask about tickets, deals, follow-ups or customers. Answers use live data.</p>
            <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-xs hover:border-violet-300 hover:text-violet-800">{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2 text-sm text-white">{m.content}</div></div>
          ) : (
            <div key={i} className="flex gap-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><Sparkle className="size-3.5" /></span>
              <div className={`max-w-[85%] rounded-2xl rounded-tl-md px-4 py-2.5 ${m.error ? "bg-red-50 text-sm text-red-700" : "card"}`}>{m.error ? m.content : <MiniMarkdown text={m.content} />}</div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><Sparkle className="size-3.5 animate-spin" /></span>
            <div className="card px-4 py-2.5 text-sm text-slate-500">Looking that up…</div>
          </div>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="sticky bottom-20 flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg md:bottom-4">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything… e.g. open tickets in Dahej with no reply" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" autoFocus />
        {msgs.length > 0 && <button type="button" onClick={() => setMsgs([])} className="btn-ghost px-2.5 text-xs">Clear</button>}
        <button disabled={busy || !input.trim()} className="btn-primary">Ask</button>
      </form>
    </div>
  );
}
