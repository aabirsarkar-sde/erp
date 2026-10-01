import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, customers, leads, quotations, documents, docFolders, crmStages, activities, users, contacts } from "@/db";
import { leadScope, quotationScope, documentScope, activityScope } from "@/lib/access";
import { ACTIVITY_META } from "@/lib/crm";
import { fmtDateTime } from "@/lib/format";
import { DocUpload } from "@/components/doc-upload";
import { lookups } from "@/lib/queries";
import { fmtSize } from "@/lib/format";
import { and, desc, sql } from "drizzle-orm";
import { inr as inrFmt } from "@/lib/format";
import { quoteRef } from "@/lib/crm";
import { QuoteStatus } from "@/components/quote-status";
import { requireUser } from "@/lib/auth";
import { listTickets } from "@/lib/queries";
import { updateCustomer, addContact, deleteContact } from "@/app/actions/customers";
import { StageBadge, PriorityFlag, LinkButton, Avatar } from "@/components/ui";
import { CustomerFields } from "@/components/customer-fields";
import { ticketRef } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { IconBack, IconPlus } from "@/components/icons";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  const c = await db.query.customers.findFirst({ where: eq(customers.id, id), with: { contacts: true } });
  if (!c) notFound();
  const hasCrm = me.crmAccess !== "none", hasHd = me.hdAccess !== "none";
  const [tks, ls, qs, acts] = await Promise.all([
    hasHd ? listTickets({ stage: "all" }, me, 500).then((r) => r.filter((t) => t.customerId === id)) : Promise.resolve([]),
    db.select({ id: leads.id, title: leads.title, status: leads.status, kind: leads.kind, expectedRevenue: leads.expectedRevenue, stage: { name: crmStages.name } })
      .from(leads).innerJoin(crmStages, eq(crmStages.id, leads.stageId)).where(and(eq(leads.customerId, id), leadScope(me))).orderBy(desc(leads.updatedAt)),
    db.select().from(quotations).where(and(eq(quotations.customerId, id), quotationScope(me))).orderBy(desc(quotations.date)),
    db.select({ id: activities.id, type: activities.type, summary: activities.summary, outcome: activities.outcome, discussion: activities.discussion, nextAction: activities.nextAction, dueAt: activities.dueAt, doneAt: activities.doneAt, user: users.name, contact: contacts.name, leadId: activities.leadId, lead: leads.title })
      .from(activities).leftJoin(users, eq(users.id, activities.userId)).leftJoin(contacts, eq(contacts.id, activities.contactId)).leftJoin(leads, eq(leads.id, activities.leadId))
      .where(and(eq(activities.customerId, id), activityScope(me))).orderBy(desc(sql`coalesce(${activities.doneAt}, ${activities.dueAt})`)).limit(100),
  ]);
  const [docs, folders, lk] = await Promise.all([db.select().from(documents).where(and(eq(documents.customerId, id), documentScope(me))).orderBy(desc(documents.createdAt)), db.select().from(docFolders), lookups()]);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><IconBack className="size-4" />Customers</Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{c.name}</h1>
          <p className="text-sm text-slate-500">{[c.city, c.phone, c.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasCrm && <LinkButton href={`/calendar/activity?customer=${c.id}&done=1&type=visit`} variant="secondary"><IconPlus className="size-4" />Log visit</LinkButton>}
          {hasCrm && <LinkButton href={`/crm/new?customer=${c.id}`} variant="secondary"><IconPlus className="size-4" />Opportunity</LinkButton>}
          {hasHd && <LinkButton href={`/tickets/new?customer=${c.id}`}><IconPlus className="size-4" />Ticket</LinkButton>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {hasHd && <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Tickets ({tks.length})</h2>
            {tks.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">No tickets yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {tks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <PriorityFlag p={t.priority} withLabel={false} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.subject}</div>
                        <div className="text-xs text-slate-500">{ticketRef(t.id)} · {timeAgo(t.createdAt)}</div>
                      </div>
                      <StageBadge stage={t.stage} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>}
          {hasCrm && <section className="card">
            <h2 className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm font-semibold">Activity history ({acts.length})<Link href={`/calendar/activity?customer=${c.id}`} className="text-xs font-medium text-brand-700">+ Plan activity</Link></h2>
            {acts.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">No calls, meetings or visits yet.</p> : (
              <ol className="divide-y divide-slate-100">
                {acts.map((a) => (
                  <li key={a.id} className="flex gap-3 px-4 py-3 text-sm">
                    <span className="text-lg leading-none">{ACTIVITY_META[a.type].emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2"><Link href={`/activities/${a.id}`} className="font-medium hover:text-brand-700">{a.summary}</Link>{!a.doneAt && <span className="rounded bg-amber-50 px-1.5 text-[10px] font-semibold uppercase text-amber-700">planned</span>}</div>
                      <div className="text-xs text-slate-500">{fmtDateTime(a.doneAt ?? a.dueAt)} · {a.user ?? "—"}{a.contact ? ` · with ${a.contact}` : ""}{a.lead && <> · <Link href={`/crm/${a.leadId}`} className="text-brand-700 hover:underline">{a.lead}</Link></>}</div>
                      {a.discussion && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-slate-600">{a.discussion}</p>}
                      {a.outcome && <p className="mt-0.5 text-xs text-slate-800">→ {a.outcome}</p>}
                      {a.nextAction && <p className="mt-0.5 text-xs text-slate-500">Next: {a.nextAction}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>}
          {hasCrm && <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Opportunities ({ls.length})</h2>
            {ls.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">No opportunities yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {ls.map((l) => (
                  <li key={l.id}>
                    <Link href={`/crm/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{l.title}</div><div className="text-xs text-slate-500">{l.status === "open" ? l.stage.name : l.status.toUpperCase()}</div></div>
                      <span className="text-sm font-medium tabular-nums">{l.expectedRevenue ? inrFmt(l.expectedRevenue) : "—"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>}
          {qs.length > 0 && (
            <section className="card">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Quotations ({qs.length})</h2>
              <ul className="divide-y divide-slate-100">
                {qs.map((q) => (
                  <li key={q.id}>
                    <Link href={`/quotations/${q.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                      <span className="font-mono text-xs">{quoteRef(q.number, q.revision)}</span>
                      <span className="flex-1"><QuoteStatus s={q.status} /></span>
                      <span className="font-medium tabular-nums">{inrFmt(q.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Documents ({docs.length})</h2>
            {docs.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <a href={`/api/docs/${d.id}?view`} target="_blank" className="min-w-0 flex-1 truncate hover:text-brand-700">{d.name}</a>
                    <span className="text-xs text-slate-400">{fmtSize(d.size)}</span>
                    <a href={`/api/docs/${d.id}`} className="text-xs text-brand-700">Download</a>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-slate-100 p-3"><DocUpload folders={folders} customers={lk.customers} customerId={c.id} /></div>
          </section>
          <details className="card group">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">Edit company details <span className="text-slate-400 group-open:hidden">+</span></summary>
            <form action={updateCustomer.bind(null, c.id)} className="space-y-4 border-t border-slate-100 p-4">
              <CustomerFields c={c} />
              <div className="flex justify-end"><button className="btn-primary">Save</button></div>
            </form>
          </details>
        </div>

        <aside className="space-y-4">
          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Contacts</h2>
            <ul className="divide-y divide-slate-100">
              {c.contacts.map((p) => (
                <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar name={p.name} size="sm" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{p.name}</div>
                    {p.designation && <div className="text-xs text-slate-500">{p.designation}</div>}
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      {p.phone && <a href={`tel:${p.phone}`} className="text-brand-700">{p.phone}</a>}
                      {p.email && <a href={`mailto:${p.email}`} className="truncate text-brand-700">{p.email}</a>}
                    </div>
                  </div>
                  <form action={deleteContact.bind(null, c.id, p.id)}><button className="text-xs text-slate-400 hover:text-red-600">Remove</button></form>
                </li>
              ))}
            </ul>
            <form action={addContact.bind(null, c.id)} className="space-y-2 border-t border-slate-100 p-4">
              <input name="name" required placeholder="Name" className="input" />
              <input name="designation" placeholder="Designation" className="input" />
              <div className="grid grid-cols-2 gap-2">
                <input name="phone" type="tel" placeholder="Phone" className="input" />
                <input name="email" type="email" placeholder="Email" className="input" />
              </div>
              <button className="btn-secondary w-full">Add contact</button>
            </form>
          </section>
          {c.notes && <section className="card p-4 text-sm text-slate-600"><h2 className="mb-1 font-semibold text-slate-900">Notes</h2><p className="whitespace-pre-wrap">{c.notes}</p></section>}
        </aside>
      </div>
    </div>
  );
}
