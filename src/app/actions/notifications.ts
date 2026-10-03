"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, notifications, activities, leads, users, ACTIVITY_TYPES } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { guardLead, requireDept } from "@/lib/core/access";
import { notify } from "@/lib/workspace/notify";
import { sendMail, appUrl } from "@/lib/core/mail";
import { atLocal10, fromLocalInput, localDateKey } from "@/lib/core/tz";
import { ACTIVITY_META } from "@/lib/crm/meta";

const done = () => { revalidatePath("/notifications"); revalidatePath("/", "layout"); };

export async function markRead(id: number) {
  const me = await requireUser();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, me.id), isNull(notifications.readAt)));
  done();
}

export async function markAllRead() {
  const me = await requireUser();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
  done();
}

const reminderSchema = z.object({
  userId: z.coerce.number().int().positive(),
  message: z.string().trim().min(3, "Write the reminder").max(300),
  type: z.enum(ACTIVITY_TYPES).default("call"),
  date: z.string().optional(),
});

/** "Please call this party" — puts a planned activity in their calendar and a reminder in their bell */
export async function sendReminder(leadId: number, _p: { ok?: string; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  requireDept(me, "crm");
  await guardLead(me, leadId);
  const r = reminderSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]!.message };
  const { userId, message, type, date } = r.data;
  const [lead, to] = await Promise.all([db.query.leads.findFirst({ where: eq(leads.id, leadId) }), db.query.users.findFirst({ where: eq(users.id, userId) })]);
  if (!lead || !to?.active) return { error: "Pick someone to remind." };
  const dueAt = (date && fromLocalInput(`${date}T10:00`)) || atLocal10(0);
  const [a] = await db.insert(activities).values({ type, summary: message, note: `Reminder from ${me.name}`, leadId, customerId: lead.customerId, userId, createdById: me.id, dueAt }).returning();
  if (to.id !== me.id) {
    await notify({ userId: to.id, kind: "reminder", fromUserId: me.id, title: `${me.name}: ${message}`, body: `${lead.title} · ${ACTIVITY_META[type].label} planned for ${localDateKey(dueAt)}`, href: `/activities/${a!.id}`, leadId });
    await sendMail({ to: to.email, subject: `Reminder from ${me.name}: ${message}`, text: `${me.name} asked you to: ${message}\n\nOpportunity: ${lead.title}\nPlanned for: ${localDateKey(dueAt)}\n\nOpen: ${appUrl()}/activities/${a!.id}` });
  }
  revalidatePath(`/crm/${leadId}`); revalidatePath("/calendar"); done();
  return { ok: to.id === me.id ? "Added to your calendar." : `Reminder sent to ${to.name} — it's in their calendar too.` };
}
