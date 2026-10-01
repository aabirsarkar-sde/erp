import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { requireDept } from "@/lib/access";
import { lookups } from "@/lib/queries";
import { helpdeskRows, groupBy, summary, type Group } from "@/lib/helpdesk-stats";
import { PageHeader } from "@/components/ui";
import { ParamSelect } from "@/components/url-filters";
import { BarChart } from "@/components/charts";
import { COMPLAINT_TYPES, TYPE_META } from "@/lib/constants";
import { fmtTat } from "@/lib/format";

export const metadata = { title: "Helpdesk dashboard" };
export const dynamic = "force-dynamic";

const VIEWS = [
  ["type", "By type"],
  ["zone", "By zone"],
  ["geo", "By geography"],
  ["employee", "By employee"],
  ["plant", "By plant"],
] as const;
type View = (typeof VIEWS)[number][0];

export default async function HelpdeskDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  requireDept(me, "hd");
  const sp = await searchParams;
  const view: View = (VIEWS.map((v) => v[0]) as string[]).includes(sp.view ?? "") ? (sp.view as View) : "type";
  const [rows, lk] = await Promise.all([helpdeskRows(sp, me), lookups()]);
  const s = summary(rows);
  const byType = groupBy(rows, "type");
  const groups = groupBy(rows, view);
  const top = groups.filter((g) => g.key !== "none")[0];
  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(sp as Record<string, string>), ...extra })}`;
  const period = sp.from || sp.to ? `${sp.from ?? "…"} → ${sp.to ?? "today"}` : sp.days === "all" ? "all time" : `last ${sp.days ?? 90} days`;

  const headline: Record<View, string> = {
    type: top ? `Most complaints are ${top.label} (${top.total}).` : "",
    zone: top ? `${top.label} zone generates the most tickets (${top.total}, ${Math.round((top.total / Math.max(1, s.total)) * 100)}%).` : "",
    geo: top ? `${top.label} has the most tickets (${top.total}).` : "",
    employee: top ? `${top.label} solved the most tickets (${top.closed}${top.avgTat != null ? `, avg TAT ${fmtTat(top.avgTat)}` : ""}).` : "",
    plant: top ? `${top.label} raised the most complaints (${top.total}).` : "",
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Helpdesk dashboard"
        subtitle={`Complaints reported · ${period}`}
        actions={<>
          <a href={`/api/export/helpdesk${qs({ view, format: "xlsx" })}`} className="btn-secondary">Excel</a>
          <a href={`/print/helpdesk${qs({ view })}`} target="_blank" className="btn-secondary">PDF</a>
        </>}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <ParamSelect name="days" fallback="90" options={[["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"], ["all", "All time"]]} />
        <ParamSelect name="zone" options={[["", "All zones"], ...lk.teams.map((t) => [String(t.id), t.location ?? t.name] as [string, string])]} />
        <form className="flex items-center gap-1.5 text-sm">
          {Object.entries(sp).filter(([k]) => !["from", "to"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="date" name="from" defaultValue={sp.from} className="input w-auto py-1.5" aria-label="From" />
          <span className="text-slate-400">→</span>
          <input type="date" name="to" defaultValue={sp.to} className="input w-auto py-1.5" aria-label="To" />
          <button className="btn-secondary py-1.5">Apply</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Total tickets", String(s.total), "/tickets?stage=all"],
          ["Open", String(s.open), "/tickets"],
          ["Done", String(s.closed), "/tickets?stage=resolved"],
          ["Average TAT", fmtTat(s.avgTat), "/tickets?stage=resolved&sort=updated"],
          ["Customer rating", s.csat != null ? `${s.csat.toFixed(1)} / 5` : "—", "/tickets?stage=resolved"],
        ].map(([l, v, h]) => (
          <Link key={l} href={h!} className="card p-4 hover:border-brand-200">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">{v}</div>
          </Link>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Tickets by type</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {COMPLAINT_TYPES.map((t) => {
          const g = byType.find((x) => x.key === t)!;
          return (
            <Link key={t} href={g.href} className="card p-3 hover:border-brand-200">
              <div className="text-lg leading-none">{TYPE_META[t]!.icon}</div>
              <div className="mt-1.5 text-xl font-semibold tabular-nums">{g.total}</div>
              <div className="truncate text-xs text-slate-600">{t}</div>
              <div className="mt-1 text-[11px] text-slate-400">{g.open} open · TAT {fmtTat(g.avgTat)}</div>
            </Link>
          );
        })}
      </div>

      <div className="mb-3 mt-7 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm font-semibold text-slate-600">View:</span>
        {VIEWS.map(([k, l]) => (
          <Link key={k} href={qs({ view: k })} scroll={false} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${view === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{l}</Link>
        ))}
      </div>
      {headline[view] && <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">📌 {headline[view]}</p>}

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="card p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">{view === "employee" ? "Tickets solved per person" : "Tickets"}</h3>
          <BarChart horizontal data={groups.slice(0, 15).map((g) => ({ label: g.label, value: view === "employee" ? g.closed : g.total, href: g.href }))} valueLabel={view === "employee" ? "Solved" : "Tickets"} />
        </section>
        <section className="card overflow-x-auto lg:col-span-3">
          <GroupTable groups={groups} view={view} />
        </section>
      </div>
    </div>
  );
}

function GroupTable({ groups, view }: { groups: Group[]; view: View }) {
  const first = { type: "Type", zone: "Zone", geo: "City / state", employee: "Employee", plant: "Plant" }[view];
  return (
    <table className="w-full min-w-[560px] text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
        <tr>
          <th className="px-4 py-2.5">{first}</th>
          <th className="px-3 py-2.5 text-right">{view === "employee" ? "Solved" : "Total"}</th>
          <th className="px-3 py-2.5 text-right">Open</th>
          {view !== "employee" && <th className="px-3 py-2.5 text-right">Done</th>}
          <th className="px-3 py-2.5 text-right">Avg TAT</th>
          <th className="px-4 py-2.5 text-right">Rating</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 tabular-nums">
        {groups.map((g) => (
          <tr key={g.key} className="hover:bg-slate-50">
            <td className="px-4 py-2.5"><Link href={g.href} className="font-medium hover:text-brand-700">{view === "type" ? `${TYPE_META[g.key]?.icon ?? ""} ` : ""}{g.label}</Link></td>
            <td className="px-3 py-2.5 text-right font-semibold">{view === "employee" ? g.closed : g.total}</td>
            <td className="px-3 py-2.5 text-right">{g.open}</td>
            {view !== "employee" && <td className="px-3 py-2.5 text-right">{g.closed}</td>}
            <td className="px-3 py-2.5 text-right">{fmtTat(g.avgTat)}</td>
            <td className="px-4 py-2.5 text-right">{g.csat != null ? `${g.csat.toFixed(1)}★` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
