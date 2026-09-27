"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { fromLocalInput, localDateKey } from "@/lib/tz";
import { z } from "zod";
import { db, tickets, messages, teams, users, contacts, attachments, plants, ticketWatchers, STAGES } from "@/db";
import { requireUser } from "@/lib/auth";
import { PRIORITIES, STAGE_META } from "@/lib/constants";
import { saveFile, MAX_UPLOAD } from "@/lib/storage";
import { getSla } from "@/lib/sla";
import { notifyAssigned, emailReplyToCustomer, notifyNewTicket, autoWatchers, notifyClosed, notifyTransfer, emailTicket } from "@/lib/notify";
import { fmtTat } from "@/lib/format";

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
  reportedAt: z.string().min(8, "Pick the complaint date"),
  plantId: optInt,
  customerId: optInt,
  teamId: optInt,
  category: z.string().min(1, "Choose the type of complaint"),
  description: z.string().trim().min(5, "Write the narration — what exactly is the problem?"),
  complainantName: z.string().trim().min(2, "Who is making the complaint?"),
  complainantPhone: optStr,
  complainantEmail: optStr,
  subject: optStr,
  assigneeId: optInt,
  priority: z.coerce.number().int().min(0).max(3),
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
  const plant = d.plantId ? await db.query.plants.findFirst({ where: eq(plants.id, d.plantId) }) : null;
  const customerId = plant?.customerId ?? d.customerId;
  const teamId = plant?.teamId ?? d.teamId;
  if (!plant && !customerId) return { error: "Select the plant (or the customer if the plant isn't listed)." };
  if (!teamId) return { error: "This plant has no zone yet — pick a support team." };
  const contactId = await upsertContact(d.complainantName, d.complainantPhone, d.complainantEmail, customerId ?? null);
  const sla = await getSla();
  // today → now; a past date → 9:00 that day (so TAT isn't inflated from midnight)
  const picked = d.reportedAt.slice(0, 10);
  const reportedAt = picked === localDateKey(new Date()) ? new Date() : fromLocalInput(`${picked}T09:00`) ?? new Date();
  const subject = d.subject || `${d.category} — ${plant ? `${plant.plantNo} ${plant.name}` : "complaint"}`;
  const [t] = await db
    .insert(tickets)
    .values({
      subject,
      description: d.description,
      category: d.category,
      teamId,
      assigneeId: d.assigneeId,
      customerId: customerId ?? null,
      contactId,
      plantId: plant?.id ?? null,
      complainantName: d.complainantName,
      complainantPhone: d.complainantPhone,
      complainantEmail: d.complainantEmail,
      reportedAt,
      priority: d.priority,
      site: d.site ?? plant?.name ?? null,
      tags: d.tags,
      dueAt: d.dueAt ? new Date(d.dueAt) : new Date(Date.now() + sla.resolution[d.priority]! * 3600e3),
      createdById: me.id,
      source: "internal",
    })
    .returning();
  const [ev] = await db.insert(messages).values({ ticketId: t!.id, authorId: me.id, kind: "event", body: `Complaint logged by ${me.name} for ${d.complainantName}` }).returning();
  if (files.length) await storeFiles(files, t!.id, ev!.id, me.id);
  if (d.complainantEmail) await db.insert(ticketWatchers).values({ ticketId: t!.id, email: d.complainantEmail.toLowerCase(), name: d.complainantName }).onConflictDoNothing();
  await autoWatchers(t!.id);
  if (d.assigneeId) await notifyAssigned(t!.id, d.assigneeId, me.id);
  await notifyNewTicket(t!.id);
  revalidatePath("/", "layout");
  redirect(`/tickets/${t!.id}`);
}

