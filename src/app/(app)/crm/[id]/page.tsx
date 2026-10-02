import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, ne } from "drizzle-orm";
import { db, leads, leadNotes, activities, quotations, documents, users } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { canSeeLead } from "@/lib/core/access";
import { lookups } from "@/lib/core/lookups";
import { getStages } from "@/lib/crm/queries";
import { moveLead, markWon, markLost, reopenLead, convertToOpportunity, addLeadMember, removeLeadMember } from "@/app/actions/crm";
import { LeadDocUpload } from "@/components/crm/lead-docs";
import { createQuotation } from "@/app/actions/quotations";
import { LeadDetails } from "@/components/crm/lead-details";
import { ActivityForm } from "@/components/crm/activity-form";
import { ActivityItem } from "@/components/crm/activity-item";
import { LeadNote } from "@/components/crm/lead-note";
import { AiLeadPanel } from "@/components/crm/ai-lead-panel";
import { AiQuickLog } from "@/components/crm/ai-quick-log";
import { aiEnabled } from "@/lib/ai/client";
import { Stars } from "@/components/crm/pipeline-board";
import { tagList, ageTone, daysBetween } from "@/lib/crm/meta";
import { TagEditor } from "@/components/crm/tag-editor";
import { listTasks } from "@/lib/workspace/tasks";
import { TaskList, TaskForm } from "@/components/workspace/tasks";
import { ContactCard } from "@/components/crm/contact-card";
import { tagSuggestions } from "@/lib/crm/tags";
import { Avatar } from "@/components/ui/ui";
import { IconBack, IconPlus } from "@/components/ui/icons";
import { ACTIVITY_META, LOST_REASONS, PROPOSAL_META, quoteRef } from "@/lib/crm/meta";
import { inr, fmtDate, fmtDateTime, fmtSize } from "@/lib/core/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const l = await db.query.leads.findFirst({ where: eq(leads.id, Number((await params).id)), columns: { title: true } });
  return { title: l?.title ?? "Opportunity" };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const [ok, l, stages, lk, docs, salesUsers, tagDefsAll, tks] = await Promise.all([
    canSeeLead(me, id), // checked together with the data load — one round trip
    db.query.leads.findFirst({
      where: eq(leads.id, id),
      with: {
        customer: true,
        owner: { columns: { name: true } },
        notes: { orderBy: desc(leadNotes.createdAt), with: { author: { columns: { name: true } } } },
        activities: { orderBy: asc(activities.dueAt), with: { user: { columns: { name: true } } } },
        quotations: { orderBy: desc(quotations.date) },
        members: { with: { user: { columns: { id: true, name: true } } } },
      },
    }),
    getStages(),
    lookups(),
    db.select({ id: documents.id, name: documents.name, size: documents.size, description: documents.description, createdAt: documents.createdAt, by: users.name })
      .from(documents).leftJoin(users, eq(users.id, documents.uploadedById)).where(eq(documents.leadId, id)).orderBy(desc(documents.createdAt)),
    db.select({ id: users.id, name: users.name }).from(users).where(ne(users.crmAccess, "none")).orderBy(asc(users.name)),
    tagSuggestions(),
    listTasks(me, { leadId: id }),
  ]);
  if (!ok || !l) notFound();
  const age = daysBetween(l.createdAt, Date.now());
  const planned = l.activities.filter((a) => !a.doneAt);
  const done = l.activities.filter((a) => a.doneAt);
  const curIdx = stages.findIndex((s) => s.id === l.stageId);
  // merged timeline of notes + done activities
  const timeline = [
    ...l.notes.map((n) => ({ key: `n${n.id}`, at: n.createdAt, who: n.author?.name, kind: n.kind, body: n.body })),
    ...done.map((a) => ({ key: `a${a.id}`, at: a.doneAt!, who: a.user?.name, kind: "activity" as const, body: `${ACTIVITY_META[a.type].emoji} ${a.summary}${a.discussion ? `\n${a.discussion}` : ""}${a.outcome ? `\n→ ${a.outcome}` : ""}${a.nextAction ? `\nNext: ${a.nextAction}` : ""}`, href: `/activities/${a.id}` })),
  ]
    .filter((x) => !(x.kind === "event" && /^(Done|Logged) /.test(x.body)))
    .sort((a, b) => +b.at - +a.at);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={l.kind === "lead" ? "/crm/leads" : "/crm"} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><IconBack className="size-4" />{l.kind === "lead" ? "Leads" : "Pipeline"}</Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${l.kind === "lead" ? "bg-amber-100 text-amber-800" : "bg-brand-50 text-brand-700"}`}>{l.kind}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROPOSAL_META[l.proposalStatus]?.cls}`}>Proposal: {PROPOSAL_META[l.proposalStatus]?.label}</span>
            {l.status !== "open" && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${l.status === "won" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{l.status}{l.lostReason ? ` · ${l.lostReason}` : ""}</span>
            )}
            <Stars n={l.priority} />
            {l.status === "open" ? (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ageTone(age)}`} title={`Created ${fmtDate(l.createdAt)}`}>Day {age}</span>
            ) : l.closedAt && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700" title="Turnaround from creation to closure">{l.status === "won" ? "Won" : "Closed"} in {daysBetween(l.createdAt, l.closedAt)} days</span>
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{l.title}</h1>
          <div className="mt-1.5"><TagEditor leadId={l.id} tags={tagList(l.tags)} defs={tagDefsAll} /></div>
          <p className="mt-1 text-sm text-slate-500">
            {l.customer ? <Link href={`/customers/${l.customer.id}`} className="font-medium text-slate-700 hover:underline">{l.customer.name}</Link> : l.companyName ?? "No customer"}
            {l.contactName && ` · ${l.contactName}`}{l.city && ` · ${l.city}`}{l.capacity && ` · ${l.capacity}`}
          </p>
          {l.product && <p className="mt-0.5 text-sm text-slate-600">Offered: <b className="font-medium">{l.product}</b></p>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{inr(l.expectedRevenue)}</div>
          <div className="text-xs text-slate-500">{l.probability}% probability{l.expectedCloseAt && ` · closing ${fmtDate(l.expectedCloseAt)}`}</div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {l.kind === "lead" && <form action={convertToOpportunity.bind(null, l.id)}><button className="btn-primary">Convert to opportunity</button></form>}
        {l.status === "open" ? (
          <>
            <form action={markWon.bind(null, l.id)}><button className="btn bg-emerald-600 text-white hover:bg-emerald-700">Won</button></form>
            <details className="relative">
              <summary className="btn-secondary cursor-pointer list-none">Lost</summary>
              <form action={markLost.bind(null, l.id)} className="card absolute left-0 z-10 mt-1 w-64 space-y-2 p-3 shadow-lg">
                <select name="reason" className="input">{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                <button className="btn-primary w-full">Mark as lost</button>
              </form>
            </details>
          </>
        ) : (
          <form action={reopenLead.bind(null, l.id)}><button className="btn-secondary">Reopen</button></form>
        )}
        <form action={createQuotation}><input type="hidden" name="leadId" value={l.id} /><button className="btn-secondary"><IconPlus className="size-4" />Quotation</button></form>
        <Link href={`/calendar/activity?lead=${l.id}&type=visit`} className="btn-secondary"><IconPlus className="size-4" />Visit / activity</Link>
        <Link href={`/calendar/new?lead=${l.id}${l.customerId ? `&customer=${l.customerId}` : ""}&title=${encodeURIComponent(`Meeting — ${l.customer?.name ?? l.title}`)}`} className="btn-secondary"><IconPlus className="size-4" />Meeting</Link>
        <span className="ml-auto" />
      </div>

      {l.status === "open" && (
        <div className="mb-5 flex overflow-x-auto rounded-lg border border-slate-200 bg-white text-xs font-medium">
          {stages.map((s, i) => (
            <form key={s.id} action={moveLead.bind(null, l.id, s.id, undefined)} className="flex-1">
              <button className={`relative w-full whitespace-nowrap px-3 py-2.5 transition ${i === curIdx ? "bg-brand-600 text-white" : i < curIdx ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "text-slate-500 hover:bg-slate-50"}`}>
                {s.name}
              </button>
            </form>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ContactCard l={{ id: l.id, contactName: l.contactName, phone: l.phone, email: l.email, address: l.address, city: l.city }} />
          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Planned activities ({planned.length})</h2>
            {planned.length > 0 && <ul className="divide-y divide-slate-100">{planned.map((a) => <ActivityItem key={a.id} a={{ ...a, userName: a.user?.name }} />)}</ul>}
            {aiEnabled() && <div className="border-t border-slate-100 p-4"><AiQuickLog leadId={l.id} customerId={l.customerId} /></div>}
            <div className="border-t border-slate-100 bg-slate-50/60 p-4">
              <ActivityForm leadId={l.id} users={lk.users} meId={me.id} />
            </div>
          </section>

          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Tasks ({tks.filter((x) => x.status !== "done").length} open)</h2>
            <TaskList tasks={tks} users={lk.users} />
            <div className="border-t border-slate-100 bg-slate-50/60 p-3"><TaskForm users={lk.users} meId={me.id} leadId={l.id} compact /></div>
          </section>

          <section className="card">
            <h2 className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm font-semibold">Proposals & documents <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROPOSAL_META[l.proposalStatus]?.cls}`}>{PROPOSAL_META[l.proposalStatus]?.label}</span></h2>
            {docs.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="text-lg">{d.description?.startsWith("Proposal") ? "📑" : "📄"}</span>
                    <span className="min-w-0 flex-1"><a href={`/api/docs/${d.id}`} className="block truncate font-medium text-brand-700 hover:underline">{d.name}</a><span className="block truncate text-xs text-slate-500">{d.description ? `${d.description} · ` : ""}{fmtSize(d.size)} · {d.by ?? "—"} · {fmtDate(d.createdAt)}</span></span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-slate-100 bg-slate-50/60 p-4"><LeadDocUpload leadId={l.id} /></div>
          </section>

          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Quotations</h2>
            {l.quotations.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">No quotations yet — use the “Quotation” button above.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {l.quotations.map((q) => (
                  <li key={q.id}>
                    <Link href={`/quotations/${q.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                      <span className="font-mono text-xs">{quoteRef(q.number, q.revision)}</span>
                      <span className="flex-1 truncate text-slate-500">{fmtDate(q.date)} · <span className="capitalize">{q.status}</span></span>
                      <span className="font-medium tabular-nums">{inr(q.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">History</h2>
            <div className="border-b border-slate-100 p-4"><LeadNote leadId={l.id} /></div>
            <ol className="space-y-3 p-4">
              {timeline.map((t) =>
                t.kind === "event" ? (
                  <li key={t.key} className="flex gap-2 text-xs text-slate-500">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300" />
                    <span className="flex-1"><b className="font-medium text-slate-600">{t.who ?? "System"}</b> · {t.body}</span>
                    <span className="shrink-0 text-slate-400">{fmtDateTime(t.at)}</span>
                  </li>
                ) : (
                  <li key={t.key} className={`rounded-lg p-3 ${t.kind === "activity" ? "bg-slate-50" : "bg-amber-50/60"}`}>
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <Avatar name={t.who} size="sm" /><b className="font-medium">{t.who}</b>
                      <span className="ml-auto text-slate-400">{fmtDateTime(t.at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{t.body}</p>
                    {"href" in t && t.href && <Link href={t.href} className="mt-1 inline-block text-xs text-brand-700 hover:underline">Open report →</Link>}
                  </li>
                ),
              )}
            </ol>
          </section>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          {aiEnabled() && <AiLeadPanel leadId={l.id} customerId={l.customerId} email={l.email ?? l.customer?.email ?? null} />}
          <section className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Assigned & followers</h3>
            <ul className="mb-3 space-y-1.5 text-sm">
              <li className="flex items-center gap-2"><Avatar name={l.owner?.name} size="sm" /><span className="flex-1">{l.owner?.name ?? "—"}</span><span className="text-xs text-slate-500">owner</span></li>
              {l.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2"><Avatar name={m.user.name} size="sm" /><span className="flex-1">{m.user.name}</span><span className="text-xs text-slate-500">{m.role}</span>
                  <form action={removeLeadMember.bind(null, l.id, m.userId)}><button className="text-xs text-slate-300 hover:text-red-600" title="Remove">✕</button></form></li>
              ))}
            </ul>
            <form action={addLeadMember.bind(null, l.id)} className="flex gap-1.5">
              <select name="userId" className="input py-1 text-sm" defaultValue=""><option value="" disabled>Add person…</option>{salesUsers.filter((u) => u.id !== l.ownerId && !l.members.some((m) => m.userId === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <select name="role" className="input w-28 py-1 text-sm"><option value="follower">Follower</option><option value="assigned">Assigned</option></select>
              <button className="btn-secondary px-2 py-1 text-sm">Add</button>
            </form>
            <p className="mt-2 text-xs text-slate-500">Followers and assignees can see this opportunity even if it isn&apos;t theirs.</p>
          </section>
          <LeadDetails l={l} users={lk.users} customers={lk.customers} />
        </aside>
      </div>
    </div>
  );
}
