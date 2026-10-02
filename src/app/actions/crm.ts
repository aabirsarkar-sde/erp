"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull, like } from "drizzle-orm";
import { z } from "zod";
import { db, leads, leadNotes, activities, crmStages, customers, contacts, users, leadMembers, documents, tagDefs, diaryEntries, ACTIVITY_TYPES, PROPOSAL_STATUS, TAG_GROUPS } from "@/db";
import { saveFile, MAX_UPLOAD } from "@/lib/core/storage";
import { PROPOSAL_META, joinTags, tagList, orderTag, missingContact, TAG_GROUP_COLOR } from "@/lib/crm/meta";
import { atLocal10, localDateKey } from "@/lib/core/tz";
import { requireUser } from "@/lib/core/auth";
import { guardLead, hasCrm, activityScope, leadScope } from "@/lib/core/access";
import { inr } from "@/lib/core/format";
import { fromLocalInput } from "@/lib/core/tz";

const optInt = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().nullable());
const optStr = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable());
const money = z.preprocess((v) => Number(String(v ?? "0").replace(/[₹,\s]/g, "")) || 0, z.number().int().min(0));
const optDate = z.preprocess((v) => (typeof v === "string" && v ? fromLocalInput(v) : null), z.date().nullable());

const refresh = (id?: number) => {
  revalidatePath("/crm");
  if (id) revalidatePath(`/crm/${id}`);
  revalidatePath("/activities");
};

async function log(leadId: number, authorId: number, body: string, kind: "note" | "event" = "event") {
  await db.insert(leadNotes).values({ leadId, authorId, kind, body });
}

const leadSchema = z.object({
  title: z.string().trim().min(2, "Give the opportunity a name"),
  kind: z.enum(["lead", "opportunity"]).optional(),
  product: optStr,
  proposalStatus: z.enum(PROPOSAL_STATUS).optional(),
  customerId: optInt,
  companyName: optStr,
  contactName: optStr,
  email: optStr,
  phone: optStr,
  city: optStr,
  address: optStr,
  capacity: optStr,
  source: optStr,
  expectedRevenue: money,
  probability: z.coerce.number().int().min(0).max(100).optional(),
  priority: z.coerce.number().int().min(0).max(3).default(0),
  tags: optStr,
  description: optStr,
  stageId: z.coerce.number().int().optional(),
  ownerId: optInt,
  expectedCloseAt: optDate,
});

export async function createLead(_p: { error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  if (!hasCrm(me)) return { error: "You don't have CRM access." };
  const r = leadSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]!.message };
  const d = r.data;
  const stage = d.stageId
    ? await db.query.crmStages.findFirst({ where: eq(crmStages.id, d.stageId) })
    : await db.query.crmStages.findFirst({ orderBy: asc(crmStages.sequence) });
  if (!stage) return { error: "Create a pipeline stage first (Settings)." };
  // new prospect → create the customer record straight away so it's reusable
  let customerId = d.customerId;
  if (!customerId && d.companyName) {
    const [c] = await db.insert(customers).values({ name: d.companyName, city: d.city, email: d.email, phone: d.phone }).returning();
    customerId = c!.id;
  }
  // existing customer: fill blank contact fields from the customer record so nobody types them twice
  if (d.customerId && (!d.phone || !d.email || !d.address || !d.contactName)) {
    const c = await db.query.customers.findFirst({ where: eq(customers.id, d.customerId), with: { contacts: true } });
    if (c) Object.assign(d, { phone: d.phone ?? c.contacts[0]?.phone ?? c.phone, email: d.email ?? c.contacts[0]?.email ?? c.email, address: d.address ?? c.address, contactName: d.contactName ?? c.contacts[0]?.name ?? null, city: d.city ?? c.city });
  }
  let contactId: number | null = null;
  if (d.contactName && customerId && !d.customerId) {
    const [c] = await db.insert(contacts).values({ name: d.contactName, email: d.email, phone: d.phone, customerId }).returning();
    contactId = c!.id;
  }
  const [l] = await db
    .insert(leads)
    .values({ ...d, customerId, contactId, stageId: stage.id, probability: d.probability ?? stage.probability, ownerId: d.ownerId ?? me.id, sortOrder: -Date.now() / 1e6 })
    .returning();
  await log(l!.id, me.id, d.kind === "lead" ? "Lead created" : "Opportunity created");
  await syncContactReminder(l!.id);
  refresh();
  redirect(`/crm/${l!.id}`);
}

