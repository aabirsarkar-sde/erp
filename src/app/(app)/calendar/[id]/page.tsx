import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, events } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { lookups } from "@/lib/core/lookups";
import { updateEvent, deleteEvent } from "@/app/actions/calendar";
import { EventForm } from "@/components/workspace/event-form";
import { IconBack } from "@/components/ui/icons";
import { toLocalInput, localDateKey } from "@/lib/core/tz";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  const [e, lk] = await Promise.all([db.query.events.findFirst({ where: eq(events.id, id), with: { attendees: true, owner: { columns: { name: true } }, lead: { columns: { id: true, title: true } } } }), lookups()]);
  if (!e) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/calendar?date=${localDateKey(e.startAt)}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><IconBack className="size-4" />Calendar</Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{e.title}</h1>
          <p className="text-sm text-slate-500">Organised by {e.owner?.name ?? "—"}{e.lead && <> · <Link href={`/crm/${e.lead.id}`} className="text-brand-700 hover:underline">{e.lead.title}</Link></>}</p>
        </div>
        <form action={deleteEvent.bind(null, e.id)} className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" name="notify" defaultChecked className="accent-brand-600" /> notify</label>
          <button className="btn-ghost text-red-600">Delete</button>
        </form>
      </div>
      <EventForm action={updateEvent.bind(null, e.id)} users={lk.users} customers={lk.customers} meId={me.id} submitLabel="Save changes"
        initial={{ title: e.title, description: e.description, location: e.location, start: toLocalInput(e.startAt), end: toLocalInput(e.endAt), allDay: e.allDay, attendees: e.attendees.map((a) => a.userId), externalEmails: e.externalEmails, customerId: e.customerId, leadId: e.leadId }} />
    </div>
  );
}
