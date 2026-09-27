"use client";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { sendChat, markChatRead } from "@/app/actions/chat";
import { Avatar } from "./ui";

type Msg = { id: number; body: string; at: number; authorId: number | null; author: string };

function Body({ text, meName }: { text: string; meName: string }) {
  const parts = text.split(/(\bTKT-\d{1,6}\b|https?:\/\/\S+|@[A-Z][a-z]+(?: [A-Z][a-z]+)?)/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
      {parts.map((p, i) => {
        if (/^TKT-\d+$/.test(p)) return <Link key={i} href={`/tickets/${Number(p.slice(4))}`} className="font-medium text-brand-700 hover:underline">{p}</Link>;
        if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className="text-brand-700 underline">{p}</a>;
        if (/^@/.test(p)) return <span key={i} className={`rounded px-0.5 font-medium ${meName.startsWith(p.slice(1)) ? "bg-amber-100 text-amber-900" : "text-brand-700"}`}>{p}</span>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </p>
  );
}

const dayLabel = (t: number) => new Date(t).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
const timeLabel = (t: number) => new Date(t).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

export function ChatRoom({ channelId, initial, meId, meName, title, placeholder }: { channelId: number; initial: Msg[]; meId: number; meName: string; title: string; placeholder: string }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [sending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = msgs.length ? msgs[msgs.length - 1]!.id : 0;
  const lastRef = useRef(lastId);
  lastRef.current = lastId;

  const merge = useCallback((more: Msg[]) => setMsgs((cur) => { const seen = new Set(cur.map((m) => m.id)); return [...cur, ...more.filter((m) => !seen.has(m.id))]; }), []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/chat/${channelId}?after=${lastRef.current}`, { cache: "no-store" });
        if (r.ok && alive) merge(await r.json());
      } catch {}
    };
    const id = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [channelId, merge]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    if (lastId) markChatRead(channelId, lastId);
  }, [lastId, channelId]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    start(async () => { const r = await sendChat(channelId, body, lastRef.current); if (r.ok) merge(r.messages); });
  };

  let prevDay = "", prevAuthor: number | null = -1, prevAt = 0;
  return (
    <div className="flex h-[calc(100dvh-9.5rem)] flex-col md:h-[calc(100dvh-7.5rem)]">
      <div className="border-b border-slate-200 px-4 py-3 font-semibold">{title}</div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No messages yet — say hello 👋</p>}
        {msgs.map((m) => {
          const day = dayLabel(m.at);
          const showDay = day !== prevDay;
          const grouped = !showDay && prevAuthor === m.authorId && m.at - prevAt < 5 * 60_000;
          prevDay = day; prevAuthor = m.authorId; prevAt = m.at;
          return (
            <Fragment key={m.id}>
              {showDay && <div className="my-3 flex items-center gap-3 text-[11px] font-medium text-slate-400"><span className="h-px flex-1 bg-slate-200" />{day}<span className="h-px flex-1 bg-slate-200" /></div>}
              <div className={`flex gap-2.5 ${grouped ? "mt-0.5" : "mt-3"}`}>
                <div className="w-8 shrink-0">{!grouped && <Avatar name={m.author} />}</div>
                <div className="min-w-0 flex-1">
                  {!grouped && <div className="flex items-baseline gap-2"><span className={`text-sm font-semibold ${m.authorId === meId ? "text-brand-700" : ""}`}>{m.author}</span><span className="text-[11px] text-slate-400">{timeLabel(m.at)}</span></div>}
                  <Body text={m.body} meName={meName} />
                </div>
              </div>
            </Fragment>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-slate-200 p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder={placeholder} className="input max-h-40 min-h-10 resize-none" />
        <button disabled={sending || !text.trim()} className="btn-primary">Send</button>
      </form>
    </div>
  );
}