export async function updateLead(id: number, fd: FormData) {
  const me = await requireUser();
  await guardLead(me, id);
  const d = leadSchema.partial().parse(Object.fromEntries(fd));
  const old = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!old) return;
  const events: string[] = [];
  if (d.expectedRevenue != null && d.expectedRevenue !== old.expectedRevenue) events.push(`Expected revenue: ${inr(old.expectedRevenue)} → ${inr(d.expectedRevenue)}`);
  if (d.proposalStatus && d.proposalStatus !== old.proposalStatus) events.push(`Proposal status: ${PROPOSAL_META[old.proposalStatus].label} → ${PROPOSAL_META[d.proposalStatus].label}`);
  if (d.ownerId !== undefined && d.ownerId !== old.ownerId) {
    const u = d.ownerId ? await db.query.users.findFirst({ where: eq(users.id, d.ownerId) }) : null;
    events.push(`Salesperson: ${u?.name ?? "none"}`);
  }
  await db.update(leads).set({ ...d, updatedAt: new Date() }).where(eq(leads.id, id));
  for (const e of events) await log(id, me.id, e);
  await syncContactReminder(id);
  refresh(id);
}

export async function moveLead(id: number, stageId: number, sortOrder?: number) {
  const me = await requireUser();
  await guardLead(me, id);
  const [old, stage] = await Promise.all([
    db.query.leads.findFirst({ where: eq(leads.id, id), with: { stage: true } }),
    db.query.crmStages.findFirst({ where: eq(crmStages.id, stageId) }),
  ]);
  if (!old || !stage) return;
  await db
    .update(leads)
    .set({ stageId, updatedAt: new Date(), ...(sortOrder != null ? { sortOrder } : {}), ...(old.stageId !== stageId ? { probability: stage.probability } : {}) })
    .where(eq(leads.id, id));
  if (old.stageId !== stageId) await log(id, me.id, `Stage: ${old.stage.name} → ${stage.name}`);
  refresh(id);
}

export async function markWon(id: number) {
  const me = await requireUser();
  await guardLead(me, id);
  const now = new Date();
  const cur = await db.query.leads.findFirst({ where: eq(leads.id, id), columns: { tags: true, createdAt: true } });
  // "order received in FY" label is added automatically
  const tags = joinTags([...tagList(cur?.tags ?? null).filter((t) => !/^OR FY/i.test(t)), orderTag(now)]);
  await db.update(leads).set({ status: "won", probability: 100, closedAt: now, tags, updatedAt: now }).where(eq(leads.id, id));
  await log(id, me.id, `🎉 Marked as WON${cur ? ` — ${Math.max(0, Math.floor((+now - +cur.createdAt) / 864e5))} days from creation` : ""}`);
  refresh(id);
}

export async function markLost(id: number, fd: FormData) {
  const me = await requireUser();
  await guardLead(me, id);
  const reason = String(fd.get("reason") || "Other");
  await db.update(leads).set({ status: "lost", probability: 0, lostReason: reason, closedAt: new Date(), updatedAt: new Date() }).where(eq(leads.id, id));
  await log(id, me.id, `Marked as lost — ${reason}`);
  refresh(id);
}

export async function reopenLead(id: number) {
  const me = await requireUser();
  await guardLead(me, id);
  const l = await db.query.leads.findFirst({ where: eq(leads.id, id), with: { stage: true } });
  await db.update(leads).set({ status: "open", lostReason: null, closedAt: null, probability: l?.stage.probability ?? 10, updatedAt: new Date() }).where(eq(leads.id, id));
  await log(id, me.id, "Reopened");
  refresh(id);
}