async function upsertContact(name: string, phone: string | null, email: string | null, customerId: number | null) {
  const e = email?.toLowerCase() ?? null;
  const found = e
    ? await db.query.contacts.findFirst({ where: eq(contacts.email, e) })
    : customerId ? await db.query.contacts.findFirst({ where: and(eq(contacts.name, name), eq(contacts.customerId, customerId)) }) : null;
  if (found) {
    if ((phone && !found.phone) || (customerId && !found.customerId)) await db.update(contacts).set({ phone: found.phone ?? phone, customerId: found.customerId ?? customerId }).where(eq(contacts.id, found.id));
    return found.id;
  }
  const [c] = await db.insert(contacts).values({ name, phone, email: e, customerId }).returning();
  return c!.id;
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
  const isDone = (s?: string | null) => s === "resolved" || s === "closed";
  const resolving = patch.stage && isDone(patch.stage);
  const newlyClosed = resolving && !isDone(old.stage);
  const resolvedAt = resolving ? old.resolvedAt ?? new Date() : patch.stage ? null : old.resolvedAt;
  const tat = resolvedAt ? Math.round((+resolvedAt - +(old.reportedAt ?? old.createdAt)) / 60000) : null;
  await db
    .update(tickets)
    .set({
      ...patch, updatedAt: new Date(), resolvedAt, tatMinutes: tat,
      ...(newlyClosed ? { closedById: meId, csatToken: old.csatToken ?? crypto.randomUUID().replace(/-/g, "") } : {}),
      ...(patch.stage && !resolving ? { closedById: null } : {}),
    })
    .where(eq(tickets.id, id));
  if (newlyClosed) events.push(`Closed — TAT ${fmtTat(tat)}`);
  if (patch.stage && !resolving && isDone(old.stage)) events.push("Reopened — TAT cleared");
  if (events.length) await db.insert(messages).values(events.map((body) => ({ ticketId: id, authorId: meId, kind: "event" as const, body })));
  if (newAssignee) await notifyAssigned(id, newAssignee, meId);
  if (newlyClosed) await notifyClosed(id);
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


export async function transferTicket(id: number, _p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  const toId = Number(fd.get("toUserId"));
  const reason = String(fd.get("reason") ?? "").trim() || null;
  const t = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
  const to = toId ? await db.query.users.findFirst({ where: eq(users.id, toId) }) : null;
  if (!t || !to) return { error: "Pick who to transfer to." };
  if (t.assigneeId === toId) return { error: `${to.name} already has this ticket.` };
  const from = t.assigneeId ? await db.query.users.findFirst({ where: eq(users.id, t.assigneeId) }) : null;
  await db.update(tickets).set({ assigneeId: toId, updatedAt: new Date() }).where(eq(tickets.id, id));
  await db.insert(messages).values({ ticketId: id, authorId: me.id, kind: "event", body: `Transferred ${from ? `from ${from.name} ` : ""}to ${to.name}${reason ? ` — ${reason}` : ""}` });
  await notifyTransfer(id, t.assigneeId, toId, me.name, reason);
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
  return { ok: true };
}

export async function emailTicketAction(id: number, _p: { ok?: boolean; error?: string; info?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  const to = String(fd.get("to") ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (!to.length) return { error: "Enter at least one valid email address." };
  const note = String(fd.get("note") ?? "").trim() || null;
  const r = await emailTicket(id, to, note, me.name);
  await db.insert(messages).values({ ticketId: id, authorId: me.id, kind: "reply", body: `📧 Ticket emailed${note ? `: ${note}` : ""}`, emailedTo: to.join(", ") });
  if (fd.get("follow") === "on") await db.insert(ticketWatchers).values(to.map((email) => ({ ticketId: id, email }))).onConflictDoNothing();
  revalidatePath(`/tickets/${id}`);
  return { ok: true, info: `Sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}.` };
}

export async function addWatcher(id: number, fd: FormData) {
  await requireUser();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  await db.insert(ticketWatchers).values({ ticketId: id, email, name: String(fd.get("name") ?? "").trim() || null }).onConflictDoNothing();
  revalidatePath(`/tickets/${id}`);
}

export async function removeWatcher(id: number, email: string) {
  await requireUser();
  await db.delete(ticketWatchers).where(and(eq(ticketWatchers.ticketId, id), eq(ticketWatchers.email, email)));
  revalidatePath(`/tickets/${id}`);
}

/** Close with an optional closing note and customer sign-off (signature drawn on screen) */
export async function resolveTicket(id: number, _p: { ok?: boolean; error?: string } | undefined, fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireUser();
  const note = String(fd.get("note") ?? "").trim();
  const signedBy = String(fd.get("signedBy") ?? "").trim() || null;
  const sig = String(fd.get("signature") ?? "");
  let signatureKey: string | null = null;
  if (sig.startsWith("data:image/png;base64,")) {
    const buf = Buffer.from(sig.slice(22), "base64");
    if (buf.length > 200) signatureKey = await saveFile(new File([buf], `signature-${id}.png`, { type: "image/png" }));
  }
  if (note) await db.insert(messages).values({ ticketId: id, authorId: me.id, kind: "note", body: `Resolution: ${note}` });
  if (signatureKey) {
    await db.update(tickets).set({ signatureKey, signedBy }).where(eq(tickets.id, id));
    await db.insert(messages).values({ ticketId: id, authorId: me.id, kind: "event", body: `Customer sign-off${signedBy ? ` by ${signedBy}` : ""}` });
  }
  await applyChanges(id, me.id, { stage: "resolved" });
  return { ok: true };
}
