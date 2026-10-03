"use client";
import Link from "next/link";
import { useTransition } from "react";
import { markRead } from "@/app/actions/notifications";
import { timeAgo } from "@/lib/core/format";

type N = { id: number; kind: string; title: string; body: string | null; href: string | null; readAt: Date | null; createdAt: Date; actions: { label: string; href: string; kind?: string }[] };
const ICON: Record<string, string> = { reminder: "⏰", nudge: "✨", task: "☑", enquiry: "📥", system: "🔔" };
const BTN: Record<string, string> = { call: "bg-sky-50 text-sky-800 ring-sky-200", whatsapp: "bg-emerald-50 text-emerald-800 ring-emerald-200", email: "bg-violet-50 text-violet-800 ring-violet-200", link: "bg-white text-slate-700 ring-slate-300" };

export function NotificationItem({ n, compact }: { n: N; compact?: boolean }) {
  const [, start] = useTransition();
  const read = () => { if (!n.readAt) start(() => markRead(n.id)); };
  return (
    <li className={`flex gap-3 px-4 py-3 ${n.readAt ? "" : "bg-brand-50/40"}`} data-kind={n.kind}>
      <span className="mt-0.5 text-lg leading-none" aria-hidden>{ICON[n.kind] ?? "🔔"}</span>
      <div className="min-w-0 flex-1">
        {n.href ? <Link href={n.href} onClick={read} className="text-sm font-medium hover:text-brand-700 hover:underline">{n.title}</Link> : <span className="text-sm font-medium">{n.title}</span>}
        {n.body && !compact && <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>}
        {n.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {n.actions.map((a) => {
              const ext = /^(https?:|tel:|mailto:)/.test(a.href);
              const cls = `rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset hover:brightness-95 ${BTN[a.kind ?? "link"] ?? BTN.link}`;
              return ext ? <a key={a.label} href={a.href} target={a.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={read} className={cls}>{a.label}</a>
                : <Link key={a.label} href={a.href} onClick={read} className={cls}>{a.label}</Link>;
            })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[11px] text-slate-400" suppressHydrationWarning>{timeAgo(n.createdAt)}</span>
        {!n.readAt && <button onClick={read} className="text-[11px] text-slate-400 hover:text-slate-700" title="Mark as read">✓ read</button>}
      </div>
    </li>
  );
}