export async function addLeadNote(id: number, _p: { ok?: boolean } | undefined, fd: FormData) {
  const me = await requireUser();
  await guardLead(me, id);
  const body = String(fd.get("body") || "").trim();
  if (!body) return { ok: false };
  await log(id, me.id, body, "note");
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, id));
  refresh(id);
  return { ok: true };
}

const actSchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  summary: z.string().trim().min(1, "What's the activity?"),
  note: optStr,
  dueAt: optDate,
  userId: optInt,
  leadId: optInt,
  customerId: optInt,
  outcome: optStr,
  discussion: optStr,
  nextAction: optStr,
  location: optStr,
  contactId: optInt,
  durationMin: optInt,
  done: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function createActivity(_p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  const r = actSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]!.message };
  const { done, ...d } = r.data;
  if (!hasCrm(me) && d.leadId) return { error: "You don't have CRM access." };
  if (d.leadId) await guardLead(me, d.leadId);
  let customerId = d.customerId;
  if (d.leadId && !customerId) customerId = (await db.query.leads.findFirst({ where: eq(leads.id, d.leadId) }))?.customerId ?? null;
  // an entry with just the customer's name goes onto that customer's opportunity when there's only one open
  if (customerId && !d.leadId && hasCrm(me)) {
    const open = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.customerId, customerId), eq(leads.status, "open"), leadScope(me))).limit(2);
    if (open.length === 1) d.leadId = open[0]!.id;
  }
  const when = d.dueAt ?? new Date();
  await db.insert(activities).values({
    ...d,
    customerId,
    userId: d.userId ?? me.id,
    createdById: me.id,
    dueAt: when,
    doneAt: done ? (+when <= Date.now() ? when : new Date()) : null, // work logged for earlier today keeps its time
  });
  if (done) await followUp(me.id, { ...d, customerId }, fd);
  if (d.leadId) {
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, d.leadId));
    if (done) await log(d.leadId, me.id, `Logged ${d.type}: ${d.summary}${d.outcome ? ` — ${d.outcome}` : ""}`);
  }
  refresh(d.leadId ?? undefined);
  revalidatePath("/calendar");
  // back to the calendar on the day the activity was put
  if (fd.get("redirect")) redirect(String(fd.get("redirect")).startsWith("/calendar") ? `/calendar?date=${localDateKey(when)}` : String(fd.get("redirect")));
  return { ok: true };
}

/** "Next action" with a date → schedule the follow-up automatically */
async function followUp(meId: number, a: { leadId?: number | null; customerId?: number | null; contactId?: number | null; userId?: number | null; summary: string; nextAction?: string | null }, fd: FormData) {
  const nextAt = String(fd.get("nextAt") || "");
  if (!nextAt || !a.nextAction) return;
  const type = ACTIVITY_TYPES.includes(fd.get("nextType") as never) ? (fd.get("nextType") as (typeof ACTIVITY_TYPES)[number]) : "call";
  await db.insert(activities).values({ type, summary: a.nextAction, note: `Follow-up from: ${a.summary}`, leadId: a.leadId ?? null, customerId: a.customerId ?? null, contactId: a.contactId ?? null, userId: a.userId ?? meId, createdById: meId, dueAt: fromLocalInput(nextAt) ?? new Date() });
  if (a.leadId) await log(a.leadId, meId, `Follow-up scheduled: ${a.nextAction} (${nextAt.replace("T", " ")})`);
}

