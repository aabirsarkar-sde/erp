import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db, products } from "@/db";
import { requireDept } from "@/lib/access";
import { lookups } from "@/lib/queries";
import { getStages } from "@/lib/crm-queries";
import { PageHeader } from "@/components/ui";
import { NewLeadForm } from "@/components/lead-form";

export const metadata = { title: "New opportunity" };

export default async function NewLead({ searchParams }: { searchParams: Promise<{ customer?: string; kind?: string }> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const [{ customer, kind }, lk, stages, prods] = await Promise.all([searchParams, lookups(), getStages(), db.select({ name: products.name }).from(products).where(eq(products.active, true))]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={kind === "lead" ? "New lead" : "New opportunity"} />
      <NewLeadForm customers={lk.customers} users={lk.users} stages={stages} meId={me.id} defaultCustomer={customer ? Number(customer) : undefined} products={prods.map((p) => p.name)} defaultKind={kind === "lead" ? "lead" : "opportunity"} />
    </div>
  );
}
