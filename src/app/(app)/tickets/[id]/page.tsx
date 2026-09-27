import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, tickets, messages, users, cannedResponses } from "@/db";
import { requireUser } from "@/lib/auth";
import { lookups } from "@/lib/queries";
import { getSla } from "@/lib/sla";
import { responseSla, TONE_CLS } from "@/lib/sla-status";
import { AttachmentList } from "@/components/attachment-list";
import { AiTicketPanel } from "@/components/ai-ticket-panel";
import { aiEnabled } from "@/lib/ai";
import { assignToMe, setStage, addWatcher, removeWatcher } from "@/app/actions/tickets";
import { TransferButton, EmailTicketButton, ResolveButton } from "@/components/ticket-actions";
import { getHoEmails } from "@/lib/notify";
import { StageBadge, PriorityFlag, Avatar } from "@/components/ui";
import { TicketProps } from "@/components/ticket-props";
import { Composer } from "@/components/composer";
import { ticketRef, typeMeta } from "@/lib/constants";
import { fmtDateTime, timeAgo, fmtTat } from "@/lib/format";
import { IconBack } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: ticketRef(Number((await params).id)) };
}

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "mail" ? "mail" : "all";
  const me = await requireUser();
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const [t, lk] = await Promise.all([
    db.query.tickets.findFirst({
      where: eq(tickets.id, id),
      with: { customer: true, contact: true, team: true, plant: true, watchers: true, closedBy: { columns: { name: true } }, assignee: { columns: { id: true, name: true } }, createdBy: { columns: { name: true } }, messages: { orderBy: asc(messages.createdAt), with: { author: { columns: { name: true } }, attachments: true } } },
    }),
    lookups(),
  ]);
  const [sla, ho, staff, canned] = await Promise.all([getSla(), getHoEmails(), db.select({ email: users.email }).from(users).where(eq(users.active, true)), db.select().from(cannedResponses)]);
  if (!t) notFound();
  const mailSuggestions = [...new Set([...ho, t.complainantEmail, t.contact?.email, ...staff.map((u) => u.email)].filter((x): x is string => !!x))];
  const shownMessages = view === "mail" ? t.messages.filter((m) => m.kind === "inbound" || (m.kind === "reply" && m.emailedTo)) : t.messages;
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
          {t.category && <span className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${typeMeta(t.category).chip}`}>{typeMeta(t.category).icon} {t.category}</span>}
          {t.tatMinutes != null && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">TAT {fmtTat(t.tatMinutes)}</span>}
          {slaState && <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TONE_CLS[slaState.tone]}`}>{slaState.label}</span>}
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t.subject}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t.plant && <><Link href={`/tickets?plant=${t.plant.id}&stage=all`} className="font-mono font-semibold text-slate-800 hover:underline">{t.plant.plantNo}</Link> {t.plant.name} · </>}
          {t.customer ? <Link href={`/customers/${t.customer.id}`} className="font-medium text-slate-700 hover:underline">{t.customer.name}</Link> : "No customer"}
          {!t.plant && t.site && ` · ${t.site}`} · Zone {t.team.location} · reported {fmtDateTime(t.reportedAt ?? t.createdAt)}{t.complainantName && ` by ${t.complainantName}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {open ? <ResolveButton ticketId={t.id} complainant={t.complainantName} /> : <form action={setStage.bind(null, t.id, "in_progress")}><button className="btn-secondary">Reopen</button></form>}
          {t.assigneeId !== me.id && <form action={assignToMe.bind(null, t.id)}><button className="btn-secondary">Assign to me</button></form>}
          <TransferButton ticketId={t.id} users={lk.users} currentId={t.assigneeId} />
          <EmailTicketButton ticketId={t.id} suggestions={mailSuggestions} />
          <a href={`/print/tickets/${t.id}`} target="_blank" className="btn-ghost">PDF</a>
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

          <Composer ticketId={t.id} customerEmail={customerEmail} ai={aiEnabled()} canned={canned} fill={{ name: t.complainantName ?? t.contact?.name ?? "Sir/Madam", plant: t.plant ? `${t.plant.plantNo} ${t.plant.name}` : t.site ?? "your plant" }} />

          <div className="flex gap-1 text-sm">
            {[["all", "All activity"], ["mail", `Email thread (${t.messages.filter((m) => m.kind === "inbound" || (m.kind === "reply" && m.emailedTo)).length})`]].map(([k, l]) => (
              <Link key={k} href={k === "all" ? `/tickets/${t.id}` : `/tickets/${t.id}?view=mail`} scroll={false} className={`rounded-full px-3 py-1 font-medium ${view === k ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{l}</Link>
            ))}
          </div>

          <ol className="space-y-3">
            {[...shownMessages].reverse().map((m) =>
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
                      {m.kind === "note" ? "Internal" : m.kind === "inbound" ? (m.authorId ? "Email · staff" : "Email in") : "Reply"}
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
            <div className="flex justify-between font-medium"><span>Turn-around time</span><span className="text-emerald-700">{fmtTat(t.tatMinutes)}</span></div>
            {t.closedBy && <div className="flex justify-between"><span>Closed by</span><span className="text-slate-700">{t.closedBy.name}</span></div>}
            {t.csatScore != null && <div className="flex justify-between"><span>Customer rating</span><span className="text-amber-500">{"★".repeat(t.csatScore)}<span className="text-slate-200">{"★".repeat(5 - t.csatScore)}</span></span></div>}
            {t.csatComment && <p className="rounded bg-slate-50 p-2 italic text-slate-600">“{t.csatComment}”</p>}
          </div>
          {t.signatureKey && (
            <div className="card p-4 text-xs text-slate-500">
              <div className="mb-1 font-semibold text-slate-700">Customer sign-off</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/tickets/${t.id}/signature`} alt="Signature" className="h-20 w-full rounded border border-slate-200 bg-white object-contain" />
              {t.signedBy && <div className="mt-1">Signed by {t.signedBy}</div>}
            </div>
          )}
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Followers <span className="font-normal text-slate-400">— get every email on this ticket</span></h3>
            <ul className="space-y-1 text-xs">
              {t.watchers.map((w) => (
                <li key={w.email} className="flex items-center justify-between gap-2">
                  <span className="truncate">{w.name ? `${w.name} · ` : ""}{w.email}</span>
                  <form action={removeWatcher.bind(null, t.id, w.email)}><button className="text-slate-300 hover:text-red-600">✕</button></form>
                </li>
              ))}
              {t.watchers.length === 0 && <li className="text-slate-400">Nobody yet.</li>}
            </ul>
            <form action={addWatcher.bind(null, t.id)} className="mt-2 flex gap-1.5">
              <input name="email" type="email" required placeholder="add email" className="input py-1 text-xs" />
              <button className="btn-secondary px-2 py-1 text-xs">Add</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
