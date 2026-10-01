import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { requireDept } from "@/lib/access";
import { listLeads } from "@/lib/crm-queries";
import { lookups } from "@/lib/queries";
import { convertToOpportunity } from "@/app/actions/crm";
import { ActivityDot } from "@/components/pipeline-board";
import { SearchBox, ParamSelect } from "@/components/url-filters";
import { PageHeader, LinkButton, Empty, Avatar } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { LEAD_SOURCES } from "@/lib/crm";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const [rows, lk] = await Promise.all([listLeads({ ...sp, kind: "lead", owner: sp.owner ?? (me.crmAccess === "all" ? "all" : "me") }, me), lookups()]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Leads" subtitle="New enquiries not yet qualified — convert them to opportunities once there's a real requirement"
        actions={<><LinkButton href="/crm" variant="secondary">Opportunities</LinkButton><LinkButton href="/crm/new?kind=lead"><IconPlus className="size-4" />New lead</LinkButton></>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox placeholder="Search lead, company, contact…" />
        <ParamSelect name="owner" fallback={me.crmAccess === "all" ? "all" : "me"} options={[["me", "My leads"], ["all", "Everyone"], ...lk.users.map((u) => [String(u.id), u.name] as [string, string])]} />
        <ParamSelect name="source" options={[["", "All sources"], ...LEAD_SOURCES.map((s) => [s, s] as [string, string])]} />
        <ParamSelect name="status" fallback="open" options={[["open", "Open"], ["lost", "Dropped"], ["all", "All"]]} />
      </div>
      {rows.length === 0 ? <Empty title="No leads" hint="Log every enquiry here — phone, website, exhibition, referral." action={<LinkButton href="/crm/new?kind=lead">New lead</LinkButton>} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2.5">Lead</th><th className="px-3 py-2.5">Company / contact</th><th className="px-3 py-2.5">Source</th><th className="px-3 py-2.5">Received</th><th className="px-3 py-2.5">Salesperson</th><th className="px-3 py-2.5">Next</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Link href={`/crm/${r.id}`} className="font-medium hover:text-brand-700">{r.title}</Link>{r.product && <div className="text-xs text-slate-500">{r.product}</div>}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.customerName ?? "—"}{r.contactName && <div className="text-xs text-slate-400">{r.contactName}{r.city ? ` · ${r.city}` : ""}</div>}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.source ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-2.5"><span className="flex items-center gap-2"><Avatar name={r.ownerName} size="sm" /><span className="truncate text-slate-600">{r.ownerName ?? "—"}</span></span></td>
                  <td className="px-3 py-2.5"><ActivityDot ts={r.nextActivity ? Number(r.nextActivity) : null} /></td>
                  <td className="px-4 py-2.5 text-right">{r.status === "open" && <form action={convertToOpportunity.bind(null, r.id)}><button className="whitespace-nowrap rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">→ Opportunity</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
