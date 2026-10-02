"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { db, quotations, quotationLines, leads, leadNotes, products, QUOTE_STATUS } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { quoteTotals } from "@/lib/crm/quote-math";
import { DEFAULT_TERMS } from "@/lib/crm/quote-terms";
import { saveCompany, type Company } from "@/lib/core/company";
import { guardLead, canSeeQuotation, hasCrm } from "@/lib/core/access";
async function guardQuote(id: number) { const me = await requireUser(); if (!(await canSeeQuotation(me, id))) throw new Error("No access to this quotation."); return me; }
import { requireAdmin } from "@/lib/core/auth";

async function nextNumber() {
  const rows = await db.select({ n: quotations.number }).from(quotations).where(like(quotations.number, "S%"));
  const max = rows.reduce((m, r) => Math.max(m, Number(r.n.replace(/\D/g, "")) || 0), 0);
  return `S${String(max + 1).padStart(5, "0")}`;
}

const refresh = (id?: number, leadId?: number | null) => {
  revalidatePath("/quotations");
  if (id) revalidatePath(`/quotations/${id}`);
  if (leadId) revalidatePath(`/crm/${leadId}`);
};

export async function createQuotation(fd: FormData) {
  const me = await requireUser();
  if (!hasCrm(me)) throw new Error("No CRM access.");
  const leadId = Number(fd.get("leadId")) || null;
  if (leadId) await guardLead(me, leadId);
  let customerId = Number(fd.get("customerId")) || null;
  const lead = leadId ? await db.query.leads.findFirst({ where: eq(leads.id, leadId) }) : null;
  customerId ??= lead?.customerId ?? null;
  const [q] = await db
    .insert(quotations)
    .values({
      number: await nextNumber(),
      leadId,
      customerId,
      contactId: lead?.contactId ?? null,
      subject: lead ? `Techno-commercial offer — ${lead.title}` : null,
      validUntil: new Date(Date.now() + 30 * 864e5),
      salespersonId: lead?.ownerId ?? me.id,
      terms: DEFAULT_TERMS,
    })
    .returning();
  if (lead) {
    await db.insert(quotationLines).values({ quotationId: q!.id, description: lead.title + (lead.capacity ? ` (${lead.capacity})` : ""), qty: 1, unit: "Set", unitPrice: lead.expectedRevenue, taxRate: 18 });
    const t = quoteTotals([{ productId: null, description: "", qty: 1, unit: "Set", unitPrice: lead.expectedRevenue, taxRate: 18 }]);
    await db.update(quotations).set(t).where(eq(quotations.id, q!.id));
    await db.insert(leadNotes).values({ leadId: lead.id, authorId: me.id, kind: "event", body: `Quotation ${q!.number} created` });
  }
  refresh(q!.id, leadId);
  redirect(`/quotations/${q!.id}`);
}

const lineSchema = z.object({
  productId: z.number().int().nullable(),
  description: z.string().trim().min(1),
  qty: z.number().min(0),
  unit: z.string().trim().min(1).default("Nos"),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).max(100),
});
const saveSchema = z.object({
  customerId: z.number().int().nullable(),
  subject: z.string().nullable(),
  date: z.string(),
  validUntil: z.string().nullable(),
  salespersonId: z.number().int().nullable(),
  taxMode: z.enum(["intra", "inter"]),
  discount: z.number().min(0),
  terms: z.string().nullable(),
  lines: z.array(lineSchema),
});

export async function saveQuotation(id: number, payload: z.infer<typeof saveSchema>) {
  await guardQuote(id);
  const d = saveSchema.parse(payload);
  const q = await db.query.quotations.findFirst({ where: eq(quotations.id, id) });
  if (!q) return { error: "Not found" };
  const t = quoteTotals(d.lines, d.discount);
  await db
    .update(quotations)
    .set({
      customerId: d.customerId, subject: d.subject, date: new Date(d.date), validUntil: d.validUntil ? new Date(d.validUntil) : null,
      salespersonId: d.salespersonId, taxMode: d.taxMode, discount: t.discount, terms: d.terms, subtotal: t.subtotal, tax: t.tax, total: t.total, updatedAt: new Date(),
    })
    .where(eq(quotations.id, id));
  await db.delete(quotationLines).where(eq(quotationLines.quotationId, id));
  if (d.lines.length) await db.insert(quotationLines).values(d.lines.map((l, i) => ({ ...l, quotationId: id, sort: i })));
  refresh(id, q.leadId);
  return { ok: true, savedAt: Date.now() };
}

export async function setQuoteStatus(id: number, status: (typeof QUOTE_STATUS)[number]) {
  const me = await guardQuote(id);
  const q = await db.query.quotations.findFirst({ where: eq(quotations.id, id) });
  if (!q) return;
  await db.update(quotations).set({ status, updatedAt: new Date() }).where(eq(quotations.id, id));
  if (q.leadId) await db.insert(leadNotes).values({ leadId: q.leadId, authorId: me.id, kind: "event", body: `Quotation ${q.number}${q.revision ? ` R${q.revision}` : ""} marked ${status}` });
  refresh(id, q.leadId);
}

export async function reviseQuotation(id: number) {
  const me = await guardQuote(id);
  const q = await db.query.quotations.findFirst({ where: eq(quotations.id, id), with: { lines: true } });
  if (!q) return;
  const latest = await db.query.quotations.findFirst({ where: eq(quotations.number, q.number), orderBy: desc(quotations.revision) });
  const { id: _id, createdAt: _c, updatedAt: _u, lines, ...rest } = q;
  const [n] = await db.insert(quotations).values({ ...rest, revision: (latest?.revision ?? 0) + 1, status: "draft", date: new Date() }).returning();
  if (lines.length) await db.insert(quotationLines).values(lines.map(({ id: _i, quotationId: _q, ...l }) => ({ ...l, quotationId: n!.id })));
  if (q.leadId) await db.insert(leadNotes).values({ leadId: q.leadId, authorId: me.id, kind: "event", body: `Revision ${q.number} R${n!.revision} created` });
  refresh(n!.id, q.leadId);
  redirect(`/quotations/${n!.id}`);
}

export async function deleteQuotation(id: number) {
  await guardQuote(id);
  const q = await db.query.quotations.findFirst({ where: eq(quotations.id, id) });
  if (!q || q.status !== "draft") return;
  await db.delete(quotations).where(and(eq(quotations.id, id)));
  refresh(undefined, q.leadId);
  redirect(q.leadId ? `/crm/${q.leadId}` : "/quotations");
}

// ---------- products ----------
const pSchema = z.object({
  name: z.string().trim().min(1),
  description: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable()),
  unit: z.string().trim().min(1).default("Nos"),
  price: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100),
  hsn: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable()),
});

export async function saveProduct(id: number | null, fd: FormData) {
  await requireUser();
  const d = pSchema.parse(Object.fromEntries(fd));
  if (id) await db.update(products).set(d).where(eq(products.id, id));
  else await db.insert(products).values(d);
  revalidatePath("/quotations/products");
}

export async function toggleProduct(id: number, active: boolean) {
  await requireUser();
  await db.update(products).set({ active }).where(eq(products.id, id));
  revalidatePath("/quotations/products");
}

export async function updateCompany(fd: FormData) {
  await requireAdmin();
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  await saveCompany({ name: s("name"), address: s("address"), gstin: s("gstin"), phone: s("phone"), email: s("email"), website: s("website"), bank: s("bank") } as Company);
  revalidatePath("/settings");
}
