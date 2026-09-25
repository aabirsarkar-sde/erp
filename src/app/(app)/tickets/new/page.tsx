import { requireUser } from "@/lib/auth";
import { lookups } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { NewTicketForm } from "@/components/new-ticket-form";
import { aiEnabled } from "@/lib/ai";

export const metadata = { title: "New ticket" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  await requireUser();
  const [{ customer }, lk] = await Promise.all([searchParams, lookups()]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New ticket" subtitle="Log a complaint, breakdown or service request." />
      <NewTicketForm teams={lk.teams} users={lk.users} customers={lk.customers} defaultCustomer={customer ? Number(customer) : undefined} ai={aiEnabled()} />
    </div>
  );
}
