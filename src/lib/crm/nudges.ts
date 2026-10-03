import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, leads, activities, quotations, customers, users, settings, trials } from "@/db";
import { aiEnabled, aiJson } from "@/lib/ai/client";
import { notify, type NotifyAction } from "@/lib/workspace/notify";
import { waLink, telLink } from "@/lib/core/links";
import { DAY_MS, localDateKey, startOfLocalDay } from "@/lib/core/tz";

/**
 * The "AI sales assistant": every morning it looks at each open opportunity and, where follow-up
 * has slipped, puts a suggestion in the salesperson's bell — with one-tap call / WhatsApp / email.
 * Rules are plain and predictable; the AI (when configured) only words the message.
 */
import { NUDGE_DEFAULTS, pickNudge, type Nudge, type NudgeRule } from "@/lib/crm/nudge-rules";
export { NUDGE_DEFAULTS, pickNudge, type Nudge, type NudgeRule };

export async function nudgeSettings() {
  const r = await db.query.settings.findFirst({ where: eq(settings.key, "nudge_rules") });
  try { return { ...NUDGE_DEFAULTS, ...(r ? JSON.parse(r.value) : {}) } as typeof NUDGE_DEFAULTS; } catch { return NUDGE_DEFAULTS; }
}

/** find every opportunity that needs a nudge today */
export async function findNudges(now = Date.now()) {
  const cfg = await nudgeSettings();
  const open = await db.select({ id: leads.id, title: leads.title, ownerId: leads.ownerId, createdAt: leads.createdAt, proposalStatus: leads.proposalStatus, value: leads.expectedRevenue, contactName: leads.contactName, phone: leads.phone, email: leads.email, company: leads.companyName, customer: customers.name, ownerActive: users.active })
    .from(leads).leftJoin(customers, eq(customers.id, leads.customerId)).innerJoin(users, eq(users.id, leads.ownerId))
    .where(and(eq(leads.status, "open"), eq(leads.kind, "opportunity"), eq(users.active, true), ne(users.crmAccess, "none")));
  if (!open.length) return [];
  const ids = open.map((l) => l.id);
  const [acts, quotes, trialRows] = await Promise.all([
    db.select({ leadId: activities.leadId, type: activities.type, summary: activities.summary, discussion: activities.discussion, outcome: activities.outcome, dueAt: activities.dueAt, doneAt: activities.doneAt }).from(activities).where(inArray(activities.leadId, ids)),
    db.select({ leadId: quotations.leadId, date: quotations.date, number: quotations.number }).from(quotations).where(and(inArray(quotations.leadId, ids), ne(quotations.status, "draft"))).orderBy(desc(quotations.date)),
    db.select().from(trials).where(inArray(trials.leadId, ids)),
  ]);
  // finished trials count as "jar test / trial" contacts for the follow-up rules
  const trialActs = trialRows.filter((t) => t.status === "success" || t.status === "failed").map((t) => ({ leadId: t.leadId, type: "visit" as const, summary: `${t.kind}${t.product ? ` — ${t.product}` : ""} (trial)`, discussion: t.result, outcome: t.status, dueAt: t.endAt ?? t.createdAt, doneAt: t.endAt ?? t.createdAt }));
  const out: Nudge[] = [];
  for (const l of open) {
    const q = quotes.find((x) => x.leadId === l.id) ?? null;
    const n = pickNudge(l, [...acts, ...trialActs].filter((a) => a.leadId === l.id), q, now, cfg);
    if (n) out.push({ userId: l.ownerId!, leadId: l.id, ...n, customer: l.customer ?? l.company ?? l.title, title: l.title, contact: l.contactName, phone: l.phone, email: l.email, value: l.value });
  }
  // most valuable first, a handful per person — a long list gets ignored
  const per = new Map<number, Nudge[]>();
  for (const n of out.sort((a, b) => (a.rule === "overdue" ? -1 : 0) - (b.rule === "overdue" ? -1 : 0) || b.value - a.value)) {
    const xs = per.get(n.userId) ?? [];
    if (xs.length < cfg.perPerson) xs.push(n);
    per.set(n.userId, xs);
  }
  return [...per.values()].flat();
}

