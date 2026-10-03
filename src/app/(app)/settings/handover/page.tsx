import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db, users, leads, customers, activities, tasks, enquiries, tickets } from "@/db";
import { requireAdmin } from "@/lib/core/auth";
import { editionHasCrm, editionHasHd } from "@/lib/core/edition";
import { handOver } from "@/app/actions/handover";
import { PageHeader } from "@/components/ui/ui";
import { inrShort } from "@/lib/core/format";

export const metadata = { title: "Hand over work" };

export default async function HandoverPage({ searchParams }: { searchParams: Promise<{ from?: string; done?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const fromId = Number(sp.from);
  const from = fromId ? await db.query.users.findFirst({ where: eq(users.id, fromId) }) : null;
  if (!from) notFound();
  const n = (q: Promise<{ n: number }[]>) => q.then((r) => Number(r[0]?.n ?? 0));
  const [deals, team, acts, tks, enq, tix] = await Promise.all([
    editionHasCrm ? db.select({ id: leads.id, title: leads.title, kind: leads.kind, value: leads.expectedRevenue, customer: customers.name }).from(leads).leftJoin(customers, eq(customers.id, leads.customerId)).where(and(eq(leads.ownerId, fromId), eq(leads.status, "open"))).orderBy(asc(customers.name)) : Promise.resolve([]),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.active, true), ne(users.id, fromId))).orderBy(asc(users.name)),
    n(db.select({ n: sql<number>`count(*)` }).from(activities).where(and(eq(activities.userId, fromId), isNull(activities.doneAt)))),
    n(db.select({ n: sql<number>`count(*)` }).from(tasks).where(and(eq(tasks.assigneeId, fromId), ne(tasks.status, "done")))),
    editionHasCrm ? n(db.select({ n: sql<number>`count(*)` }).from(enquiries).where(and(eq(enquiries.assignedToId, fromId), eq(enquiries.status, "new")))) : Promise.resolve(0),
    editionHasHd ? n(db.select({ n: sql<number>`count(*)` }).from(tickets).where(and(eq(tickets.assigneeId, fromId), sql`${tickets.stage} in ('new','in_progress','waiting')`))) : Promise.resolve(0),
  ]);
  const done = sp.done ? (JSON.parse(sp.done) as Record<string, number>) : null;
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/settings" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">← Settings</Link>
      <PageHeader title={`Hand over ${from.name}'s work`} subtitle="Customers, deals and their full history stay in the CRM — only the owner changes. Use this when someone leaves, goes on long leave or changes territory." />
      {done && <div className="card mb-4 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" data-testid="handover-done">Done — {done.deals} deal(s), {done.activities} planned activities, {done.tasks} task(s), {done.enquiries} enquiries{done.tickets ? `, ${done.tickets} ticket(s)` : ""} moved to {sp.to}.</div>}
      <form action={handOver.bind(null, fromId)} className="space-y-4">
        <section className="card p-4 text-sm">
          <label className="flex flex-wrap items-center gap-2 font-medium">Give it to
            <select name="toId" required defaultValue="" className="input w-60 py-1.5 text-sm"><option value="" disabled>Choose a colleague…</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </label>
          <label className="mt-3 flex items-center gap-2"><input type="checkbox" name="openWork" defaultChecked /> Also all open work: {acts} planned activities, {tks} task(s){editionHasCrm ? `, ${enq} enquiries` : ""}{editionHasHd ? `, ${tix} open ticket(s)` : ""}</label>
          <label className="mt-1 flex items-center gap-2 text-slate-600"><input type="checkbox" name="deactivate" /> Switch off {from.name}&apos;s login afterwards</label>
        </section>
        {editionHasCrm && (
          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Open deals ({deals.length}) — untick any that should go to someone else (run this again for them)</h2>
            {deals.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">No open deals.</p> : (
              <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {deals.map((d) => <li key={d.id}><label className="flex items-center gap-3 px-4 py-2 text-sm"><input type="checkbox" name="leadIds" value={d.id} defaultChecked /><span className="min-w-0 flex-1 truncate">{d.customer ?? "—"} · {d.title}</span><span className="text-xs uppercase text-slate-400">{d.kind}</span><span className="w-20 text-right tabular-nums">{inrShort(d.value)}</span></label></li>)}
              </ul>
            )}
          </section>
        )}
        <button className="btn-primary">Hand over</button>
      </form>
    </div>
  );
}
