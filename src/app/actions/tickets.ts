"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tickets, messages, teams, users, contacts, attachments, STAGES } from "@/db";
import { requireUser } from "@/lib/auth";
import { PRIORITIES, STAGE_META } from "@/lib/constants";
import { saveFile, MAX_UPLOAD } from "@/lib/storage";
import { getSla } from "@/lib/sla";
import { notifyAssigned, emailReplyToCustomer } from "@/lib/notify";

const optInt = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().nullable());
const optStr = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable());

function filesFrom(fd: FormData) {
  return fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
}

async function storeFiles(files: File[], ticketId: number, messageId: number | null, userId: number) {
  const out = [];
  for (const f of files) {
    const storageKey = await saveFile(f);
    const [a] = await db
      .insert(attachments)
      .values({ ticketId, messageId, name: f.name, mime: f.type || "application/octet-stream", size: f.size, storageKey, uploadedById: userId })
      .returning();
    out.push(a!);
  }
  return out;
}

function checkFiles(files: File[]) {
  const big = files.find((f) => f.size > MAX_UPLOAD);
  return big ? `${big.name} is larger than ${MAX_UPLOAD / 1024 / 1024} MB.` : null;
}

const createSchema = z.object({
  subject: z.string().trim().min(3, "Subject is too short"),
  description: optStr,
  teamId: z.coerce.number({ message: "Pick a team" }).int().positive("Pick a team"),
  assigneeId: optInt,
  customerId: optInt,
  contactName: optStr,
  contactPhone: optStr,
  contactEmail: optStr,
  priority: z.coerce.number().int().min(0).max(3),
  category: optStr,
  site: optStr,
  tags: optStr,
  dueAt: optStr,
});

export async function createTicket(_prev: { error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  const raw = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "files"));
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const files = filesFrom(fd);
  const fileErr = checkFiles(files);
  if (fileErr) return { error: fileErr };
  const d = parsed.data;
  let contactId: number | null = null;
  if (d.contactName || d.contactEmail) {
    const [c] = await db.insert(contacts).values({ name: d.contactName || d.contactEmail!, phone: d.contactPhone, email: d.contactEmail, customerId: d.customerId }).returning();
    contactId = c!.id;
  }
  const sla = await getSla();
  const [t] = await db
    .insert(tickets)
    .values({
      subject: d.subject,
      description: d.description,
      teamId: d.teamId,
      assigneeId: d.assigneeId,
      customerId: d.customerId,
      contactId,
      priority: d.priority,
      category: d.category,
      site: d.site,
      tags: d.tags,
      dueAt: d.dueAt ? new Date(d.dueAt) : new Date(Date.now() + sla.resolution[d.priority]! * 3600e3),
      createdById: me.id,
    })
    .returning();
  const [ev] = await db.insert(messages).values({ ticketId: t!.id, authorId: me.id, kind: "event", body: "Ticket created" }).returning();
  if (files.length) await storeFiles(files, t!.id, ev!.id, me.id);
  if (d.assigneeId) await notifyAssigned(t!.id, d.assigneeId, me.id);
  revalidatePath("/", "layout");
  redirect(`/tickets/${t!.id}`);
}

const updateSchema = z.object({
  stage: z.enum(STAGES),
  priority: z.coerce.number().int().min(0).max(3),
  teamId: z.coerce.number().int(),
  assigneeId: optInt,
  customerId: optInt,
  category: optStr,
  site: optStr,
  tags: optStr,
  dueAt: optStr,
});

export async function updateTicket(id: number, fd: FormData) {
  const me = await requireUser();
  const d = updateSchema.parse(Object.fromEntries(fd));
  await applyChanges(id, me.id, { ...d, dueAt: d.dueAt ? new Date(d.dueAt) : null });
}

async function applyChanges(id: number, meId: number, patch: Partial<typeof tickets.$inferInsert>) {
  const old = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
  if (!old) throw new Error("Ticket not found");
  const events: string[] = [];
  if (patch.stage && patch.stage !== old.stage) events.push(`Stage: ${STAGE_META[old.stage].label} → ${STAGE_META[patch.stage].label}`);
  if (patch.priority != null && patch.priority !== old.priority) events.push(`Priority: ${PRIORITIES[old.priority]!.label} → ${PRIORITIES[patch.priority]!.label}`);
  const newAssignee = patch.assigneeId !== undefined && patch.assigneeId !== old.assigneeId ? patch.assigneeId : undefined;
  if (newAssignee !== undefined) {
    const u = newAssignee ? await db.query.users.findFirst({ where: eq(users.id, newAssignee) }) : null;
    events.push(u ? `Assigned to ${u.name}` : "Unassigned");
  }
  if (patch.teamId && patch.teamId !== old.teamId) {
    const t = await db.query.teams.findFirst({ where: eq(teams.id, patch.teamId) });
    events.push(`Moved to ${t?.name}`);
  }
  const resolving = patch.stage && (patch.stage === "resolved" || patch.stage === "closed");
  await db
    .update(tickets)
    .set({ ...patch, updatedAt: new Date(), resolvedAt: resolving ? old.resolvedAt ?? new Date() : patch.stage ? null : old.resolvedAt })
    .where(eq(tickets.id, id));
  if (events.length) await db.insert(messages).values(events.map((body) => ({ ticketId: id, authorId: meId, kind: "event" as const, body })));
  if (newAssignee) await notifyAssigned(id, newAssignee, meId);
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function assignToMe(id: number) {
  const me = await requireUser();
  const t = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
  await applyChanges(id, me.id, { assigneeId: me.id, ...(t?.stage === "new" ? { stage: "in_progress" as const } : {}) });
}

export async function setStage(id: number, stage: (typeof STAGES)[number]) {
  const me = await requireUser();
  await applyChanges(id, me.id, { stage });
}

export async function addMessage(id: number, _prev: { ok?: boolean; error?: string; info?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  const body = String(fd.get("body") || "").trim();
  const kind = fd.get("kind") === "reply" ? "reply" : "note";
  const files = filesFrom(fd);
  if (!body && !files.length) return { error: "Write something or attach a file." };
  const fileErr = checkFiles(files);
  if (fileErr) return { error: fileErr };
  const [m] = await db.insert(messages).values({ ticketId: id, authorId: me.id, kind, body: body || "(attachment)" }).returning();
  const saved = files.length ? await storeFiles(files, id, m!.id, me.id) : [];
  let info: string | undefined;
  if (kind === "reply") {
    const to = await emailReplyToCustomer(id, body, me.name, saved);
    if (to) await db.update(messages).set({ emailedTo: to }).where(eq(messages.id, m!.id));
    info = to ? `Emailed to ${to}` : "No customer email on file — reply logged only.";
  }
  const t = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
  const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
  if (kind === "reply" && !t?.firstResponseAt) patch.firstResponseAt = new Date();
  if (kind === "reply" && t?.stage === "new") patch.stage = "in_progress";
  await db.update(tickets).set(patch).where(eq(tickets.id, id));
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/");
  return { ok: true, info };
}
