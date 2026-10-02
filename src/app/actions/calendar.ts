"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, events, eventAttendees, users } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { fromLocalInput } from "@/lib/core/tz";
import { buildIcs } from "@/lib/workspace/ics";
import { sendMail, appUrl } from "@/lib/core/mail";
import { fmtDateTime } from "@/lib/core/format";
import { getOrCreateCalendarToken } from "@/lib/workspace/calendar";

const s = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); return v || null; };
const n = (fd: FormData, k: string) => (Number(fd.get(k)) || null);

async function sendInvites(eventId: number, method: "REQUEST" | "CANCEL", skipUserId?: number) {
  const e = await db.query.events.findFirst({ where: eq(events.id, eventId), with: { owner: true, attendees: { with: { user: true } } } });
  if (!e) return;
  const internal = e.attendees.map((a) => a.user).filter((u) => u.id !== skipUserId);
  const external = (e.externalEmails ?? "").split(",").map((x) => x.trim()).filter((x) => /@/.test(x));
  const people = [...internal.map((u) => ({ name: u.name, email: u.email })), ...external.map((email) => ({ email }))];
  if (!people.length) return;
  const ics = buildIcs(
    [{ uid: e.uid, title: e.title, start: e.startAt, end: e.endAt, allDay: e.allDay, description: e.description, location: e.location, sequence: e.sequence, status: method === "CANCEL" ? "CANCELLED" : "CONFIRMED", organizer: e.owner ? { name: e.owner.name, email: e.owner.email } : null, attendees: people }],
    { method },
  );
  for (const p of people) {
    await sendMail({
      to: p.email,
      subject: `${method === "CANCEL" ? "Cancelled: " : "Invitation: "}${e.title} — ${fmtDateTime(e.startAt)}`,
      text: `${method === "CANCEL" ? "This meeting has been cancelled." : `${e.owner?.name ?? "Raybon"} invited you.`}\n\n${e.title}\nWhen: ${fmtDateTime(e.startAt)} – ${fmtDateTime(e.endAt)}${e.location ? `\nWhere: ${e.location}` : ""}${e.description ? `\n\n${e.description}` : ""}\n\n${appUrl()}/calendar/${e.id}`,
      attachments: [{ filename: "invite.ics", content: Buffer.from(ics), contentType: `text/calendar; charset=utf-8; method=${method}` }],
    });
  }
}

function readEvent(fd: FormData) {
  const allDay = fd.get("allDay") === "on";
  const start = fromLocalInput(String(fd.get("start") ?? ""));
  let end = fromLocalInput(String(fd.get("end") ?? ""));
  if (!start) throw new Error("Pick a start time");
  if (allDay) { start.setTime(fromLocalInput(String(fd.get("start")).slice(0, 10))!.getTime()); end = new Date(+start + 864e5); }
  if (!end || +end <= +start) end = new Date(+start + 60 * 60_000);
  return {
    title: s(fd, "title") ?? "Meeting", description: s(fd, "description"), location: s(fd, "location"), startAt: start, endAt: end, allDay,
    customerId: n(fd, "customerId"), leadId: n(fd, "leadId"), ticketId: n(fd, "ticketId"), externalEmails: s(fd, "externalEmails"),
  };
}
const attendeeIds = (fd: FormData) => fd.getAll("attendees").map(Number).filter(Boolean);

export async function createEvent(_p: { error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  let d;
  try { d = readEvent(fd); } catch (e) { return { error: (e as Error).message }; }
  const [e] = await db.insert(events).values({ ...d, ownerId: me.id, uid: `${randomUUID()}@raybon-erp` }).returning();
  const ids = [...new Set([me.id, ...attendeeIds(fd)])];
  await db.insert(eventAttendees).values(ids.map((userId) => ({ eventId: e!.id, userId })));
  if (fd.get("notify") === "on") await sendInvites(e!.id, "REQUEST", me.id);
  revalidatePath("/calendar");
  redirect(`/calendar?date=${String(fd.get("start")).slice(0, 10)}`);
}

export async function updateEvent(id: number, _p: { error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  const old = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!old) return { error: "Not found" };
  let d;
  try { d = readEvent(fd); } catch (e) { return { error: (e as Error).message }; }
  await db.update(events).set({ ...d, sequence: old.sequence + 1 }).where(eq(events.id, id));
  await db.delete(eventAttendees).where(eq(eventAttendees.eventId, id));
  const ids = [...new Set([old.ownerId ?? me.id, ...attendeeIds(fd)])];
  await db.insert(eventAttendees).values(ids.map((userId) => ({ eventId: id, userId })));
  if (fd.get("notify") === "on") await sendInvites(id, "REQUEST", me.id);
  revalidatePath("/calendar");
  redirect(`/calendar?date=${String(fd.get("start")).slice(0, 10)}`);
}

export async function deleteEvent(id: number, fd: FormData) {
  const me = await requireUser();
  const e = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!e) return;
  if (fd.get("notify") === "on") await sendInvites(id, "CANCEL", me.id);
  await db.delete(events).where(eq(events.id, id));
  revalidatePath("/calendar");
  redirect("/calendar");
}

export async function regenerateCalendarToken() {
  const me = await requireUser();
  await getOrCreateCalendarToken(me.id, true);
  revalidatePath("/calendar");
}
void inArray; void users;
