import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, leads, leadNotes, activities, quotations } from "@/db";
import { requireUser } from "@/lib/auth";
import { lookups } from "@/lib/queries";
import { getStages } from "@/lib/crm-queries";
import { moveLead, markWon, markLost, reopenLead } from "@/app/actions/crm";
import { createQuotation } from "@/app/actions/quotations";
import { LeadDetails } from "@/components/lead-details";
import { ActivityForm } from "@/components/activity-form";
import { ActivityItem } from "@/components/activity-item";
import { LeadNote } from "@/components/lead-note";
import { AiLeadPanel } from "@/components/ai-lead-panel";
import { AiQuickLog } from "@/components/ai-quick-log";
import { aiEnabled } from "@/lib/ai";
import { Stars } from "@/components/pipeline-board";
import { tagList } from "@/lib/crm";
import { Avatar } from "@/components/ui";
import { IconBack, IconPlus } from "@/components/icons";
import { ACTIVITY_META, LOST_REASONS, quoteRef } from "@/lib/crm";
import { inr, fmtDate, fmtDateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const l = await db.query.leads.findFirst({ where: eq(leads.id, Number((await params).id)), columns: { title: true } });
  return { title: l?.title ?? "Opportunity" };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  const [l, stages, lk] = await Promise.all([
    db.query.leads.findFirst({
      where: eq(leads.id, id),
      with: {
        customer: true,
        owner: { columns: { name: true } },
        notes: { orderBy: desc(leadNotes.createdAt), with: { author: { columns: { name: true } } } },
        activities: { orderBy: asc(activities.dueAt), with: { user: { columns: { name: true } } } },
        quotations: { orderBy: desc(quotations.date) },
      },
    }),
    getStages(),
    lookups(),
  ]);
  if (!l) notFound();
  const planned = l.activities.filter((a) => !a.doneAt);
  const done = l.activities.filter((a) => a.doneAt);
  const curIdx = stages.findIndex((s) => s.id === l.stageId);
  // merged timeline of notes + done activities
  const timeline = [
    ...l.notes.map((n) => ({ key: `n${n.id}`, at: n.createdAt, who: n.author?.name, kind: n.kind, body: n.body })),
    ...done.map((a) => ({ key: `a${a.id}`, at: a.doneAt!, who: a.user?.name, kind: "activity" as const, body: `${ACTIVITY_META[a.type].emoji} ${a.summary}${a.outcome ? `\n${a.outcome}` : ""}` })),
  ]
    .filter((x) => !(x.kind === "event" && /^(Done|Logged) /.test(x.body)))
    .sort((a, b) => +b.at - +a.at);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/crm" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><IconBack className="size-4" />Pipeline</Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {l.status !== "open" && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${l.status === "won" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{l.status}{l.lostReason ? ` · ${l.lostReason}` : ""}</span>
            )}
            <Stars n={l.priority} />
            {tagList(l.tags).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t}</span>)}
          </div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{l.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {l.customer ? <Link href={`/customers/${l.customer.id}`} className="font-medium text-slate-700 hover:underline">{l.customer.name}</Link> : l.companyName ?? "No customer"}
            {l.contactName && ` · ${l.contactName}`}{l.city && ` · ${l.city}`}{l.capacity && ` · ${l.capacity}`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{inr(l.expectedRevenue)}</div>
          <div className="text-xs text-slate-500">{l.probability}% probability{l.expectedCloseAt && ` · closing ${fmtDate(l.expectedCloseAt)}`}</div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
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
          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Planned activities ({planned.length})</h2>
            {planned.length > 0 && <ul className="divide-y divide-slate-100">{planned.map((a) => <ActivityItem key={a.id} a={{ ...a, userName: a.user?.name }} />)}</ul>}
            {aiEnabled() && <div className="border-t border-slate-100 p-4"><AiQuickLog leadId={l.id} customerId={l.customerId} /></div>}
            <div className="border-t border-slate-100 bg-slate-50/60 p-4">
              <ActivityForm leadId={l.id} users={lk.users} meId={me.id} />
            </div>
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
                  </li>
                ),
              )}
            </ol>
          </section>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          {aiEnabled() && <AiLeadPanel leadId={l.id} customerId={l.customerId} email={l.email ?? l.customer?.email ?? null} />}
          <LeadDetails l={l} users={lk.users} customers={lk.customers} />
        </aside>
      </div>
    </div>
  );
}
