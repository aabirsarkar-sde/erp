import Link from "next/link";
import { requireUser } from "@/lib/core/auth";
import { teamStats, myStats, listTickets } from "@/lib/helpdesk/queries";
import { PageHeader, Stat, StageBadge, PriorityFlag, Avatar } from "@/components/ui/ui";
import { ticketRef } from "@/lib/helpdesk/constants";
import { timeAgo, inrShort } from "@/lib/core/format";
import { aiEnabled } from "@/lib/ai/client";
import { Sparkle } from "@/components/workspace/ai-ui";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { DAY_MS, localParts, startOfLocalDay } from "@/lib/core/tz";
import { db, activities, leads } from "@/db";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const me = await requireUser();
  const hd = me.hdAccess !== "none", crm = me.crmAccess !== "none";
  const today = startOfLocalDay(Date.now()), tomorrow = new Date(+today + DAY_MS); // IST, not the server's clock
  // everything in one round trip; the other department's numbers aren't fetched at all
  const [teams, mine, recent, [acts], [pipe]] = await Promise.all([
    hd ? teamStats(me) : Promise.resolve([]),
    hd ? myStats(me) : Promise.resolve({ mine: 0, unassigned: 0, unattended: 0, overdue: 0 }),
    hd ? listTickets({ sort: "updated", stage: "all" }, me, 8) : Promise.resolve([]),
    db.select({ n: sql<number>`count(*)`, late: sql<number>`coalesce(sum(case when ${activities.dueAt} < ${Math.floor(+today / 1000)} then 1 else 0 end),0)` })
      .from(activities).where(and(eq(activities.userId, me.id), isNull(activities.doneAt), lt(activities.dueAt, tomorrow))),
    crm ? db.select({ n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${leads.expectedRevenue}),0)` }).from(leads).where(and(eq(leads.ownerId, me.id), eq(leads.status, "open"))) : Promise.resolve([{ n: 0, v: 0 }]),
  ]);
  const hour = localParts(Date.now()).h;
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={`${greet}, ${me.name.split(" ")[0]}`} subtitle="Here's what needs your attention today." />

      {aiEnabled() && (
        <form action="/ask" className="mb-5 flex items-center gap-2 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-2 pl-3">
          <Sparkle className="size-5 shrink-0 text-violet-600" />
          <input name="q" placeholder={`Ask anything — ${[hd && "“urgent tickets in Dahej”", crm && "“my HOT deals over 1 crore”"].filter(Boolean).join(", ")}…`} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-violet-400" />
          <button className="btn-primary py-1.5">Ask</button>
        </form>
      )}
      {hd && (<>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Assigned to me" value={mine.mine} href="/tickets?assignee=me" tone="brand" />
        <Stat label="Unassigned" value={mine.unassigned} href="/tickets?assignee=unassigned" />
        <Stat label="No response yet" value={mine.unattended} href="/tickets?preset=unattended" tone="amber" />
        <Stat label="Overdue" value={mine.overdue} href="/tickets?preset=overdue" tone="red" />
      </div>
      </>)}

      {crm && (
      <div className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${hd ? "mt-3" : ""}`}>
        <Link href="/activities" className="card p-4 hover:border-brand-200">
          <div className={`text-2xl font-semibold tabular-nums ${Number(acts!.late) ? "text-red-600" : ""}`}>{Number(acts!.n)}</div>
          <div className="text-sm text-slate-500">Activities due today{Number(acts!.late) ? ` · ${acts!.late} overdue` : ""}</div>
        </Link>
        <Link href="/crm" className="card p-4 hover:border-brand-200">
          <div className="text-2xl font-semibold tabular-nums">{inrShort(Number(pipe!.v))}</div>
          <div className="text-sm text-slate-500">My open pipeline · {Number(pipe!.n)} deals</div>
        </Link>
      </div>
      )}

      {hd && (<>
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Support teams</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {teams.map((t) => (
          <div key={t.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-slate-500">Support team</div>
                <div className="truncate font-semibold">{t.location ?? t.name}</div>
              </div>
              <Link href={`/tickets?team=${t.id}`} className="rounded-lg bg-brand-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-brand-700">
                {t.open} to do
              </Link>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
              {[
                ["Unassigned", t.unassigned, `assignee=unassigned`, "text-slate-900"],
                ["No reply", t.unattended, `preset=unattended`, t.unattended ? "text-amber-600" : "text-slate-900"],
                ["High prio", t.high, `preset=high`, t.high ? "text-red-600" : "text-slate-900"],
              ].map(([l, v, qs, cls]) => (
                <Link key={l as string} href={`/tickets?team=${t.id}&${qs}`} className="rounded-md py-1 hover:bg-slate-50">
                  <dd className={`text-lg font-semibold tabular-nums ${cls}`}>{v}</dd>
                  <dt className="text-[11px] text-slate-500">{l}</dt>
                </Link>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recently updated</h2>
        <Link href="/tickets?stage=all&sort=updated" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>
      </div>
      <div className="card divide-y divide-slate-100">
        {recent.map((t) => (
          <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <PriorityFlag p={t.priority} withLabel={false} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.subject}</div>
              <div className="truncate text-xs text-slate-500">{ticketRef(t.id)} · {t.customerName ?? "No customer"} · {t.teamName}</div>
            </div>
            <div className="hidden sm:block"><StageBadge stage={t.stage} /></div>
            <span className="hidden w-16 text-right text-xs text-slate-400 sm:block">{timeAgo(t.updatedAt)}</span>
            <Avatar name={t.assigneeName} size="sm" />
          </Link>
        ))}
      </div>
      </>)}
    </div>
  );
}
