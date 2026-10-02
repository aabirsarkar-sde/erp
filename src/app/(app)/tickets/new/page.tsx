import { asc, eq, ne } from "drizzle-orm";
import { db, plants, customers, teams, teamMembers, users } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { requireDept, hdAll } from "@/lib/core/access";
import { lookups } from "@/lib/core/lookups";
import { PageHeader } from "@/components/ui/ui";
import { NewTicketForm } from "@/components/helpdesk/new-ticket-form";
import { aiEnabled } from "@/lib/ai/client";
import { localDateKey } from "@/lib/core/tz";

export const metadata = { title: "New complaint" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ customer?: string; date?: string; plant?: string }> }) {
  const me = await requireUser();
  requireDept(me, "hd");
  const [sp, lk, ps, myZones, hdUsers] = await Promise.all([
    searchParams,
    lookups(),
    db.select({ id: plants.id, plantNo: plants.plantNo, name: plants.name, customerId: plants.customerId, customerName: customers.name, teamId: plants.teamId, zone: teams.location, city: plants.city, state: plants.state })
      .from(plants).leftJoin(customers, eq(customers.id, plants.customerId)).leftJoin(teams, eq(teams.id, plants.teamId)).where(eq(plants.active, true)).orderBy(asc(plants.plantNo)),
    db.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, me.id)),
    db.select({ id: users.id, name: users.name }).from(users).where(ne(users.hdAccess, "none")).orderBy(asc(users.name)),
  ]);
  const all = hdAll(me);
  const zoneIds = new Set(myZones.map((z) => z.id));
  const zones = all ? lk.teams : lk.teams.filter((t) => zoneIds.has(t.id));
  const plantList = all ? ps : ps.filter((p) => p.teamId != null && zoneIds.has(p.teamId));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : localDateKey(new Date());
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New complaint" subtitle="Zone → site / plant → category → priority → assignee → description" />
      <NewTicketForm teams={zones} users={hdUsers} customers={lk.customers} plants={plantList} defaultDate={date} defaultPlant={sp.plant ? Number(sp.plant) : undefined} defaultCustomer={sp.customer ? Number(sp.customer) : undefined} ai={aiEnabled()} />
    </div>
  );
}