/** visit / call report — completes the activity with notes, outcome and next action */
export async function saveActivityReport(id: number, _p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  await guardActivity(me, id);
  const a = await db.query.activities.findFirst({ where: eq(activities.id, id) });
  if (!a) return { error: "Activity not found." };
  const s = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const outcome = s("outcome");
  if (!outcome) return { error: "Write the outcome." };
  const dur = Number(fd.get("durationMin")) || null;
  const wasDone = !!a.doneAt;
  await db.update(activities).set({ discussion: s("discussion"), outcome, nextAction: s("nextAction"), location: s("location") ?? a.location, durationMin: dur ?? a.durationMin, doneAt: a.doneAt ?? new Date() }).where(eq(activities.id, id));
  await followUp(me.id, { ...a, nextAction: s("nextAction") }, fd);
  if (a.leadId) {
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, a.leadId));
    await log(a.leadId, me.id, `${wasDone ? "Updated report" : "Done"} ${a.type}: ${a.summary} — ${outcome}`);
  }
  refresh(a.leadId ?? undefined);
  revalidatePath(`/activities/${id}`);
  revalidatePath("/calendar");
  return { ok: true };
}

export async function completeActivity(id: number, fd: FormData) {
  const me = await requireUser();
  await guardActivity(me, id);
  const outcome = String(fd.get("outcome") || "").trim() || null;
  const a = await db.query.activities.findFirst({ where: eq(activities.id, id) });
  if (!a) return;
  await db.update(activities).set({ doneAt: new Date(), outcome }).where(eq(activities.id, id));
  if (a.leadId) await log(a.leadId, me.id, `Done ${a.type}: ${a.summary}${outcome ? ` — ${outcome}` : ""}`);
  refresh(a.leadId ?? undefined);
}

export async function deleteActivity(id: number) {
  const me = await requireUser();
  await guardActivity(me, id);
  const a = await db.query.activities.findFirst({ where: eq(activities.id, id) });
  await db.delete(activities).where(and(eq(activities.id, id)));
  refresh(a?.leadId ?? undefined);
}

async function guardActivity(me: Awaited<ReturnType<typeof requireUser>>, id: number) {
  const r = await db.select({ id: activities.id }).from(activities).where(and(eq(activities.id, id), activityScope(me))).limit(1);
  if (!r.length) throw new Error("You don't have access to this activity.");
}

export async function addLeadMember(id: number, fd: FormData) {
  const me = await requireUser();
  await guardLead(me, id);
  const userId = Number(fd.get("userId"));
  const role = fd.get("role") === "assigned" ? "assigned" : "follower";
  const u = userId ? await db.query.users.findFirst({ where: eq(users.id, userId) }) : null;
  if (!u) return;
  await db.insert(leadMembers).values({ leadId: id, userId, role }).onConflictDoUpdate({ target: [leadMembers.leadId, leadMembers.userId], set: { role } });
  await log(id, me.id, `${u.name} added as ${role === "assigned" ? "assigned salesperson" : "follower"}`);
  refresh(id);
}

export async function removeLeadMember(id: number, userId: number) {
  const me = await requireUser();
  await guardLead(me, id);
  await db.delete(leadMembers).where(and(eq(leadMembers.leadId, id), eq(leadMembers.userId, userId)));
  refresh(id);
}

export async function convertToOpportunity(id: number) {
  const me = await requireUser();
  await guardLead(me, id);
  await db.update(leads).set({ kind: "opportunity", convertedAt: new Date(), updatedAt: new Date() }).where(eq(leads.id, id));
  await log(id, me.id, "Converted from lead to opportunity");
  refresh(id);
  revalidatePath("/crm/leads");
}

/** proposals & other documents uploaded against an opportunity */
export async function uploadLeadDocs(id: number, _p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  await guardLead(me, id);
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose a file." };
  const big = files.find((f) => f.size > MAX_UPLOAD);
  if (big) return { error: `${big.name} is larger than ${MAX_UPLOAD / 1024 / 1024} MB.` };
  const l = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  const description = String(fd.get("description") ?? "").trim() || null;
  const isProposal = fd.get("isProposal") === "on";
  for (const f of files) {
    const storageKey = await saveFile(f);
    await db.insert(documents).values({ name: f.name, mime: f.type || "application/octet-stream", size: f.size, storageKey, leadId: id, customerId: l?.customerId ?? null, description: isProposal ? `Proposal${description ? ` — ${description}` : ""}` : description, uploadedById: me.id });
    await log(id, me.id, `${isProposal ? "Proposal" : "Document"} uploaded: ${f.name}`);
  }
  if (isProposal && l && ["not_started", "preparing"].includes(l.proposalStatus)) {
    await db.update(leads).set({ proposalStatus: "submitted", updatedAt: new Date() }).where(eq(leads.id, id));
    await log(id, me.id, "Proposal status: Submitted");
  }
  refresh(id);
  return { ok: true };
}

