import "server-only";
import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { db, tickets, messages, teams, leads, leadNotes, activities, ACTIVITY_TYPES } from "@/db";
import { aiJson } from "./ai";
import { CATEGORIES, PRIORITIES, STAGE_META, ticketRef } from "./constants";
import { inr, fmtDate } from "./format";

const COMPANY = `You work for Zero Discharge Systems Pvt. Ltd. (brands: Raybon, ROSERVE, ROCHEM), an Indian company that designs, supplies and services industrial water & wastewater treatment plants: RO, DTRO (disc tube RO), UF, MEE (multiple effect evaporators), ATFD dryers, strippers and full ZLD (zero liquid discharge) systems for chemical, pharma and textile plants in Gujarat and Maharashtra. Capacities are in KLD (kilolitres/day). Money is Indian Rupees (lakh/crore).`;

const fmtThread = (ms: { kind: string; body: string; createdAt: Date; author?: { name: string } | null; fromName?: string | null; fromEmail?: string | null }[]) =>
  ms
    .map((m) => {
      const who = m.kind === "inbound" ? `CUSTOMER (${m.fromName || m.fromEmail})` : m.kind === "reply" ? `SUPPORT REPLY (${m.author?.name})` : m.kind === "note" ? `INTERNAL NOTE (${m.author?.name})` : `EVENT`;
      return `[${fmtDate(m.createdAt)}] ${who}: ${m.body}`;
    })
    .join("\n");

// ---------------- Helpdesk ----------------

export const triageSchema = z.object({
  category: z.string(),
  priority: z.number().int().min(0).max(3),
  teamId: z.number().int().nullable(),
  tags: z.array(z.string()).max(5),
  summary: z.string(),
  reason: z.string(),
});
export type Triage = z.infer<typeof triageSchema>;

export async function triageTicket(input: { subject: string; description?: string | null; customer?: string | null; city?: string | null }, userId: number | null): Promise<Triage> {
  const ts = await db.select({ id: teams.id, location: teams.location }).from(teams).where(eq(teams.active, true));
  const r = await aiJson({
    feature: "ticket.triage",
    userId,
    system: `${COMPANY}\nYou triage incoming customer support tickets.`,
    prompt: `Ticket subject: ${input.subject}
Description: ${input.description || "(none)"}
Customer: ${input.customer || "unknown"}${input.city ? ` (${input.city})` : ""}

Return JSON:
{"category": one of ${JSON.stringify(CATEGORIES)},
 "priority": 0=Low,1=Normal,2=High,3=Urgent (Urgent = plant stopped / discharge norms at risk; High = degraded performance or safety),
 "teamId": id of the best support team by location from ${JSON.stringify(ts)} or null if unclear,
 "tags": up to 4 short tags (equipment like RO, MEE, ATFD, UF, DTRO; product like ROSERVE/ROCHEM),
 "summary": one-line summary (max 15 words),
 "reason": one short sentence explaining the priority}`,
    schema: triageSchema,
    mock: () => {
      const s = `${input.subject} ${input.description ?? ""}`.toLowerCase();
      const urgent = /trip|stopp|breakdown|shut|not working|leak/.test(s);
      const cat = /trip|breaker|vfd|motor|panel|mcc|power/.test(s) ? "Electrical"
        : /transmitter|plc|hmi|analy[sz]er|sensor|meter|instrument/.test(s) ? "Instrumentation"
        : /membrane|permeate|recovery|dp\b|rejection/.test(s) ? "Membrane"
        : /tds|turbidity|feed|cod|hardness|silica/.test(s) ? "Feed water quality"
        : /operator|staff|shift|manpower|absent/.test(s) ? "Manpower"
        : /pump|bearing|valve|vacuum|leak|blade|seal|mechanical/.test(s) ? "Mechanical" : "Other";
      const team = ts.find((t) => input.city && t.location?.toLowerCase().includes(input.city.toLowerCase())) ?? null;
      return { category: cat, priority: urgent ? 3 : cat === "Membrane" || cat === "Feed water quality" ? 2 : 1, teamId: team?.id ?? null, tags: ["RO"], summary: input.subject.slice(0, 80), reason: urgent ? "Equipment is down, which can stop the plant." : "Needs attention but the plant is running." };
    },
  });
  if (!CATEGORIES.includes(r.category)) r.category = "Other";
  if (r.teamId && !ts.some((t) => t.id === r.teamId)) r.teamId = null;
  return r;
}

async function loadTicket(id: number) {
  const t = await db.query.tickets.findFirst({
    where: eq(tickets.id, id),
    with: { customer: true, contact: true, team: true, assignee: { columns: { name: true } }, messages: { orderBy: asc(messages.createdAt), with: { author: { columns: { name: true } } } } },
  });
  if (!t) throw new Error("Ticket not found");
  const header = `${ticketRef(t.id)} — ${t.subject}
Customer: ${t.customer?.name ?? "unknown"}${t.site ? `, site: ${t.site}` : ""}. Contact: ${t.contact?.name ?? "—"}
Stage: ${STAGE_META[t.stage].label}. Priority: ${PRIORITIES[t.priority]!.label}. Category: ${t.category ?? "—"}. Team: ${t.team.location}. Assignee: ${t.assignee?.name ?? "unassigned"}.
Description: ${t.description ?? "(none)"}`;
  return { t, header, thread: fmtThread(t.messages) };
}

