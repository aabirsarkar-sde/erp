import { asc } from "drizzle-orm";
import { db, contacts, leads } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { leadScope, requireDept } from "@/lib/core/access";
import { lookups } from "@/lib/core/lookups";
import { ActivityPlanner } from "@/components/crm/activity-planner";
import { PageHeader } from "@/components/ui/ui";
import { fromLocalInput, toLocalInput } from "@/lib/core/tz";

export const metadata = { title: "New activity" };

export default async function NewActivity({ searchParams }: { searchParams: Promise<{ start?: string; lead?: string; customer?: string; type?: string; done?: string }> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const [lk, cs, ls] = await Promise.all([
    lookups(),
    db.select({ id: contacts.id, name: contacts.name, customerId: contacts.customerId }).from(contacts).orderBy(asc(contacts.name)),
    db.select({ id: leads.id, title: leads.title, customerId: leads.customerId }).from(leads).where(leadScope(me)).orderBy(asc(leads.title)),
  ]);
  const start = (sp.start && fromLocalInput(sp.start)) || new Date(Math.ceil(Date.now() / 3600e3) * 3600e3);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={sp.done ? "Log a visit / call" : "New activity"} subtitle="Shows on the calendar and in the client & opportunity history" />
      <ActivityPlanner users={lk.users} customers={lk.customers} contacts={cs} leads={ls} meId={me.id} start={toLocalInput(start)}
        initial={{ leadId: sp.lead ? Number(sp.lead) : null, customerId: sp.customer ? Number(sp.customer) : null, type: sp.type, done: !!sp.done }} />
    </div>
  );
}
