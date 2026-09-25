import { requireUser } from "@/lib/auth";
import { lookups } from "@/lib/queries";
import { getStages } from "@/lib/crm-queries";
import { PageHeader } from "@/components/ui";
import { NewLeadForm } from "@/components/lead-form";

export const metadata = { title: "New opportunity" };

export default async function NewLead({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const me = await requireUser();
  const [{ customer }, lk, stages] = await Promise.all([searchParams, lookups(), getStages()]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New opportunity" />
      <NewLeadForm customers={lk.customers} users={lk.users} stages={stages} meId={me.id} defaultCustomer={customer ? Number(customer) : undefined} />
    </div>
  );
}
