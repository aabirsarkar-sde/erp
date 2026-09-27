import { requireUser } from "@/lib/auth";
import { lookups } from "@/lib/queries";
import { createEvent } from "@/app/actions/calendar";
import { EventForm } from "@/components/event-form";
import { PageHeader } from "@/components/ui";
import { fromLocalInput, toLocalInput } from "@/lib/tz";

export const metadata = { title: "New event" };

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ start?: string; lead?: string; customer?: string; title?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const lk = await lookups();
  let start = sp.start ? fromLocalInput(sp.start) : null;
  if (!start) { start = new Date(Math.ceil(Date.now() / 3600e3) * 3600e3); }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New event" />
      <EventForm action={createEvent} users={lk.users} customers={lk.customers} meId={me.id} submitLabel="Create event"
        initial={{ title: sp.title ?? "", description: null, location: null, start: toLocalInput(start), end: toLocalInput(new Date(+start + 3600e3)), allDay: false, attendees: [], externalEmails: null, customerId: sp.customer ? Number(sp.customer) : null, leadId: sp.lead ? Number(sp.lead) : null }} />
    </div>
  );
}
