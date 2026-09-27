"use server";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db, tickets, plants, messages, ticketWatchers, contacts } from "@/db";
import { getSla } from "@/lib/sla";
import { ackNewTicket, autoWatchers, notifyNewTicket } from "@/lib/notify";
import { COMPLAINT_TYPES, ticketRef } from "@/lib/constants";

// very small abuse guard for the public form
const hits = new Map<string, number[]>();
async function limited() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (arr.length >= 10) return true;
  arr.push(now); hits.set(ip, arr);
  return false;
}

export async function submitPublicComplaint(_p: { ok?: boolean; error?: string; ref?: string } | undefined, fd: FormData) {
  if (String(fd.get("website") ?? "")) return { ok: true, ref: "TKT-0000" }; // honeypot
  if (await limited()) return { error: "Too many submissions from this network. Please call us instead." };
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const plantNo = s("plantNo").toUpperCase(), type = s("type"), narration = s("narration"), name = s("name"), phone = s("phone"), email = s("email").toLowerCase();
  if (!plantNo || !type || narration.length < 5 || name.length < 2 || (!phone && !email)) return { error: "Please fill plant number, type, narration, your name and a phone or email." };
  if (!(COMPLAINT_TYPES as readonly string[]).includes(type)) return { error: "Choose a complaint type." };
  const plant = await db.query.plants.findFirst({ where: and(eq(sql`upper(${plants.plantNo})`, plantNo), eq(plants.active, true)) });
  if (!plant || !plant.teamId) return { error: `We couldn't find plant ${plantNo}. Check the number on your plant nameplate / AMC document, or call us.` };
  const sla = await getSla();
  let contactId: number | null = null;
  if (email) contactId = (await db.query.contacts.findFirst({ where: eq(contacts.email, email) }))?.id ?? null;
  if (!contactId) contactId = (await db.insert(contacts).values({ name, phone: phone || null, email: email || null, customerId: plant.customerId }).returning())[0]!.id;
  const [t] = await db.insert(tickets).values({
    subject: `${type} — ${plant.plantNo} ${plant.name}`, description: narration, category: type, priority: 1, teamId: plant.teamId, customerId: plant.customerId, contactId,
    plantId: plant.id, site: plant.name, complainantName: name, complainantPhone: phone || null, complainantEmail: email || null, reportedAt: new Date(), source: "portal",
    dueAt: new Date(Date.now() + sla.resolution[1]! * 3600e3), tags: "portal",
  }).returning();
  await db.insert(messages).values({ ticketId: t!.id, kind: "event", body: `Complaint submitted online by ${name}${phone ? ` (${phone})` : ""}` });
  if (email) await db.insert(ticketWatchers).values({ ticketId: t!.id, email, name }).onConflictDoNothing();
  await autoWatchers(t!.id);
  if (email) await ackNewTicket(t!.id, email, `${type} — ${plant.plantNo}`);
  await notifyNewTicket(t!.id);
  return { ok: true, ref: ticketRef(t!.id) };
}

export async function submitFeedback(token: string, _p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  const score = Number(fd.get("score"));
  if (!(score >= 1 && score <= 5)) return { error: "Tap a star rating." };
  const t = await db.query.tickets.findFirst({ where: eq(tickets.csatToken, token) });
  if (!t) return { error: "This feedback link is no longer valid." };
  const comment = String(fd.get("comment") ?? "").trim().slice(0, 1000) || null;
  await db.update(tickets).set({ csatScore: score, csatComment: comment }).where(eq(tickets.id, t.id));
  await db.insert(messages).values({ ticketId: t.id, kind: "event", body: `Customer rated the service ${score}/5${comment ? ` — “${comment}”` : ""}` });
  return { ok: true };
}
