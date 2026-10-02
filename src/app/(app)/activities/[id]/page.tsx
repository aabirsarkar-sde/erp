import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, activities } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { canSeeActivity } from "@/lib/core/access";
import { deleteActivity } from "@/app/actions/crm";
import { ActivityReport } from "@/components/crm/activity-report";
import { ACTIVITY_META } from "@/lib/crm/meta";
import { fmtDateTime } from "@/lib/core/format";
import { localDateKey } from "@/lib/core/tz";
import { IconBack } from "@/components/ui/icons";

export const metadata = { title: "Activity" };

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!Number.isFinite(id) || !(await canSeeActivity(me, id))) notFound();
  const a = await db.query.activities.findFirst({
    where: eq(activities.id, id),
    with: { lead: { columns: { id: true, title: true } }, customer: { columns: { id: true, name: true } }, contact: { columns: { name: true, phone: true, email: true } }, user: { columns: { name: true } } },
  });
  if (!a) notFound();
  const m = ACTIVITY_META[a.type];
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (v ? <div className="flex gap-3 py-1.5 text-sm"><dt className="w-28 shrink-0 text-slate-500">{k}</dt><dd className="min-w-0">{v}</dd></div> : null);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={a.dueAt ? `/calendar?date=${localDateKey(a.dueAt)}` : "/activities"} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><IconBack className="size-4" />Calendar</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">{m.emoji} {m.label}</span>
            {a.doneAt ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold uppercase text-emerald-700">Done</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold uppercase text-amber-800">Planned</span>}
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{a.summary}</h1>
        </div>
        <form action={deleteActivity.bind(null, a.id)}><button className="text-xs text-slate-400 hover:text-red-600">Delete</button></form>
      </div>
      <dl className="card mb-4 divide-y divide-slate-100 px-4 py-2">
        <Row k="When" v={`${fmtDateTime(a.dueAt)}${a.durationMin ? ` · ${a.durationMin} min` : ""}`} />
        <Row k="Client" v={a.customer && <Link href={`/customers/${a.customer.id}`} className="font-medium text-brand-700 hover:underline">{a.customer.name}</Link>} />
        <Row k="Contact" v={a.contact && `${a.contact.name}${a.contact.phone ? ` · ${a.contact.phone}` : ""}${a.contact.email ? ` · ${a.contact.email}` : ""}`} />
        <Row k="Opportunity" v={a.lead && <Link href={`/crm/${a.lead.id}`} className="font-medium text-brand-700 hover:underline">{a.lead.title}</Link>} />
        <Row k="Location" v={a.location} />
        <Row k="Assigned to" v={a.user?.name} />
        <Row k="Agenda" v={a.note && <span className="whitespace-pre-wrap">{a.note}</span>} />
        <Row k="Completed" v={a.doneAt && fmtDateTime(a.doneAt)} />
      </dl>
      {a.doneAt && (a.discussion || a.outcome) && (
        <section className="card mb-4 space-y-3 p-5 text-sm">
          {a.discussion && <div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Discussion points</h3><p className="whitespace-pre-wrap">{a.discussion}</p></div>}
          {a.outcome && <div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Outcome</h3><p className="whitespace-pre-wrap">{a.outcome}</p></div>}
          {a.nextAction && <div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Next action</h3><p>{a.nextAction}</p></div>}
        </section>
      )}
      <ActivityReport a={{ id: a.id, type: a.type, discussion: a.discussion, outcome: a.outcome, nextAction: a.nextAction, location: a.location, durationMin: a.durationMin, done: !!a.doneAt }} />
    </div>
  );
}
