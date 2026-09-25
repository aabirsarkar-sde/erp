"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, activities, leads, leadNotes, quotations, ACTIVITY_TYPES } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiErrorMessage } from "@/lib/ai";
import * as F from "@/lib/ai-features";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
async function wrap<T>(fn: () => Promise<T>): Promise<R<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) { console.error("[ai]", e); return { ok: false, error: aiErrorMessage(e) }; }
}

export async function aiTriage(input: { subject: string; description?: string; customer?: string; city?: string }) {
  const me = await requireUser();
  if (!input.subject?.trim()) return { ok: false, error: "Write a subject first." } as const;
  return wrap(() => F.triageTicket(input, me.id));
}
export async function aiSummarizeTicket(id: number) {
  const me = await requireUser();
  return wrap(() => F.summarizeTicket(id, me.id));
}
export async function aiDraftReply(id: number, instruction?: string) {
  const me = await requireUser();
  return wrap(() => F.draftTicketReply(id, me.id, me.name, instruction));
}
export async function aiLeadBrief(id: number) {
  const me = await requireUser();
  return wrap(() => F.leadBrief(id, me.id));
}
export async function aiFollowUp(id: number, purpose?: string) {
  const me = await requireUser();
  return wrap(() => F.draftFollowUp(id, me.id, me.name, purpose));
}
export async function aiParseNotes(notes: string, leadId?: number | null) {
  const me = await requireUser();
  if (notes.trim().length < 5) return { ok: false, error: "Write a few words about what happened." } as const;
  return wrap(() => F.parseCallNotes(notes, me.id, leadId));
}
export async function aiScope(request: string, quotationId: number) {
  const me = await requireUser();
  if (request.trim().length < 3) return { ok: false, error: "Describe what to quote." } as const;
  const q = await db.query.quotations.findFirst({ where: eq(quotations.id, quotationId), with: { lead: true, customer: true } });
  const ctx = q ? `Customer: ${q.customer?.name ?? "—"}. ${q.lead ? `Opportunity: ${q.lead.title}, capacity ${q.lead.capacity ?? "—"}.` : ""}` : undefined;
  return wrap(() => F.writeScope(request, me.id, ctx));
}

const act = z.object({ type: z.enum(ACTIVITY_TYPES), summary: z.string().min(1), dueInDays: z.number().int().min(0).max(365) });

export async function scheduleSuggested(leadId: number | null, customerId: number | null, a: z.infer<typeof act>) {
  const me = await requireUser();
  const d = act.parse(a);
  const due = new Date(); due.setDate(due.getDate() + d.dueInDays); due.setHours(10, 0, 0, 0);
  await db.insert(activities).values({ type: d.type, summary: d.summary, leadId, customerId, userId: me.id, createdById: me.id, dueAt: due });
  if (leadId) revalidatePath(`/crm/${leadId}`);
  revalidatePath("/activities");
  return { ok: true };
}

export async function saveParsedLog(leadId: number | null, customerId: number | null, p: z.infer<typeof F.callLogSchema>, rawNotes: string) {
  const me = await requireUser();
  const d = F.callLogSchema.parse(p);
  let cust = customerId;
  if (leadId && !cust) cust = (await db.query.leads.findFirst({ where: eq(leads.id, leadId) }))?.customerId ?? null;
  await db.insert(activities).values({ type: d.type, summary: d.summary, outcome: d.outcome, note: rawNotes.slice(0, 2000), leadId, customerId: cust, userId: me.id, createdById: me.id, dueAt: new Date(), doneAt: new Date() });
  if (d.nextActivity) {
    const due = new Date(); due.setDate(due.getDate() + d.nextActivity.dueInDays); due.setHours(10, 0, 0, 0);
    await db.insert(activities).values({ type: d.nextActivity.type, summary: d.nextActivity.summary, leadId, customerId: cust, userId: me.id, createdById: me.id, dueAt: due });
  }
  if (leadId) {
    const patch: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
    const events = [`Logged ${d.type}: ${d.summary} — ${d.outcome}`];
    if (d.updates.expectedRevenue != null && d.updates.expectedRevenue > 0) { patch.expectedRevenue = Math.round(d.updates.expectedRevenue); events.push(`Expected revenue updated from call notes`); }
    if (d.updates.probability != null) { patch.probability = d.updates.probability; events.push(`Probability set to ${d.updates.probability}% from call notes`); }
    await db.update(leads).set(patch).where(eq(leads.id, leadId));
    await db.insert(leadNotes).values(events.map((body) => ({ leadId, authorId: me.id, kind: "event" as const, body })));
    revalidatePath(`/crm/${leadId}`);
    revalidatePath("/crm");
  }
  revalidatePath("/activities");
  return { ok: true };
}

export async function aiAsk(history: { role: "user" | "assistant"; content: string }[]) {
  const me = await requireUser();
  const clean = history.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  const { askAssistant } = await import("@/lib/ai-ask");
  return wrap(() => askAssistant(clean, { id: me.id, name: me.name, role: me.role }));
}
