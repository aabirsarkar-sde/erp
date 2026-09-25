"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, leads, leadNotes, activities, crmStages, customers, contacts, users, ACTIVITY_TYPES } from "@/db";
import { requireUser } from "@/lib/auth";
import { inr } from "@/lib/format";

const optInt = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().nullable());
const optStr = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable());
const money = z.preprocess((v) => Number(String(v ?? "0").replace(/[₹,\s]/g, "")) || 0, z.number().int().min(0));
const optDate = z.preprocess((v) => (typeof v === "string" && v ? new Date(v) : null), z.date().nullable());

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
  customerId: optInt,
  companyName: optStr,
  contactName: optStr,
  email: optStr,
  phone: optStr,
  city: optStr,
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
  let contactId: number | null = null;
  if (d.contactName && customerId) {
    const [c] = await db.insert(contacts).values({ name: d.contactName, email: d.email, phone: d.phone, customerId }).returning();
    contactId = c!.id;
  }
  const [l] = await db
    .insert(leads)
    .values({ ...d, customerId, contactId, stageId: stage.id, probability: d.probability ?? stage.probability, ownerId: d.ownerId ?? me.id, sortOrder: -Date.now() / 1e6 })
    .returning();
  await log(l!.id, me.id, "Opportunity created");
  refresh();
  redirect(`/crm/${l!.id}`);
}

export async function updateLead(id: number, fd: FormData) {
  const me = await requireUser();
  const d = leadSchema.partial().parse(Object.fromEntries(fd));
  const old = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!old) return;
  const events: string[] = [];
  if (d.expectedRevenue != null && d.expectedRevenue !== old.expectedRevenue) events.push(`Expected revenue: ${inr(old.expectedRevenue)} → ${inr(d.expectedRevenue)}`);
  if (d.ownerId !== undefined && d.ownerId !== old.ownerId) {
    const u = d.ownerId ? await db.query.users.findFirst({ where: eq(users.id, d.ownerId) }) : null;
    events.push(`Salesperson: ${u?.name ?? "none"}`);
  }
  await db.update(leads).set({ ...d, updatedAt: new Date() }).where(eq(leads.id, id));
  for (const e of events) await log(id, me.id, e);
  refresh(id);
}

export async function moveLead(id: number, stageId: number, sortOrder?: number) {
  const me = await requireUser();
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
  await db.update(leads).set({ status: "won", probability: 100, closedAt: new Date(), updatedAt: new Date() }).where(eq(leads.id, id));
  await log(id, me.id, "🎉 Marked as WON");
  refresh(id);
}

export async function markLost(id: number, fd: FormData) {
  const me = await requireUser();
  const reason = String(fd.get("reason") || "Other");
  await db.update(leads).set({ status: "lost", probability: 0, lostReason: reason, closedAt: new Date(), updatedAt: new Date() }).where(eq(leads.id, id));
  await log(id, me.id, `Marked as lost — ${reason}`);
  refresh(id);
}

export async function reopenLead(id: number) {
  const me = await requireUser();
  const l = await db.query.leads.findFirst({ where: eq(leads.id, id), with: { stage: true } });
  await db.update(leads).set({ status: "open", lostReason: null, closedAt: null, probability: l?.stage.probability ?? 10, updatedAt: new Date() }).where(eq(leads.id, id));
  await log(id, me.id, "Reopened");
  refresh(id);
}

export async function addLeadNote(id: number, _p: { ok?: boolean } | undefined, fd: FormData) {
  const me = await requireUser();
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
  done: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function createActivity(_p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  const r = actSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]!.message };
  const { done, ...d } = r.data;
  let customerId = d.customerId;
  if (d.leadId && !customerId) customerId = (await db.query.leads.findFirst({ where: eq(leads.id, d.leadId) }))?.customerId ?? null;
  await db.insert(activities).values({
    ...d,
    customerId,
    userId: d.userId ?? me.id,
    createdById: me.id,
    dueAt: d.dueAt ?? new Date(),
    doneAt: done ? new Date() : null,
  });
  if (d.leadId) {
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, d.leadId));
    if (done) await log(d.leadId, me.id, `Logged ${d.type}: ${d.summary}${d.outcome ? ` — ${d.outcome}` : ""}`);
  }
  refresh(d.leadId ?? undefined);
  return { ok: true };
}

export async function completeActivity(id: number, fd: FormData) {
  const me = await requireUser();
  const outcome = String(fd.get("outcome") || "").trim() || null;
  const a = await db.query.activities.findFirst({ where: eq(activities.id, id) });
  if (!a) return;
  await db.update(activities).set({ doneAt: new Date(), outcome }).where(eq(activities.id, id));
  if (a.leadId) await log(a.leadId, me.id, `Done ${a.type}: ${a.summary}${outcome ? ` — ${outcome}` : ""}`);
  refresh(a.leadId ?? undefined);
}

export async function deleteActivity(id: number) {
  await requireUser();
  const a = await db.query.activities.findFirst({ where: eq(activities.id, id) });
  await db.delete(activities).where(and(eq(activities.id, id)));
  refresh(a?.leadId ?? undefined);
}
