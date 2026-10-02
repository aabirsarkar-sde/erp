import Link from "next/link";
import { asc, eq, like, or } from "drizzle-orm";
import { db, plants, customers } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { lookups } from "@/lib/core/lookups";
import { PageHeader } from "@/components/ui/ui";
import { SearchBox } from "@/components/ui/url-filters";
import { PlantRow } from "@/components/helpdesk/plant-row";
import { CopyField } from "@/components/ui/copy-field";
import { appUrl } from "@/lib/core/mail";

export const metadata = { title: "Plants" };

export default async function PlantsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser();
  requireDept(me, "hd");
  const { q } = await searchParams;
  const [rows, lk] = await Promise.all([
    db.select().from(plants).leftJoin(customers, eq(customers.id, plants.customerId)).where(q ? or(like(plants.plantNo, `%${q}%`), like(plants.name, `%${q}%`), like(customers.name, `%${q}%`), like(plants.city, `%${q}%`)) : undefined).orderBy(asc(plants.plantNo)),
    lookups(),
  ]);
  const canEdit = me.role !== "agent";
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Plants" subtitle="Every customer plant with its number and zone. Complaints are logged against a plant." actions={<Link href="/settings/import" className="btn-secondary">Import list</Link>} />
      <div className="card mb-4 space-y-1.5 p-4 text-sm">
        <div className="font-medium">Customer complaint link</div>
        <p className="text-xs text-slate-500">Share with customers (WhatsApp, email signature, sticker/QR on the plant). They pick the complaint type, describe it, and it lands here as a ticket. Add <code>?plant=PLT-001</code> to pre-fill a plant.</p>
        <CopyField value={`${appUrl()}/complaint`} />
      </div>
      <div className="mb-4"><SearchBox placeholder="Search plant no., name, customer, city…" /></div>
      <div className="card divide-y divide-slate-100">
        <div className="hidden grid-cols-12 gap-2 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 md:grid">
          <span>Plant no.</span><span className="col-span-3">Name</span><span className="col-span-2">Customer</span><span className="col-span-2">Zone</span><span>City</span><span>State</span><span>Capacity</span><span>Tickets</span>
        </div>
        {canEdit && <div className="bg-brand-50/30"><PlantRow customers={lk.customers} teams={lk.teams} canEdit /></div>}
        {rows.map(({ plants: p }) => (
          <div key={p.id} className="relative">
            <PlantRow p={p} customers={lk.customers} teams={lk.teams} canEdit={canEdit} />
          </div>
        ))}
      </div>
    </div>
  );
}