export const summarySchema = z.object({ summary: z.string(), status: z.string(), nextSteps: z.array(z.string()).max(5), sentiment: z.enum(["calm", "concerned", "frustrated", "angry"]) });

export async function summarizeTicket(id: number, userId: number) {
  const { header, thread, t } = await loadTicket(id);
  return aiJson({
    feature: "ticket.summary",
    userId,
    system: `${COMPANY}\nYou summarise support tickets for busy service engineers. Be concrete: equipment, readings, what was done, what is pending.`,
    prompt: `${header}\n\nThread (oldest first):\n${thread}\n\nReturn JSON: {"summary": 2-4 sentences, "status": one sentence on where things stand, "nextSteps": up to 4 short action items, "sentiment": customer mood: calm|concerned|frustrated|angry}`,
    schema: summarySchema,
    mock: () => ({ summary: `${t.customer?.name ?? "Customer"} reported: ${t.subject}. ${t.messages.filter((m) => m.kind !== "event").length} messages so far.`, status: `Currently ${STAGE_META[t.stage].label.toLowerCase()}.`, nextSteps: ["Confirm site visit date with customer", "Carry CIP kit and spare cartridges"], sentiment: "concerned" }),
  });
}

export async function draftTicketReply(id: number, userId: number, userName: string, instruction?: string) {
  const { header, thread, t } = await loadTicket(id);
  return aiJson({
    feature: "ticket.reply",
    userId,
    system: `${COMPANY}\nYou draft polite, professional email replies from the service team to industrial customers in India. Plain text, no markdown. Don't invent facts, dates or prices — use [placeholders] where info is missing. Keep it concise (under 150 words). Don't include a signature; it is added automatically.`,
    prompt: `${header}\n\nThread:\n${thread}\n\nWriter: ${userName}.${instruction ? `\nInstruction from the writer: ${instruction}` : ""}\n\nReturn JSON: {"reply": "the email body, starting with a greeting to the contact"}`,
    schema: z.object({ reply: z.string().min(5) }),
    mock: () => ({ reply: `Dear ${t.contact?.name ?? "Sir/Madam"},\n\nThank you for reporting "${t.subject}". Our engineer will visit the site on [date] to inspect the system and will share the findings with you the same day.\n\nIn the meantime, please share the latest operating log (feed pressure, permeate flow and TDS).\n\nRegards,` }),
    temperature: 0.5,
  });
}

// ---------------- Sales ----------------

async function loadLead(id: number) {
  const l = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: {
      stage: true, customer: true, owner: { columns: { name: true } },
      notes: { orderBy: desc(leadNotes.createdAt), limit: 30, with: { author: { columns: { name: true } } } },
      activities: { orderBy: desc(activities.createdAt), limit: 20 },
      quotations: true,
    },
  });
  if (!l) throw new Error("Opportunity not found");
  const ctx = `Opportunity: ${l.title}
Customer: ${l.customer?.name ?? l.companyName ?? "—"} (${l.city ?? "—"}). Contact: ${l.contactName ?? "—"}. Capacity: ${l.capacity ?? "—"}.
Status: ${l.status}. Stage: ${l.stage.name}. Expected revenue: ${inr(l.expectedRevenue)}. Probability: ${l.probability}%. Expected close: ${l.expectedCloseAt ? fmtDate(l.expectedCloseAt) : "—"}. Priority stars: ${l.priority}/3. Tags: ${l.tags ?? "—"}. Salesperson: ${l.owner?.name ?? "—"}.
Created ${fmtDate(l.createdAt)}, last updated ${fmtDate(l.updatedAt)}. Today is ${fmtDate(new Date())}.
Notes: ${l.description ?? "—"}
Quotations: ${l.quotations.map((q) => `${q.number}${q.revision ? ` R${q.revision}` : ""} ${q.status} ${inr(q.total)} (${fmtDate(q.date)})`).join("; ") || "none"}
Activities (newest first): ${l.activities.map((a) => `${a.doneAt ? `DONE ${fmtDate(a.doneAt)}` : `PLANNED ${fmtDate(a.dueAt)}`} ${a.type}: ${a.summary}${a.outcome ? ` → ${a.outcome}` : ""}`).join(" | ") || "none"}
History (newest first): ${l.notes.map((n) => `[${fmtDate(n.createdAt)}] ${n.body}`).join(" | ")}`;
  return { l, ctx };
}

const suggestedActivity = z.object({ type: z.enum(ACTIVITY_TYPES), summary: z.string(), dueInDays: z.number().int().min(0).max(90) });
export const briefSchema = z.object({
  summary: z.string(),
  health: z.enum(["on track", "needs attention", "at risk", "stalled"]),
  risks: z.array(z.string()).max(4),
  nextStep: z.string(),
  suggestedActivity,
});

