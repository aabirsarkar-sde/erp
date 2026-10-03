"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db, templates, documents, activities, leads, TEMPLATE_KINDS } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { guardLead, requireDept } from "@/lib/core/access";
import { readFileByKey } from "@/lib/core/storage";
import { sendMail, mailEnabled } from "@/lib/core/mail";
import { shareLink } from "@/lib/core/share";

const schema = z.object({
  kind: z.enum(TEMPLATE_KINDS),
  name: z.string().trim().min(2, "Name the template").max(80),
  category: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(40).nullable()),
  subject: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(200).nullable()),
  body: z.string().trim().min(5, "Write the message").max(5000),
});

export async function saveTemplate(id: number | null, _p: { ok?: number; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  requireDept(me, "crm");
  const r = schema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]!.message };
  if (id) {
    const t = await db.query.templates.findFirst({ where: eq(templates.id, id) });
    if (!t || (t.createdById !== me.id && me.role !== "admin" && me.crmAccess !== "all")) return { error: "Only the author or a manager can change this template." };
    await db.update(templates).set({ ...r.data, updatedAt: new Date() }).where(eq(templates.id, id));
  } else await db.insert(templates).values({ ...r.data, createdById: me.id });
  revalidatePath("/templates");
  return { ok: Date.now() };
}

export async function deleteTemplate(id: number) {
  const me = await requireUser();
  const t = await db.query.templates.findFirst({ where: eq(templates.id, id) });
  if (!t || (t.createdById !== me.id && me.role !== "admin" && me.crmAccess !== "all")) throw new Error("Not allowed");
  await db.delete(templates).where(eq(templates.id, id));
  revalidatePath("/templates");
}

/** expiring public link for a piece of collateral — for WhatsApp */
export async function collateralLink(docId: number) {
  const me = await requireUser();
  requireDept(me, "crm");
  const d = await db.query.documents.findFirst({ where: and(eq(documents.id, docId), isNotNull(documents.category)) });
  if (!d) throw new Error("Not found");
  return shareLink(docId);
}

/** WhatsApp is sent from the phone; this just records it on the opportunity (counts for KPIs) */
export async function logWhatsApp(leadId: number, text: string) {
  const me = await requireUser();
  requireDept(me, "crm");
  await guardLead(me, leadId);
  const l = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  await db.insert(activities).values({ type: "whatsapp", summary: `WhatsApp: ${text.split("\n")[0]!.slice(0, 80)}`, discussion: text.slice(0, 4000), leadId, customerId: l?.customerId ?? null, userId: me.id, createdById: me.id, dueAt: new Date(), doneAt: new Date() });
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
  revalidatePath(`/crm/${leadId}`); revalidatePath("/calendar"); revalidatePath("/kpi");
}

const mailSchema = z.object({
  to: z.string().trim().email("Enter the customer's email"),
  subject: z.string().trim().min(2, "Add a subject").max(200),
  body: z.string().trim().min(5).max(8000),
});

/** email from the CRM (with collateral attached), logged on the opportunity */
export async function sendTemplateEmail(leadId: number, _p: { ok?: string; error?: string } | undefined, fd: FormData) {
  const me = await requireUser();
  requireDept(me, "crm");
  await guardLead(me, leadId);
  const r = mailSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]!.message };
  const ids = fd.getAll("attach").map(Number).filter(Boolean).slice(0, 5);
  const docs = ids.length ? await db.select().from(documents).where(and(inArray(documents.id, ids), isNotNull(documents.category))) : [];
  const attachments = [];
  for (const d of docs) {
    const data = await readFileByKey(d.storageKey);
    attachments.push({ filename: d.name, contentType: d.mime, content: data instanceof Response ? Buffer.from(await data.arrayBuffer()) : data });
  }
  const res = await sendMail({ to: r.data.to, subject: r.data.subject, text: r.data.body, replyTo: me.email, attachments });
  const l = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  await db.insert(activities).values({ type: "email", summary: `Email: ${r.data.subject}`, discussion: `${r.data.body}${docs.length ? `\n\nAttached: ${docs.map((d) => d.name).join(", ")}` : ""}`.slice(0, 4000), leadId, customerId: l?.customerId ?? null, userId: me.id, createdById: me.id, dueAt: new Date(), doneAt: new Date(), outcome: res.sent ? `Sent to ${r.data.to}` : "Logged (email sending isn't set up yet)" });
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
  revalidatePath(`/crm/${leadId}`); revalidatePath("/calendar");
  return { ok: res.sent ? `Sent to ${r.data.to} and logged on the opportunity.` : mailEnabled() ? `Couldn't send (${res.error}). Logged on the opportunity.` : "Email isn't set up on the server yet — logged on the opportunity. Use “Open in Outlook” to send it yourself." };
}
