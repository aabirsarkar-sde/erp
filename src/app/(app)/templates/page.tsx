import Link from "next/link";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { db, templates, documents, users } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { PageHeader } from "@/components/ui/ui";
import { TemplateForm, TemplateCard, CollateralUpload, CollateralActions } from "@/components/crm/templates";
import { collateralLabel } from "@/lib/crm/templates-meta";
import { fmtDate, fmtSize } from "@/lib/core/format";

export const metadata = { title: "Templates & collateral" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const { tab: t } = await searchParams;
  const tab = t === "email" || t === "collateral" ? t : "whatsapp";
  const [tpls, docs] = await Promise.all([
    db.select().from(templates).orderBy(asc(templates.category), asc(templates.name)),
    db.select({ id: documents.id, name: documents.name, description: documents.description, category: documents.category, size: documents.size, createdAt: documents.createdAt, uploadedById: documents.uploadedById, by: users.name })
      .from(documents).leftJoin(users, eq(users.id, documents.uploadedById)).where(isNotNull(documents.category)).orderBy(asc(documents.category), desc(documents.createdAt)),
  ]);
  const manager = me.role === "admin" || me.crmAccess === "all";
  const tabs = [["whatsapp", `WhatsApp (${tpls.filter((x) => x.kind === "whatsapp").length})`], ["email", `Email (${tpls.filter((x) => x.kind === "email").length})`], ["collateral", `Case studies & brochures (${docs.length})`]] as const;
  const list = tpls.filter((x) => x.kind === tab);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Templates & collateral" subtitle="Ready-made WhatsApp messages, emailers, case studies and brochures — send any of them from an opportunity" />
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {tabs.map(([k, l]) => <Link key={k} href={`/templates?tab=${k}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</Link>)}
      </div>
      {tab === "collateral" ? (
        <>
          <div className="card mb-4 p-4"><h2 className="mb-2 text-sm font-semibold">Upload</h2><CollateralUpload /></div>
          {docs.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No case studies or brochures yet.</p> : (
            <ul className="card divide-y divide-slate-100">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{collateralLabel(d.category)}</span>
                  <span className="min-w-0 flex-1"><a href={`/api/docs/${d.id}?view`} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">{d.name}</a><span className="block truncate text-xs text-slate-500">{d.description ? `${d.description} · ` : ""}{fmtSize(d.size)} · {d.by ?? "—"} · {fmtDate(d.createdAt)}</span></span>
                  <CollateralActions id={d.id} canDelete={me.role === "admin" || d.uploadedById === me.id} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="card mb-4 p-4"><h2 className="mb-2 text-sm font-semibold">New {tab === "whatsapp" ? "WhatsApp" : "email"} template</h2><TemplateForm kind={tab} /></div>
          {list.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No templates yet.</p> : (
            <div className="grid gap-3 md:grid-cols-2">{list.map((x) => <TemplateCard key={`${x.id}-${+x.updatedAt}`} t={x} canEdit={manager || x.createdById === me.id} />)}</div>
          )}
        </>
      )}
    </div>
  );
}
