"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, tasks, users, TASK_STATUS } from "@/db";
import { requireUser, type CurrentUser } from "@/lib/core/auth";
import { taskScope } from "@/lib/workspace/tasks";
import { guardLead, guardTicket } from "@/lib/core/access";
import { sendMail, appUrl } from "@/lib/core/mail";
import { fromLocalInput } from "@/lib/core/tz";
import { fmtDate } from "@/lib/core/format";

const optInt = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().nullable());
const schema = z.object({
  title: z.string().trim().min(2, "What's the task?").max(200),
  notes: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable()),
  assigneeId: optInt,
  dueAt: z.preprocess((v) => (typeof v === "string" && v ? fromLocalInput(v) : null), z.date().nullable()),
  priority: z.coerce.number().int().min(0).max(3).default(1),
  leadId: optInt,
  ticketId: optInt,
  customerId: optInt,
});

const refresh = (t?: { leadId: number | null; ticketId: number | null }) => {
  revalidatePath("/tasks");
  revalidatePath("/");
  if (t?.leadId) revalidatePath(`/crm/${t.leadId}`);
  if (t?.ticketId) revalidatePath(`/tickets/${t.ticketId}`);
};

async function guardTask(me: CurrentUser, id: number) {
  const r = await db.select().from(tasks).where(and(eq(tasks.id, id), taskScope(me))).limit(1);
  if (!r[0]) throw new Error("You can't change this task.");
  return r[0];
}

async function notifyAssignee(taskId: number, me: CurrentUser) {
  const t = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId), with: { assignee: true } });
  if (!t?.assignee || t.assignee.id === me.id) return;
  await sendMail({
    to: t.assignee.email,
    subject: `New task from ${me.name}: ${t.title}`,
    text: `${me.name} assigned you a task.\n\n${t.title}${t.notes ? `\n\n${t.notes}` : ""}${t.dueAt ? `\n\nDue: ${fmtDate(t.dueAt)}` : ""}\n\nOpen: ${appUrl()}/tasks?open=${t.id}`,
  });
}

export async function createTask(_p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  const r = schema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]!.message };
  const d = r.data;
  if (d.leadId) await guardLead(me, d.leadId);
  if (d.ticketId) await guardTicket(me, d.ticketId);
  const [t] = await db.insert(tasks).values({ ...d, assigneeId: d.assigneeId ?? me.id, createdById: me.id }).returning();
  await notifyAssignee(t!.id, me);
  refresh(t);
  return { ok: true };
}

export async function updateTask(id: number, fd: FormData) {
  const me = await requireUser();
  const old = await guardTask(me, id);
  const d = schema.partial().parse(Object.fromEntries(fd));
  await db.update(tasks).set(d).where(eq(tasks.id, id));
  if (d.assigneeId && d.assigneeId !== old.assigneeId) await notifyAssignee(id, me);
  refresh(old);
}

export async function moveTask(id: number, status: (typeof TASK_STATUS)[number]) {
  const me = await requireUser();
  const old = await guardTask(me, id);
  if (!TASK_STATUS.includes(status)) return;
  await db.update(tasks).set({ status, doneAt: status === "done" ? new Date() : null }).where(eq(tasks.id, id));
  // tell whoever assigned it when it's finished
  if (status === "done" && old.createdById && old.createdById !== me.id) {
    const by = await db.query.users.findFirst({ where: eq(users.id, old.createdById) });
    if (by) await sendMail({ to: by.email, subject: `Done: ${old.title}`, text: `${me.name} marked the task "${old.title}" as done.\n\n${appUrl()}/tasks?open=${id}` });
  }
  refresh(old);
}

export async function deleteTask(id: number) {
  const me = await requireUser();
  const old = await guardTask(me, id);
  await db.delete(tasks).where(eq(tasks.id, id));
  refresh(old);
}
