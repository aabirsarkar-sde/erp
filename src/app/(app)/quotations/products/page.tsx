import { asc } from "drizzle-orm";
import { db, products } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { saveProduct, toggleProduct } from "@/app/actions/quotations";
import { PageHeader } from "@/components/ui/ui";

export const metadata = { title: "Products" };

function Row({ p }: { p?: typeof products.$inferSelect }) {
  return (
    <form action={saveProduct.bind(null, p?.id ?? null)} className={`grid gap-2 px-4 py-3 sm:grid-cols-12 sm:items-start ${p && !p.active ? "opacity-50" : ""}`}>
      <div className="space-y-1.5 sm:col-span-5">
        <input name="name" required defaultValue={p?.name} placeholder="Product / service name" className="input py-1.5 font-medium" />
        <input name="description" defaultValue={p?.description ?? ""} placeholder="Description (printed on quotation)" className="input py-1.5 text-xs" />
      </div>
      <input name="unit" defaultValue={p?.unit ?? "Nos"} placeholder="Unit" className="input py-1.5 sm:col-span-1" />
      <input name="price" defaultValue={p?.price ?? ""} inputMode="decimal" placeholder="Rate ₹" className="input py-1.5 text-right tabular-nums sm:col-span-2" />
      <input name="taxRate" defaultValue={p?.taxRate ?? 18} inputMode="decimal" title="GST %" className="input py-1.5 text-right sm:col-span-1" />
      <input name="hsn" defaultValue={p?.hsn ?? ""} placeholder="HSN/SAC" className="input py-1.5 sm:col-span-1" />
      <div className="flex gap-1 sm:col-span-2">
        <button className={p ? "btn-secondary py-1.5" : "btn-primary py-1.5"}>{p ? "Save" : "Add"}</button>
        {p && <button formAction={toggleProduct.bind(null, p.id, !p.active)} className="btn-ghost py-1.5 text-xs">{p.active ? "Archive" : "Restore"}</button>}
      </div>
    </form>
  );
}

export default async function ProductsPage() {
  await requireUser();
  const rows = await db.select().from(products).orderBy(asc(products.name));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Products & services" subtitle="Used to fill quotation lines quickly." />
      <div className="card divide-y divide-slate-100">
        <div className="hidden grid-cols-12 gap-2 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 sm:grid">
          <span className="col-span-5">Name / description</span><span>Unit</span><span className="col-span-2 text-right">Rate</span><span className="text-right">GST %</span><span>HSN</span>
        </div>
        {rows.map((p) => <Row key={p.id} p={p} />)}
        <div className="bg-brand-50/30"><Row /></div>
      </div>
    </div>
  );
}
