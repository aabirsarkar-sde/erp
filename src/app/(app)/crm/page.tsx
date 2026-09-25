import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listLeads, getStages, wonThisMonth } from "@/lib/crm-queries";
import { lookups } from "@/lib/queries";
import { PipelineBoard, Stars, ActivityDot } from "@/components/pipeline-board";
import { tagList } from "@/lib/crm";
import { SearchBox, ParamSelect, ParamToggle } from "@/components/url-filters";
import { PageHeader, LinkButton, Empty, Avatar } from "@/components/ui";
import { IconPlus, IconList, IconBoard } from "@/components/icons";
import { inr, inrShort } from "@/lib/format";
import { stageColor } from "@/lib/crm";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [rows, stages, lk, won] = await Promise.all([listLeads({ ...sp, owner: sp.owner ?? "me" }, me.id), getStages(), lookups(), wonThisMonth(sp.owner === "all" ? undefined : me.id)]);
  const open = rows.filter((r) => r.status === "open");
  const total = open.reduce((a, r) => a + r.expectedRevenue, 0);
  const weighted = open.reduce((a, r) => a + (r.expectedRevenue * r.probability) / 100, 0);
  const list = sp.view === "list" || (sp.status && sp.status !== "open");

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader title="Pipeline" subtitle={`${rows.length} opportunit${rows.length === 1 ? "y" : "ies"}`} actions={<LinkButton href="/crm/new"><IconPlus className="size-4" />New opportunity</LinkButton>} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Open pipeline", inrShort(total), `${open.length} deals`],
          ["Weighted forecast", inrShort(weighted), "by probability"],
          ["Won this month", inrShort(won.v), `${won.n} deal${won.n === 1 ? "" : "s"}`],
          ["Avg deal size", inrShort(open.filter((r) => r.expectedRevenue).length ? total / open.filter((r) => r.expectedRevenue).length : 0), "open deals with value"],
        ].map(([l, v, h]) => (
          <div key={l} className="card p-4">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{v}</div>
            <div className="text-[11px] text-slate-400">{h}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox placeholder="Search opportunity, customer, contact, tag…" />
        <ParamSelect name="owner" fallback="me" options={[["me", "My pipeline"], ["all", "Everyone"], ...lk.users.map((u) => [String(u.id), u.name] as [string, string])]} />
        <ParamSelect name="status" fallback="open" options={[["open", "Open"], ["won", "Won"], ["lost", "Lost"], ["all", "All"]]} />
        <ParamToggle name="view" fallback="board" options={[["board", <IconBoard key="b" className="size-4" />, "Board"], ["list", <IconList key="l" className="size-4" />, "List"]]} />
      </div>

      {rows.length === 0 ? (
        <Empty title="No opportunities here" hint={sp.owner ? "Try another filter." : "Switch to “Everyone” to see the whole team's pipeline."} action={<LinkButton href="/crm/new">New opportunity</LinkButton>} />
      ) : list ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2.5">Opportunity</th><th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Stage</th><th className="px-3 py-2.5 text-right">Expected</th><th className="px-3 py-2.5 text-right">Prob.</th><th className="px-3 py-2.5">Salesperson</th><th className="px-4 py-2.5">Next</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const st = stages.find((s) => s.id === r.stageId);
                return (
                  <tr key={r.id} className="relative hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/crm/${r.id}`} className="font-medium after:absolute after:inset-0 hover:text-brand-700">{r.title}</Link>
                      <div className="mt-0.5 flex items-center gap-2"><Stars n={r.priority} size="text-xs" />{tagList(r.tags).slice(0, 3).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-600">{t}</span>)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{r.customerName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {r.status === "open" ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stageColor(st?.color ?? "slate").soft}`}>{st?.name}</span>
                        : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${r.status === "won" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.status}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.expectedRevenue ? inr(r.expectedRevenue) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.probability}%</td>
                    <td className="px-3 py-2.5"><span className="flex items-center gap-2"><Avatar name={r.ownerName} size="sm" /><span className="truncate text-slate-600">{r.ownerName ?? "—"}</span></span></td>
                    <td className="px-4 py-2.5"><ActivityDot ts={r.nextActivity} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold">
              <tr><td className="px-4 py-2.5" colSpan={3}>Total</td><td className="px-3 py-2.5 text-right tabular-nums">{inr(rows.reduce((a, r) => a + r.expectedRevenue, 0))}</td><td colSpan={3} /></tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <PipelineBoard stages={stages} cards={rows.map((r) => ({ ...r, nextActivity: r.nextActivity ? Number(r.nextActivity) : null }))} />
      )}
    </div>
  );
}
