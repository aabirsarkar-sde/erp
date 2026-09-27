import { asc, eq } from "drizzle-orm";
import { db, plants, customers, teams } from "@/db";
import { requireUser } from "@/lib/auth";
import { lookups } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { NewTicketForm } from "@/components/new-ticket-form";
import { aiEnabled } from "@/lib/ai";
import { localDateKey } from "@/lib/tz";

export const metadata = { title: "New complaint" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ customer?: string; date?: string; plant?: string }> }) {
  await requireUser();
  const [sp, lk, ps] = await Promise.all([
    searchParams,
    lookups(),
    db.select({ id: plants.id, plantNo: plants.plantNo, name: plants.name, customerId: plants.customerId, customerName: customers.name, teamId: plants.teamId, zone: teams.location, city: plants.city, state: plants.state })
      .from(plants).leftJoin(customers, eq(customers.id, plants.customerId)).leftJoin(teams, eq(teams.id, plants.teamId)).where(eq(plants.active, true)).orderBy(asc(plants.plantNo)),
  ]);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : localDateKey(new Date());
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New complaint" subtitle="Standard complaint form — date, plant, type, narration and who reported it." />
      <NewTicketForm teams={lk.teams} users={lk.users} customers={lk.customers} plants={ps} defaultDate={date} defaultPlant={sp.plant ? Number(sp.plant) : undefined} defaultCustomer={sp.customer ? Number(sp.customer) : undefined} ai={aiEnabled()} />
    </div>
  );
}
