"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, sites, trials, orders, leads, leadNotes, crmStages, quotations, TRIAL_STATUS } from "@/db";
import { requireAdmin, requireUser } from "@/lib/core/auth";
import { guardLead, requireDept } from "@/lib/core/access";
import { fromLocalInput } from "@/lib/core/tz";
import { inr } from "@/lib/core/format";
import { joinTags, orderTag, tagList, RAYBON_STAGES } from "@/lib/crm/meta";

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
async function sales() { const me = await requireUser(); requireDept(me, "crm"); return me; }
const note = (leadId: number, authorId: number, body: string) => db.insert(leadNotes).values({ leadId, authorId, kind: "event", body });

// ---------- sites (customer plants we sell into) ----------
export async function saveSite(customerId: number, id: number | null, fd: FormData) {
  await sales();
  const name = s(fd.get("name"));
  if (!name) return;
  const v = { name: name.slice(0, 120), city: s(fd.get("city")), industry: s(fd.get("industry")), applications: s(fd.get("applications")), capacity: s(fd.get("capacity")), notes: s(fd.get("notes")) };
  if (id) await db.update(sites).set(v).where(and(eq(sites.id, id), eq(sites.customerId, customerId)));
  else await db.insert(sites).values({ ...v, customerId });
  revalidatePath(`/customers/${customerId}`);
}
export async function deleteSite(customerId: number, id: number) {
  await sales();
  await db.delete(sites).where(and(eq(sites.id, id), eq(sites.customerId, customerId)));
  revalidatePath(`/customers/${customerId}`);
}

// ---------- trials / technical evaluation ----------
const trialSchema = z.object({
  kind: z.string().trim().min(2).max(60),
  product: z.preprocess(s, z.string().max(150).nullable()),
  status: z.enum(TRIAL_STATUS).default("planned"),
  startAt: z.preprocess((v) => (typeof v === "string" && v ? fromLocalInput(v) : null), z.date().nullable()),
  endAt: z.preprocess((v) => (typeof v === "string" && v ? fromLocalInput(v) : null), z.date().nullable()),
  result: z.preprocess(s, z.string().max(4000).nullable()),
});
export async function saveTrial(leadId: number, id: number | null, _p: { ok?: number; error?: string } | undefined, fd: FormData) {
  const me = await sales();
  await guardLead(me, leadId);
  const r = trialSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: "Pick the kind of trial." };
  const d = r.data;
  if ((d.status === "success" || d.status === "failed") && !d.endAt) d.endAt = new Date();
  if (id) {
    const old = await db.query.trials.findFirst({ where: and(eq(trials.id, id), eq(trials.leadId, leadId)) });
    if (!old) return { error: "Not found" };
    await db.update(trials).set(d).where(eq(trials.id, id));
    if (old.status !== d.status) await note(leadId, me.id, `${d.kind}${d.product ? ` (${d.product})` : ""}: ${old.status} → ${d.status}${d.result ? ` — ${d.result.slice(0, 200)}` : ""}`);
  } else {
    await db.insert(trials).values({ ...d, leadId, createdById: me.id });
    await note(leadId, me.id, `${d.kind}${d.product ? ` (${d.product})` : ""} — ${d.status}`);
  }
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
  revalidatePath(`/crm/${leadId}`);
  return { ok: Date.now() };
}
export async function deleteTrial(leadId: number, id: number) {
  const me = await sales();
  await guardLead(me, leadId);
  await db.delete(trials).where(and(eq(trials.id, id), eq(trials.leadId, leadId)));
  revalidatePath(`/crm/${leadId}`);
}

