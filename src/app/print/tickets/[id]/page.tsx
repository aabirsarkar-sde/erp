import { Fragment } from "react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, tickets, messages } from "@/db";
import { requireUser } from "@/lib/auth";
import { assertTicket } from "@/lib/access";
import { PrintShell } from "@/components/print-shell";
import { STAGE_META, PRIORITIES, ticketRef } from "@/lib/constants";
import { fmtDateTime, fmtTat } from "@/lib/format";

export default async function PrintTicket({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  await assertTicket(me, id);
  const t = await db.query.tickets.findFirst({
    where: eq(tickets.id, id),
    with: { customer: true, plant: true, team: true, assignee: true, closedBy: true, messages: { orderBy: asc(messages.createdAt), with: { author: true } } },
  });
  if (!t) notFound();
  const kv: [string, string][] = [
    ["Plant", t.plant ? `${t.plant.plantNo} — ${t.plant.name}` : t.site ?? "—"], ["Customer", t.customer?.name ?? "—"],
    ["Zone", t.team.location ?? t.team.name], ["Type of complaint", t.category ?? "—"],
    ["Priority", PRIORITIES[t.priority]!.label], ["Status", STAGE_META[t.stage].label],
    ["Complaint by", [t.complainantName, t.complainantPhone].filter(Boolean).join(" · ") || "—"], ["Reported", fmtDateTime(t.reportedAt ?? t.createdAt)],
    ["Assigned to", t.assignee?.name ?? "—"], ["Resolved", t.resolvedAt ? fmtDateTime(t.resolvedAt) : "—"],
    ["Turn-around time", fmtTat(t.tatMinutes)], ["Closed by", t.closedBy?.name ?? "—"],
  ];
  return (
    <PrintShell title={`Complaint ${ticketRef(t.id)}`} subtitle={t.subject}>
      <table className="mb-4 w-full border-collapse">
        <tbody>
          {Array.from({ length: kv.length / 2 }, (_, i) => (
            <tr key={i}>
              {kv.slice(i * 2, i * 2 + 2).map(([k, v]) => <Fragment key={k}><td className="w-[18%] border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-600">{k}</td><td className="border border-slate-200 px-2 py-1">{v}</td></Fragment>)}
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Narration</h2>
      <p className="mb-4 whitespace-pre-wrap rounded border border-slate-200 p-2">{t.description ?? "—"}</p>
      <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">History & mail chain</h2>
      <ol className="space-y-1.5">
        {t.messages.map((m) => (
          <li key={m.id} className="break-inside-avoid border-l-2 border-slate-200 pl-2">
            <div className="text-slate-500">{fmtDateTime(m.createdAt)} · <b className="text-slate-700">{m.kind === "inbound" ? m.fromName || m.fromEmail : m.author?.name ?? "System"}</b>{m.kind === "note" ? " (internal)" : m.kind === "inbound" ? " (email in)" : m.emailedTo ? ` → ${m.emailedTo}` : ""}</div>
            <div className={`whitespace-pre-wrap ${m.kind === "event" ? "text-slate-500" : ""}`}>{m.body}</div>
          </li>
        ))}
      </ol>
      {t.signatureKey && (
        <div className="mt-6 break-inside-avoid">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Customer sign-off</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/tickets/${t.id}/signature`} alt="" className="h-20" />
          <div>{t.signedBy}</div>
        </div>
      )}
    </PrintShell>
  );
}
