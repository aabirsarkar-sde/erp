import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, tickets, teams, leads, crmStages, activities, users } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { ticketScope, leadScope, activityScope } from "@/lib/core/access";
import { PageHeader } from "@/components/ui/ui";
import { LineChart, BarChart } from "@/components/ui/charts";
import { OPEN_STAGES } from "@/lib/helpdesk/constants";
import { inrShort } from "@/lib/core/format";
import { DAY_MS, localParts, startOfLocalWeek, fromLocal } from "@/lib/core/tz";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {sub && <p className="mb-3 text-xs text-slate-500">{sub}</p>}
      {children}
    </section>
  );
}

export default async function InsightsPage() {
  const me = await requireUser();
  const ts = ticketScope(me), ls = leadScope(me), as = activityScope(me);
  const now = Date.now();
  const wk0 = +startOfLocalWeek(now) - 11 * 7 * DAY_MS;
  const p = localParts(now);
  const m0 = fromLocal(p.y, p.m - 11, 1);
  // Indian financial-year quarter (Apr–Jun = Q1)
  const qStartMonth = [3, 6, 9, 0][Math.floor(((p.m + 9) % 12) / 3)]!;
  const qStart = fromLocal(qStartMonth > p.m ? p.y - 1 : p.y, qStartMonth, 1);
  const fyQ = Math.floor(((p.m + 9) % 12) / 3) + 1;

  const [tRecent, byTeam, byStage, won, acts, [kOpen], [kResp], [kWonQ]] = await Promise.all([
    db.select({ c: tickets.createdAt, r: tickets.resolvedAt }).from(tickets).where(and(ts, sql`(${tickets.createdAt} >= ${Math.floor(wk0 / 1000)} or ${tickets.resolvedAt} >= ${Math.floor(wk0 / 1000)})`)),
    db.select({ id: teams.id, label: teams.location, n: sql<number>`count(${tickets.id})` }).from(teams).leftJoin(tickets, and(eq(tickets.teamId, teams.id), inArray(tickets.stage, OPEN_STAGES), ts)).where(eq(teams.active, true)).groupBy(teams.id),
    db.select({ label: crmStages.name, seq: crmStages.sequence, v: sql<number>`coalesce(sum(${leads.expectedRevenue}),0)`, n: sql<number>`count(${leads.id})` }).from(crmStages).leftJoin(leads, and(eq(leads.stageId, crmStages.id), eq(leads.status, "open"), ls)).groupBy(crmStages.id).orderBy(crmStages.sequence),
    db.select({ at: leads.closedAt, v: leads.expectedRevenue }).from(leads).where(and(eq(leads.status, "won"), gte(leads.closedAt, m0), ls)),
    db.select({ id: users.id, label: users.name, n: sql<number>`count(${activities.id})` }).from(users).leftJoin(activities, and(eq(activities.userId, users.id), isNotNull(activities.doneAt), gte(activities.doneAt, new Date(now - 30 * DAY_MS)), as)).where(eq(users.active, true)).groupBy(users.id),
    db.select({ n: sql<number>`count(*)` }).from(tickets).where(and(inArray(tickets.stage, OPEN_STAGES), ts)),
    db.select({ h: sql<number>`avg((${tickets.firstResponseAt} - ${tickets.createdAt}) / 3600.0)` }).from(tickets).where(and(isNotNull(tickets.firstResponseAt), gte(tickets.createdAt, new Date(now - 30 * DAY_MS)), ts)),
    db.select({ v: sql<number>`coalesce(sum(${leads.expectedRevenue}),0)`, n: sql<number>`count(*)` }).from(leads).where(and(eq(leads.status, "won"), gte(leads.closedAt, qStart), ls)),
  ]);

  const weeks = Array.from({ length: 12 }, (_, i) => wk0 + i * 7 * DAY_MS);
  const wkLabel = (t: number) => { const q = localParts(t); return `${q.d} ${MONTHS[q.m]}`; };
  const inWeek = (d: Date | null, w: number) => !!d && +d >= w && +d < w + 7 * DAY_MS;
  const opened = weeks.map((w) => tRecent.filter((t) => inWeek(t.c, w)).length);
  const resolved = weeks.map((w) => tRecent.filter((t) => inWeek(t.r, w)).length);
  const months = Array.from({ length: 12 }, (_, i) => fromLocal(p.y, p.m - 11 + i, 1));
  const wonByMonth = months.map((m, i) => ({ label: `${MONTHS[localParts(m).m]}${localParts(m).m === 0 || i === 0 ? ` ${String(localParts(m).y).slice(2)}` : ""}`, value: won.filter((w) => w.at && +w.at >= +m && (i === 11 || +w.at < +months[i + 1]!)).reduce((a, w) => a + w.v, 0) }));
  const openPipe = byStage.reduce((a, s) => a + Number(s.v), 0);

  const hd = me.hdAccess !== "none", crm = me.crmAccess !== "none";
  const tiles = [
    ...(hd ? [["Open tickets", String(Number(kOpen!.n))], ["Avg first reply (30 days)", kResp!.h == null ? "—" : Number(kResp!.h) < 1 ? `${Math.round(Number(kResp!.h) * 60)} min` : `${Number(kResp!.h).toFixed(1)} h`]] : []),
    ...(crm ? [["Open pipeline", inrShort(openPipe)], [`Won in FY Q${fyQ}`, `${inrShort(Number(kWonQ!.v))} · ${kWonQ!.n} deals`]] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Insights" subtitle={hd && crm ? "How service and sales are trending" : hd ? "How service is trending" : "How sales are trending"} />
      <div className={`mb-5 grid grid-cols-2 gap-3 ${tiles.length > 2 ? "lg:grid-cols-4" : ""}`}>
        {tiles.map(([l, v]) => <div key={l} className="card p-4"><div className="text-xs text-slate-500">{l}</div><div className="mt-0.5 text-xl font-semibold tabular-nums">{v}</div></div>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {hd && <><Card title="Tickets opened vs resolved" sub="Per week, last 12 weeks" className="lg:col-span-2">
          <LineChart labels={weeks.map(wkLabel)} series={[{ name: "Opened", values: opened }, { name: "Resolved", values: resolved }]} />
        </Card>
        <Card title="Open tickets by team" sub="Right now">
          <BarChart horizontal data={byTeam.map((t) => ({ label: t.label ?? "—", value: Number(t.n), href: `/tickets?team=${t.id}` })).sort((a, b) => b.value - a.value)} valueLabel="Open tickets" />
        </Card></>}
        {crm && <>
        <Card title="Open pipeline by stage" sub="Expected revenue of open deals">
          <BarChart horizontal data={byStage.map((s) => ({ label: s.label, value: Number(s.v) }))} format="inr" valueLabel="Expected revenue" />
        </Card>
        <Card title="Won revenue by month" sub="Last 12 months">
          <BarChart data={wonByMonth} format="inr" valueLabel="Won" />
        </Card>
        <Card title="Activities completed per person" sub="Calls, meetings and visits logged in the last 30 days">
          <BarChart horizontal data={acts.map((a) => ({ label: a.label, value: Number(a.n) })).sort((a, b) => b.value - a.value)} valueLabel="Activities" />
        </Card></>}
      </div>
    </div>
  );
}
