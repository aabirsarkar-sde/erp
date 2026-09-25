import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, tickets, messages } from "@/db";
import { requireUser } from "@/lib/auth";
import { lookups } from "@/lib/queries";
import { getSla } from "@/lib/sla";
import { responseSla, TONE_CLS } from "@/lib/sla-status";
import { AttachmentList } from "@/components/attachment-list";
import { AiTicketPanel } from "@/components/ai-ticket-panel";
import { aiEnabled } from "@/lib/ai";
import { assignToMe, setStage } from "@/app/actions/tickets";
import { StageBadge, PriorityFlag, Avatar } from "@/components/ui";
import { TicketProps } from "@/components/ticket-props";
import { Composer } from "@/components/composer";
import { ticketRef } from "@/lib/constants";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { IconBack } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: ticketRef(Number((await params).id)) };
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const [t, lk] = await Promise.all([
    db.query.tickets.findFirst({
      where: eq(tickets.id, id),
      with: { customer: true, contact: true, team: true, assignee: { columns: { id: true, name: true } }, createdBy: { columns: { name: true } }, messages: { orderBy: asc(messages.createdAt), with: { author: { columns: { name: true } }, attachments: true } } },
    }),
    lookups(),
  ]);
  const sla = await getSla();
  if (!t) notFound();
  const slaState = responseSla(t, sla.response);
  const customerEmail = t.contact?.email || t.customer?.email || null;
  const open = t.stage === "new" || t.stage === "in_progress" || t.stage === "waiting";

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/tickets" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><IconBack className="size-4" />Tickets</Link>
      <div className="mb-5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono text-xs">{ticketRef(t.id)}</span>
          <StageBadge stage={t.stage} />
          <PriorityFlag p={t.priority} />
          {t.category && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{t.category}</span>}
          {slaState && <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TONE_CLS[slaState.tone]}`}>{slaState.label}</span>}
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t.subject}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t.customer ? <Link href={`/customers/${t.customer.id}`} className="font-medium text-slate-700 hover:underline">{t.customer.name}</Link> : "No customer"}
          {t.site && ` · ${t.site}`} · {t.team.location} · opened {timeAgo(t.createdAt)}{t.createdBy && ` by ${t.createdBy.name}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {t.assigneeId !== me.id && <form action={assignToMe.bind(null, t.id)}><button className="btn-secondary">Assign to me</button></form>}
          {open ? (
            <form action={setStage.bind(null, t.id, "resolved")}><button className="btn-primary">Mark resolved</button></form>
          ) : (
            <form action={setStage.bind(null, t.id, "in_progress")}><button className="btn-secondary">Reopen</button></form>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(t.description || t.contact) && (
            <div className="card p-4">
              {t.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{t.description}</p>}
              {t.contact && (
                <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 ${t.description ? "mt-3 border-t border-slate-100 pt-3" : ""}`}>
                  <span>Contact: <b className="font-medium text-slate-700">{t.contact.name}</b></span>
                  {t.contact.phone && <a href={`tel:${t.contact.phone}`} className="text-brand-700 hover:underline">{t.contact.phone}</a>}
                  {t.contact.email && <a href={`mailto:${t.contact.email}`} className="text-brand-700 hover:underline">{t.contact.email}</a>}
                </div>
              )}
            </div>
          )}

          <Composer ticketId={t.id} customerEmail={customerEmail} ai={aiEnabled()} />

          <ol className="space-y-3">
            {[...t.messages].reverse().map((m) =>
              m.kind === "event" ? (
                <li key={m.id} className="px-1 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-slate-300" />
                    <span><b className="font-medium text-slate-600">{m.author?.name ?? "System"}</b> · {m.body}</span>
                    <span className="ml-auto shrink-0 text-slate-400">{fmtDateTime(m.createdAt)}</span>
                  </div>
                  <AttachmentList items={m.attachments} />
                </li>
              ) : (
                <li key={m.id} className={`card p-4 ${m.kind === "note" ? "border-amber-200 bg-amber-50/50" : m.kind === "inbound" ? "border-sky-200 bg-sky-50/40" : ""}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Avatar name={m.kind === "inbound" ? m.fromName || m.fromEmail : m.author?.name} size="sm" />
                    <span className="text-sm font-medium">{m.kind === "inbound" ? m.fromName || m.fromEmail : m.author?.name ?? "System"}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${m.kind === "note" ? "bg-amber-100 text-amber-700" : m.kind === "inbound" ? "bg-sky-100 text-sky-700" : "bg-brand-50 text-brand-700"}`}>
                      {m.kind === "note" ? "Internal" : m.kind === "inbound" ? "Customer" : "Reply"}
                    </span>
                    {m.emailedTo && <span className="text-[11px] text-slate-400">emailed to {m.emailedTo}</span>}
                    <span className="ml-auto text-xs text-slate-400">{fmtDateTime(m.createdAt)}</span>
                  </div>
                  {m.body !== "(attachment)" && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{m.body}</p>}
                  <AttachmentList items={m.attachments} />
                </li>
              ),
            )}
          </ol>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          {aiEnabled() && <AiTicketPanel ticketId={t.id} />}
          <TicketProps t={t} teams={lk.teams} users={lk.users} customers={lk.customers} />
          <div className="card space-y-1.5 p-4 text-xs text-slate-500">
            <div className="flex justify-between"><span>Created</span><span className="text-slate-700">{fmtDateTime(t.createdAt)}</span></div>
            <div className="flex justify-between"><span>First response</span><span className="text-slate-700">{t.firstResponseAt ? fmtDateTime(t.firstResponseAt) : "—"}</span></div>
            <div className="flex justify-between"><span>Resolved</span><span className="text-slate-700">{t.resolvedAt ? fmtDateTime(t.resolvedAt) : "—"}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
