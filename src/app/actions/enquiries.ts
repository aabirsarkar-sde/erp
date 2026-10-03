"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, enquiries, leads, leadNotes, crmStages, customers, contacts, activities, users } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { guardLead, requireDept } from "@/lib/core/access";
import { createEnquiry, parseChat } from "@/lib/crm/enquiries";
import { notify } from "@/lib/workspace/notify";
import { runPlaybooks } from "@/lib/crm/playbooks";

const refresh = () => { revalidatePath("/enquiries"); revalidatePath("/", "layout"); };

// ---- public website form ----
const hits = new Map<string, number[]>();
async function limited() {
  const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (arr.length >= 8) return true;
  arr.push(now); hits.set(ip, arr);
  return false;
}

export async function submitWebEnquiry(_p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  if (String(fd.get("website") ?? "")) return { ok: true }; // honeypot for bots
  if (await limited()) return { error: "Too many submissions from this network — please call or email us instead." };
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  if (s("name").length < 2 || (!s("phone") && !s("email")) || s("message").length < 5) return { error: "Please give your name, a phone number or email, and a short message." };
  if (s("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s("email"))) return { error: "That email doesn't look right." };
  await createEnquiry({ source: "website", name: s("name"), company: s("company"), email: s("email"), phone: s("phone"), city: s("city"), product: s("product"), message: s("message"), subject: s("product") ? `Enquiry: ${s("product")}` : "Website enquiry" });
  refresh();
  return { ok: true };
}

// ---- inside the CRM ----
async function sales() { const me = await requireUser(); requireDept(me, "crm"); return me; }
async function load(id: number) { const e = await db.query.enquiries.findFirst({ where: eq(enquiries.id, id) }); if (!e) throw new Error("Enquiry not found"); return e; }

/** paste a WhatsApp chat (or note a phone call) → enquiry; details pulled out by AI when available */
export async function addPastedEnquiry(_p: { error?: string } | undefined, fd: FormData) {
  const me = await sales();
  const text = String(fd.get("text") ?? "").trim();
  const source = fd.get("source") === "phone" ? "phone" : fd.get("source") === "other" ? "other" : "whatsapp";
  if (text.length < 5) return { error: "Paste the chat or write what the customer asked for." };
  const p = await parseChat(text, me.id);
  const phone = String(fd.get("phone") ?? "").trim() || p.phone;
  const r = await createEnquiry({ source, name: p.name, company: p.company, email: p.email, phone, city: p.city, product: p.product, subject: p.summary, message: text, createdById: me.id });
  refresh();
  redirect(`/enquiries?open=${r.id}`);
}

const LEAD_SOURCE: Record<string, string> = { website: "Website", email: "Email", whatsapp: "WhatsApp", phone: "Cold call", other: "Other" };

/** enquiry → new lead (customer created if it's a new company) */
export async function convertEnquiry(id: number, fd: FormData) {
  const me = await sales();
  const e = await load(id);
  if (e.leadId) redirect(`/crm/${e.leadId}`);
  const ownerId = Number(fd.get("ownerId")) || e.assignedToId || me.id;
  const stage = await db.query.crmStages.findFirst({ orderBy: asc(crmStages.sequence) });
  if (!stage) throw new Error("Create a pipeline stage first (Settings).");
  let customerId = e.customerId;
  if (!customerId && e.company) customerId = (await db.insert(customers).values({ name: e.company, city: e.city, email: e.email, phone: e.phone }).returning())[0]!.id;
  let contactId: number | null = null;
  if (customerId && e.name) {
    const existing = e.email ? await db.query.contacts.findFirst({ where: eq(contacts.email, e.email) }) : null;
    contactId = existing?.id ?? (await db.insert(contacts).values({ name: e.name, email: e.email, phone: e.phone, customerId }).returning())[0]!.id;
  }
  const who = e.company ?? e.name ?? e.email ?? e.phone ?? "Enquiry";
  const [l] = await db.insert(leads).values({
    title: `${who} — ${e.product ?? e.subject?.replace(/^Enquiry:\s*/i, "") ?? "Enquiry"}`.slice(0, 150), kind: "lead", product: e.product, customerId, contactId,
    companyName: e.company, contactName: e.name, email: e.email, phone: e.phone, city: e.city, source: LEAD_SOURCE[e.source] ?? "Other",
    description: e.message, stageId: stage.id, probability: stage.probability, ownerId, sortOrder: -Date.now() / 1e6,
  }).returning();
  await db.insert(leadNotes).values({ leadId: l!.id, authorId: me.id, kind: "event", body: `Lead created from ${LEAD_SOURCE[e.source] ?? "an"} enquiry` });
  await runPlaybooks(l!.id, "created", me.id);
  await db.update(enquiries).set({ status: "converted", leadId: l!.id, handledById: me.id, handledAt: new Date(), customerId }).where(eq(enquiries.id, id));
  if (ownerId !== me.id) await notify({ userId: ownerId, kind: "enquiry", fromUserId: me.id, title: `${me.name} gave you a new lead: ${l!.title}`, href: `/crm/${l!.id}`, leadId: l!.id });
  refresh(); revalidatePath("/crm");
  redirect(`/crm/${l!.id}`);
}

/** enquiry from an existing customer about an existing opportunity → goes into that opportunity's history */
export async function attachEnquiry(id: number, fd: FormData) {
  const me = await sales();
  const leadId = Number(fd.get("leadId"));
  if (!leadId) return;
  await guardLead(me, leadId);
  const e = await load(id);
  const l = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  await db.insert(activities).values({
    type: e.source === "email" ? "email" : e.source === "whatsapp" ? "whatsapp" : "call", summary: `Enquiry received: ${e.subject ?? e.product ?? "message"}`.slice(0, 200),
    discussion: e.message, leadId, customerId: l?.customerId ?? e.customerId, userId: l?.ownerId ?? me.id, createdById: me.id, dueAt: e.createdAt, doneAt: e.createdAt,
  });
  await db.update(enquiries).set({ status: "added", leadId, handledById: me.id, handledAt: new Date() }).where(eq(enquiries.id, id));
  if (l?.ownerId && l.ownerId !== me.id) await notify({ userId: l.ownerId, kind: "enquiry", fromUserId: me.id, title: `New message from ${e.company ?? e.name ?? "the customer"} added to ${l.title}`, href: `/crm/${leadId}`, leadId });
  refresh(); revalidatePath(`/crm/${leadId}`);
}

export async function assignEnquiry(id: number, fd: FormData) {
  const me = await sales();
  const userId = Number(fd.get("userId")) || null;
  const e = await load(id);
  await db.update(enquiries).set({ assignedToId: userId }).where(eq(enquiries.id, id));
  if (userId && userId !== me.id) {
    const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (u) await notify({ userId, kind: "enquiry", fromUserId: me.id, title: `${me.name} passed you an enquiry from ${e.company ?? e.name ?? e.email ?? e.phone ?? "a customer"}`, href: `/enquiries?open=${id}` });
  }
  refresh();
}

export async function setEnquiryStatus(id: number, status: "new" | "dismissed") {
  const me = await sales();
  await db.update(enquiries).set({ status, handledById: status === "new" ? null : me.id, handledAt: status === "new" ? null : new Date() }).where(eq(enquiries.id, id));
  refresh();
}