// ---------- labels ----------
export async function setLeadTags(id: number, tags: string[]) {
  const me = await requireUser();
  await guardLead(me, id);
  const clean = joinTags(tags.map((t) => t.replace(/,/g, " ").trim().slice(0, 40)).filter(Boolean));
  const old = await db.query.leads.findFirst({ where: eq(leads.id, id), columns: { tags: true } });
  await db.update(leads).set({ tags: clean, updatedAt: new Date() }).where(eq(leads.id, id));
  const before = new Set(tagList(old?.tags ?? null).map((t) => t.toLowerCase())), after = tagList(clean);
  const added = after.filter((t) => !before.has(t.toLowerCase()));
  const removed = tagList(old?.tags ?? null).filter((t) => !after.some((a) => a.toLowerCase() === t.toLowerCase()));
  if (added.length || removed.length) await log(id, me.id, `Labels: ${[...added.map((t) => `+${t}`), ...removed.map((t) => `−${t}`)].join(", ")}`);
  refresh(id);
}

/** create or update a label definition (group + colour); managers and admins only */
export async function saveTagDef(fd: FormData) {
  const me = await requireUser();
  if (me.role === "agent") return;
  const name = String(fd.get("name") ?? "").replace(/,/g, " ").trim().slice(0, 40);
  if (!name) return;
  const group = (TAG_GROUPS as readonly string[]).includes(String(fd.get("group"))) ? (String(fd.get("group")) as (typeof TAG_GROUPS)[number]) : "Other";
  const color = String(fd.get("color") || TAG_GROUP_COLOR[group] || "slate");
  await db.insert(tagDefs).values({ name, group, color }).onConflictDoUpdate({ target: tagDefs.name, set: { group, color } });
  revalidatePath("/settings");
  revalidatePath("/crm");
}

export async function deleteTagDef(name: string) {
  const me = await requireUser();
  if (me.role === "agent") return;
  await db.delete(tagDefs).where(eq(tagDefs.name, name));
  revalidatePath("/settings");
}

// ---------- missing contact details → automatic reminder ----------
const REMINDER = "Complete contact details";
async function syncContactReminder(leadId: number) {
  const l = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!l) return;
  const missing = l.status === "open" ? missingContact(l) : [];
  const open = await db.query.activities.findFirst({ where: and(eq(activities.leadId, leadId), isNull(activities.doneAt), like(activities.summary, `${REMINDER}%`)) });
  if (missing.length && !open) {
    await db.insert(activities).values({ type: "todo", summary: `${REMINDER}: ${missing.join(", ")}`, leadId, customerId: l.customerId, userId: l.ownerId, createdById: l.ownerId, dueAt: atLocal10(1) });
  } else if (missing.length && open && open.summary !== `${REMINDER}: ${missing.join(", ")}`) {
    await db.update(activities).set({ summary: `${REMINDER}: ${missing.join(", ")}` }).where(eq(activities.id, open.id));
  } else if (!missing.length && open) {
    await db.update(activities).set({ doneAt: new Date(), outcome: "Contact details completed" }).where(eq(activities.id, open.id));
  }
}

// ---------- diary: one note per person per day ----------
export async function saveDiary(day: string, body: string) {
  const me = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const text = body.slice(0, 8000);
  if (!text.trim()) { await db.delete(diaryEntries).where(and(eq(diaryEntries.userId, me.id), eq(diaryEntries.day, day))); return; }
  await db.insert(diaryEntries).values({ userId: me.id, day, body: text }).onConflictDoUpdate({ target: [diaryEntries.userId, diaryEntries.day], set: { body: text, updatedAt: new Date() } });
}
