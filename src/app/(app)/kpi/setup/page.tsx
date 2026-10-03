import { and, asc, eq, ne } from "drizzle-orm";
import { db, kpiDefs, kpiTargets, users } from "@/db";
import { requireAdmin } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { PERIOD_LABEL, metricMeta } from "@/lib/crm/kpi-meta";
import { PageHeader, LinkButton } from "@/components/ui/ui";
import { KpiDefForm, KpiDefRow, KpiTargetInput } from "@/components/crm/kpi";
import { inrShort } from "@/lib/core/format";

export const metadata = { title: "Set KPI & KRA targets" };

export default async function KpiSetupPage() {
  const me = await requireAdmin();
  requireDept(me, "crm");
  const [defs, overrides, team] = await Promise.all([
    db.select().from(kpiDefs).orderBy(asc(kpiDefs.period), asc(kpiDefs.kind), asc(kpiDefs.sortOrder), asc(kpiDefs.id)),
    db.select().from(kpiTargets),
    db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(eq(users.active, true), ne(users.crmAccess, "none"))).orderBy(asc(users.name)),
  ]);
  const ov = new Map(overrides.map((o) => [`${o.kpiId}:${o.userId}`, o.target]));
  const active = defs.filter((d) => d.active);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Set KPI & KRA targets" subtitle="Define what each salesperson should achieve per day, week and month" actions={<LinkButton href="/kpi" variant="secondary">View scoreboard</LinkButton>} />

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Add a KPI or KRA</h2>
        <p className="mb-3 text-xs text-slate-500">KPI = activity you track (calls, visits). KRA = result area (orders, value won). Pick &quot;typed in by hand&quot; for anything the CRM can&apos;t count — you enter the achieved figure on the scoreboard.</p>
        <KpiDefForm />
      </section>

      {(["daily", "weekly", "monthly"] as const).map((p) => {
        const list = defs.filter((d) => d.period === p);
        if (!list.length) return null;
        return (
          <section key={p} className="card px-4 py-2">
            <h2 className="pt-2 text-sm font-semibold">{PERIOD_LABEL[p]}</h2>
            <div className="divide-y divide-slate-100">{list.map((d) => <KpiDefRow key={`${d.id}-${d.target}-${d.name}-${d.metric}-${d.active}`} def={d} />)}</div>
          </section>
        );
      })}

      {active.length > 0 && (
        <section className="card overflow-x-auto">
          <div className="px-4 pt-4">
            <h2 className="text-sm font-semibold">Targets per person</h2>
            <p className="text-xs text-slate-500">Leave a box empty to use the default target. Type 0 if the KPI doesn&apos;t apply to that person. Admins appear on the scoreboard only when given a target here.</p>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-4 py-2 font-medium">Person</th>{active.map((d) => <th key={d.id} className="px-2 py-2 text-right font-medium">{d.name}<div className="font-normal text-slate-400">{PERIOD_LABEL[d.period]}</div></th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {team.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium">{u.name}{u.role === "admin" && <span className="ml-1 text-[11px] font-normal text-slate-400">admin</span>}</td>
                  {active.map((d) => (
                    <td key={d.id} className="px-2 py-1.5 text-right">
                      <KpiTargetInput kpiId={d.id} userId={u.id} value={ov.get(`${d.id}:${u.id}`) ?? null} placeholder={metricMeta(d.metric).unit === "inr" ? inrShort(d.target) : String(d.target)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