export async function leadBrief(id: number, userId: number) {
  const { ctx, l } = await loadLead(id);
  return aiJson({
    feature: "lead.brief",
    userId,
    system: `${COMPANY}\nYou are a pragmatic B2B sales coach for capital-equipment deals (long cycles, techno-commercial offers, site visits, water analysis, PO negotiations). Be specific to this deal; no generic advice.`,
    prompt: `${ctx}\n\nReturn JSON: {"summary": 2-3 sentences on where the deal stands, "health": on track|needs attention|at risk|stalled, "risks": up to 3 short risks, "nextStep": the single most useful next action, "suggestedActivity": {"type": call|meeting|visit|email|todo, "summary": short activity title, "dueInDays": integer}}`,
    schema: briefSchema,
    mock: () => ({
      summary: `${l.title} is in ${l.stage.name} worth ${inr(l.expectedRevenue)}. ${l.quotations.length ? "A quotation has been shared." : "No quotation has been sent yet."}`,
      health: l.quotations.length ? "on track" : "needs attention",
      risks: ["No confirmed decision date", "Competitor offers likely"],
      nextStep: l.quotations.length ? "Call the plant head to get feedback on the offer and identify decision makers." : "Get the water analysis report and send a budgetary offer.",
      suggestedActivity: { type: "call", summary: "Follow up on offer feedback", dueInDays: 2 },
    }),
  });
}

export async function draftFollowUp(id: number, userId: number, userName: string, purpose?: string) {
  const { ctx, l } = await loadLead(id);
  return aiJson({
    feature: "lead.email",
    userId,
    system: `${COMPANY}\nYou write short, warm, professional follow-up emails to industrial customers in India. Plain text. No invented prices or dates — use [placeholders]. Under 140 words. End with the sender's name.`,
    prompt: `${ctx}\n\nSender: ${userName}.${purpose ? `\nPurpose: ${purpose}` : ""}\n\nReturn JSON: {"subject": "...", "body": "..."}`,
    schema: z.object({ subject: z.string(), body: z.string() }),
    mock: () => ({ subject: `Following up — ${l.title}`, body: `Dear ${l.contactName ?? "Sir"},\n\nHope you are doing well. Following up on our discussion regarding ${l.title}. Please let us know if you need any clarification on the technical or commercial aspects of our offer.\n\nWe would be glad to arrange a meeting at your convenience on [date].\n\nBest regards,\n${userName}` }),
    temperature: 0.6,
  });
}

export const callLogSchema = z.object({
  summary: z.string(),
  type: z.enum(ACTIVITY_TYPES),
  outcome: z.string(),
  nextActivity: suggestedActivity.nullable(),
  updates: z.object({ expectedRevenue: z.number().nullable(), probability: z.number().int().min(0).max(100).nullable() }),
});

export async function parseCallNotes(notes: string, userId: number, leadId?: number | null) {
  const ctx = leadId ? (await loadLead(leadId)).ctx : "";
  return aiJson({
    feature: "activity.parse",
    userId,
    system: `${COMPANY}\nYou turn a salesperson's rough notes (may be Hinglish, shorthand, or voice-typed) into a clean activity log entry.`,
    prompt: `${ctx ? `${ctx}\n\n` : ""}Today is ${fmtDate(new Date())}.\nRaw notes:\n"""${notes}"""\n\nReturn JSON: {"summary": short title of what was done, "type": call|meeting|visit|email|todo (what was done), "outcome": 1-3 clean sentences of what the customer said/decided, "nextActivity": {"type","summary","dueInDays"} or null if none mentioned/implied, "updates": {"expectedRevenue": new rupee amount if the notes clearly state a new deal value else null, "probability": new % if clearly implied else null}}`,
    schema: callLogSchema,
    mock: () => {
      const m = notes.match(/(\d+)\s*(din|days?)/i);
      return { summary: "Call with customer", type: "call" as const, outcome: notes.trim().slice(0, 200), nextActivity: { type: "call" as const, summary: "Follow up", dueInDays: m ? Number(m[1]) : 3 }, updates: { expectedRevenue: null, probability: null } };
    },
  });
}

export const scopeSchema = z.object({ lines: z.array(z.object({ description: z.string(), qty: z.number().min(0), unit: z.string() })).min(1).max(12) });

export async function writeScope(request: string, userId: number, context?: string) {
  return aiJson({
    feature: "quote.scope",
    userId,
    system: `${COMPANY}\nYou write quotation line items for techno-commercial offers. Each line: first line = item title, following lines = concise technical scope (capacity, MOC, key components, what's included). Never include prices.`,
    prompt: `${context ? `Context: ${context}\n` : ""}Request: ${request}\n\nReturn JSON: {"lines": [{"description": "Title\\nscope line 1\\nscope line 2", "qty": number, "unit": "Set|Nos|Lot|Month|..."}]}`,
    schema: scopeSchema,
    mock: () => ({ lines: [{ description: `${request.slice(0, 60)}\nComplete system as per scope, skid mounted, MOC SS316\nIncludes instrumentation, PLC-based controls and interconnecting piping`, qty: 1, unit: "Set" }, { description: "Installation & Commissioning\nErection, commissioning and 7-day trial run", qty: 1, unit: "Lot" }] }),
  });
}
