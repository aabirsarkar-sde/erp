import Link from "next/link";
import { and, gte } from "drizzle-orm";
import { db, tickets } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { ticketScope, requireDept } from "@/lib/core/access";
import { lookups } from "@/lib/core/lookups";
import { getSla } from "@/lib/helpdesk/sla";
import { PageHeader } from "@/components/ui/ui";
import { OPEN_STAGES } from "@/lib/helpdesk/constants";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const H = 3600e3;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const hrs = (v: number | null) => (v == null ? "—" : v < 1 ? `${Math.round(v * 60)}m` : v < 48 ? `${v.toFixed(1)}h` : `${(v / 24).toFixed(1)}d`);
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

type T = typeof tickets.$inferSelect;

function metrics(ts: T[], sla: { response: number[]; resolution: number[] }) {
  const responded = ts.filter((t) => t.firstResponseAt);
  const resolved = ts.filter((t) => t.resolvedAt);
  const respH = responded.map((t) => (+t.firstResponseAt! - +t.createdAt) / H);
  const resH = resolved.map((t) => (+t.resolvedAt! - +t.createdAt) / H);
  const inSla = responded.filter((t) => (+t.firstResponseAt! - +t.createdAt) / H <= sla.response[t.priority]!).length;
  const resInSla = resolved.filter((t) => (+t.resolvedAt! - +t.createdAt) / H <= sla.resolution[t.priority]!).length;
  return {
    created: ts.length,
    resolved: resolved.length,
    open: ts.filter((t) => (OPEN_STAGES as string[]).includes(t.stage)).length,
    avgResp: avg(respH),
    avgRes: avg(resH),
    respSla: responded.length ? inSla / responded.length : null,
    resSla: resolved.length ? resInSla / resolved.length : null,
  };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const me = await requireUser();
  requireDept(me, "hd");
  const days = [7, 30, 90, 365].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const since = new Date(Date.now() - days * 24 * H);
  const [ts, lk, sla] = await Promise.all([db.select().from(tickets).where(and(gte(tickets.createdAt, since), ticketScope(me))), lookups(), getSla()]);
  const all = metrics(ts, sla);
  const byTeam = lk.teams.map((t) => ({ name: t.location ?? t.name, id: t.id, ...metrics(ts.filter((x) => x.teamId === t.id), sla) }));
  const byAgent = lk.users
    .map((u) => ({ name: u.name, id: u.id, ...metrics(ts.filter((x) => x.assigneeId === u.id), sla) }))
    .filter((r) => r.created > 0)
    .sort((a, b) => b.resolved - a.resolved);
  const cats = Object.entries(
    ts.reduce<Record<string, number>>((acc, t) => ((acc[t.category || "Uncategorised"] = (acc[t.category || "Uncategorised"] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);

  const tiles = [
    ["Tickets created", String(all.created)],
    ["Resolved", String(all.resolved)],
    ["Still open", String(all.open)],
    ["Avg first reply", hrs(all.avgResp)],
    ["Avg time to resolve", hrs(all.avgRes)],
    ["Replied within SLA", pct(all.respSla)],
  ];

  const Table = ({ rows, first, link }: { rows: typeof byTeam; first: string; link: (id: number) => string }) => (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
          <tr>
            <th className="px-4 py-2.5">{first}</th>
            <th className="px-3 py-2.5 text-right">Created</th>
            <th className="px-3 py-2.5 text-right">Resolved</th>
            <th className="px-3 py-2.5 text-right">Open</th>
            <th className="px-3 py-2.5 text-right">Avg reply</th>
            <th className="px-3 py-2.5 text-right">Avg resolve</th>
            <th className="px-3 py-2.5 text-right">Reply SLA</th>
            <th className="px-4 py-2.5 text-right">Resolve SLA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium"><Link href={link(r.id)} className="hover:text-brand-700">{r.name}</Link></td>
              <td className="px-3 py-2.5 text-right">{r.created}</td>
              <td className="px-3 py-2.5 text-right">{r.resolved}</td>
              <td className="px-3 py-2.5 text-right">{r.open}</td>
              <td className="px-3 py-2.5 text-right">{hrs(r.avgResp)}</td>
              <td className="px-3 py-2.5 text-right">{hrs(r.avgRes)}</td>
              <td className={`px-3 py-2.5 text-right ${r.respSla != null && r.respSla < 0.8 ? "text-red-600" : ""}`}>{pct(r.respSla)}</td>
              <td className={`px-4 py-2.5 text-right ${r.resSla != null && r.resSla < 0.8 ? "text-red-600" : ""}`}>{pct(r.resSla)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Reports"
        subtitle={`Tickets created in the last ${days} days`}
        actions={
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
            {[7, 30, 90, 365].map((d) => (
              <Link key={d} href={`/reports?days=${d}`} className={`rounded-md px-3 py-1 ${d === days ? "bg-slate-100 font-medium text-slate-900" : "text-slate-500"}`}>{d === 365 ? "1y" : `${d}d`}</Link>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([l, v]) => (
          <div key={l} className="card p-4">
            <div className="text-2xl font-semibold tabular-nums">{v}</div>
            <div className="mt-0.5 text-sm text-slate-500">{l}</div>
          </div>
        ))}
      </div>
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">By team</h2>
      <Table rows={byTeam} first="Team" link={(id) => `/tickets?team=${id}&stage=all`} />
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">By engineer</h2>
      <Table rows={byAgent} first="Engineer" link={(id) => `/tickets?assignee=${id}&stage=all`} />
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">By category</h2>
      <div className="card divide-y divide-slate-100">
        {cats.map(([c, n]) => (
          <div key={c} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span>{c}</span>
            <span className="tabular-nums text-slate-600">{n} <span className="text-slate-400">({Math.round((n / Math.max(1, ts.length)) * 100)}%)</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