// ---------- orders: "Won" records the PO ----------
export async function recordOrder(leadId: number, fd: FormData) {
  const me = await sales();
  await guardLead(me, leadId);
  const l = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!l) return;
  const now = new Date();
  const poDate = (s(fd.get("poDate")) && fromLocalInput(String(fd.get("poDate")))) || now;
  const value = Number(String(fd.get("value") ?? "").replace(/[₹,\s]/g, "")) || l.expectedRevenue;
  const lastQuote = await db.query.quotations.findFirst({ where: eq(quotations.leadId, leadId), orderBy: (q, { desc }) => desc(q.date) });
  await db.insert(orders).values({ leadId, customerId: l.customerId, quotationId: lastQuote?.id ?? null, poNumber: s(fd.get("poNumber")), poDate, value, segment: l.segment, ownerId: l.ownerId, notes: s(fd.get("notes")), createdById: me.id });
  if (lastQuote && lastQuote.status !== "accepted") await db.update(quotations).set({ status: "accepted" }).where(eq(quotations.id, lastQuote.id));
  if (l.status !== "won") {
    const tags = joinTags([...tagList(l.tags).filter((t) => !/^OR FY/i.test(t)), orderTag(poDate)]);
    await db.update(leads).set({ status: "won", probability: 100, closedAt: now, tags, expectedRevenue: value, updatedAt: now }).where(eq(leads.id, leadId));
    await note(leadId, me.id, `🎉 Marked as WON — order${s(fd.get("poNumber")) ? ` ${s(fd.get("poNumber"))}` : ""} ${inr(value)}, ${Math.max(0, Math.floor((+now - +l.createdAt) / 864e5))} days from creation`);
  } else await note(leadId, me.id, `Order recorded${s(fd.get("poNumber")) ? ` ${s(fd.get("poNumber"))}` : ""} — ${inr(value)}`);
  revalidatePath(`/crm/${leadId}`); revalidatePath("/crm"); if (l.customerId) revalidatePath(`/customers/${l.customerId}`);
}
export async function deleteOrder(leadId: number, id: number) {
  const me = await sales();
  await guardLead(me, leadId);
  await db.delete(orders).where(and(eq(orders.id, id), eq(orders.leadId, leadId)));
  revalidatePath(`/crm/${leadId}`);
}

// ---------- pipeline stages (Settings) ----------
const COLORS = ["sky", "indigo", "violet", "amber", "red", "emerald", "slate"];
export async function saveStage(id: number | null, fd: FormData) {
  await requireAdmin();
  const name = s(fd.get("name"));
  if (!name) return;
  const probability = Math.max(0, Math.min(100, Number(fd.get("probability")) || 0));
  const color = COLORS.includes(String(fd.get("color"))) ? String(fd.get("color")) : "slate";
  if (id) await db.update(crmStages).set({ name, probability, color }).where(eq(crmStages.id, id));
  else {
    const [m] = await db.select({ m: sql<number>`coalesce(max(${crmStages.sequence}),0)` }).from(crmStages);
    await db.insert(crmStages).values({ name, probability, color, sequence: Number(m?.m ?? 0) + 1 });
  }
  revalidatePath("/settings"); revalidatePath("/crm");
}
export async function moveStage(id: number, dir: -1 | 1) {
  await requireAdmin();
  const all = await db.select().from(crmStages).orderBy(asc(crmStages.sequence), asc(crmStages.id));
  const i = all.findIndex((x) => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j]!, all[i]!];
  for (const [k, st] of all.entries()) await db.update(crmStages).set({ sequence: k + 1 }).where(eq(crmStages.id, st.id));
  revalidatePath("/settings"); revalidatePath("/crm");
}
/** remove a stage; its opportunities move to another stage first */
export async function deleteStage(id: number, fd: FormData) {
  await requireAdmin();
  const to = Number(fd.get("moveTo"));
  const [n] = await db.select({ n: sql<number>`count(*)` }).from(leads).where(eq(leads.stageId, id));
  if (Number(n?.n) > 0) {
    if (!to || to === id) return;
    await db.update(leads).set({ stageId: to }).where(eq(leads.stageId, id));
  }
  await db.delete(crmStages).where(eq(crmStages.id, id));
  revalidatePath("/settings"); revalidatePath("/crm");
}
/** add the suggested industrial-sales stages that aren't there yet */
export async function addRaybonStages() {
  await requireAdmin();
  const have = new Set((await db.select({ n: crmStages.name }).from(crmStages)).map((x) => x.n.toLowerCase()));
  const [m] = await db.select({ m: sql<number>`coalesce(max(${crmStages.sequence}),0)` }).from(crmStages);
  let seq = Number(m?.m ?? 0);
  for (const st of RAYBON_STAGES) if (!have.has(st.name.toLowerCase())) await db.insert(crmStages).values({ ...st, sequence: ++seq });
  revalidatePath("/settings"); revalidatePath("/crm");
}