const FALLBACK: Record<NudgeRule, (n: Nudge) => string> = {
  overdue: (n) => `You had something planned with ${n.customer} that's now ${n.days} day(s) overdue. Do it today or write the report.`,
  quote: (n) => `Hey, it's been ${n.days} days since you sent the quotation to ${n.customer}. Let's call them up today.`,
  jartest: (n) => `It's been ${n.days} days since the jar test / trial with ${n.customer}. Call them today to share the results and next steps.`,
  proposal: (n) => `The proposal for ${n.customer} has had no follow-up for ${n.days} days. A quick call today?`,
  silence: (n) => `You haven't been in touch with ${n.customer} for ${n.days} days. Send them a WhatsApp or give them a call today.`,
};
const waText = (n: Nudge, me: string) => `Dear ${n.contact ?? "Sir/Madam"}, greetings from Raybon (Zero Discharge Systems). ${n.rule === "quote" ? "Following up on the quotation we sent you" : n.rule === "jartest" ? "Following up on the jar test / trial results" : n.rule === "proposal" ? "Following up on our proposal" : "Just checking in regarding your requirement"} for ${n.title}. Could we speak today at a convenient time? — ${me}`;

/** words the messages (AI if configured, otherwise templates) and drops them in each person's bell */
export async function deliverNudges(nudges: Nudge[], now = Date.now()) {
  if (!nudges.length) return { created: 0, people: 0, ai: false };
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(nudges.map((n) => n.userId))]))).map((u) => [u.id, u.name]));
  let wording = new Map<number, { message: string; whatsapp: string }>();
  let ai = false;
  if (aiEnabled()) {
    try {
      const r = await aiJson({
        feature: "crm.nudges", userId: null, temperature: 0.6,
        system: "You are the sales assistant inside Raybon's CRM (water treatment, ZLD and RO plants, India). Write one short, friendly, specific nudge per item for the salesperson (max 30 words, second person, like a helpful colleague — e.g. \"Hey, it's been 12 days since you did the jar test at X — let's call him today\"), and a polite WhatsApp message (max 45 words) the salesperson can send to the customer contact. Never invent prices, dates or facts.",
        prompt: JSON.stringify(nudges.map((n) => ({ id: n.leadId, salesperson: names.get(n.userId), customer: n.customer, opportunity: n.title, contact: n.contact, situation: n.fact }))) + '\n\nReturn {"items":[{"id":number,"message":string,"whatsapp":string}]}',
        schema: z.object({ items: z.array(z.object({ id: z.number(), message: z.string().max(400), whatsapp: z.string().max(600) })) }),
        mock: () => ({ items: nudges.map((n) => ({ id: n.leadId, message: FALLBACK[n.rule](n), whatsapp: waText(n, names.get(n.userId) ?? "") })) }),
      });
      wording = new Map(r.items.map((i) => [i.id, { message: i.message, whatsapp: i.whatsapp }]));
      ai = true;
    } catch { /* templates below */ }
  }
  const bucket = Math.floor(+startOfLocalDay(now) / DAY_MS / 3); // the same suggestion at most every 3 days
  let created = 0;
  for (const n of nudges) {
    const w = wording.get(n.leadId);
    const msg = w?.message || FALLBACK[n.rule](n);
    const wa = w?.whatsapp || waText(n, names.get(n.userId) ?? "");
    const actions: NotifyAction[] = [
      ...(n.phone ? [{ label: "Call", href: telLink(n.phone), kind: "call" as const }] : []),
      { label: "WhatsApp", href: waLink(n.phone, wa), kind: "whatsapp" },
      { label: "Email", href: `/crm/${n.leadId}?send=email#send`, kind: "email" },
      { label: "Log it", href: `/calendar/activity?lead=${n.leadId}&type=call&done=1`, kind: "link" },
    ];
    const id = await notify({ userId: n.userId, kind: "nudge", title: msg, body: `${n.title} · ${n.fact}`, href: `/crm/${n.leadId}`, leadId: n.leadId, actions, dedupeKey: `nudge:${n.leadId}:${n.rule}:${bucket}` });
    if (id) created++;
  }
  return { created, people: new Set(nudges.map((n) => n.userId)).size, ai, day: localDateKey(now) };
}
