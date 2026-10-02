import "server-only";
import { startOfLocalDay, startOfLocalMonth } from "@/lib/core/tz";
import { BRAND } from "@/lib/core/edition";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, tickets, customers, users, teams, leads, crmStages, activities, quotations } from "@/db";
import { aiChatWithTools, type Msg, type ToolDef } from "@/lib/ai/client";
import { ticketScope, leadScope, activityScope, quotationScope } from "@/lib/core/access";
import type { CurrentUser } from "@/lib/core/auth";
import { ticketRef, STAGE_META, PRIORITIES, OPEN_STAGES } from "@/lib/helpdesk/constants";
import { fmtDate, inr, inrShort } from "@/lib/core/format";

type Me = CurrentUser;
const DAY = 864e5;

async function userIdByName(name: string | undefined, me: Me): Promise<number | null | undefined> {
  if (!name) return undefined;
  if (/^(me|my|mine|myself)$/i.test(name)) return me.id;
  if (/unassigned/i.test(name)) return null;
  const u = await db.query.users.findFirst({ where: like(users.name, `%${name}%`) });
  return u?.id ?? -1;
}

const tools: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_tickets",
      description: "Find helpdesk tickets. Returns total count and up to `limit` tickets (newest first).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Words to match in subject, customer name, site or tags" },
          team_location: { type: "string", description: "Support team location, e.g. Dahej, Ankleshwar, Vadodara" },
          status: { type: "string", enum: ["open", "all", "new", "in_progress", "waiting", "resolved", "closed"], description: "Default open" },
          min_priority: { type: "integer", description: "0 low,1 normal,2 high,3 urgent" },
          assignee: { type: "string", description: "Person's name, 'me' or 'unassigned'" },
          overdue: { type: "boolean" },
          no_reply_yet: { type: "boolean", description: "No response sent to the customer yet" },
          created_within_days: { type: "integer" },
          limit: { type: "integer", description: "Max rows, default 10" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ticket_stats",
      description: "Count tickets grouped by team, category, assignee or stage.",
      parameters: { type: "object", properties: { group_by: { type: "string", enum: ["team", "category", "assignee", "stage"] }, open_only: { type: "boolean" }, created_within_days: { type: "integer" } }, required: ["group_by"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_deals",
      description: "Find CRM opportunities/deals. Returns count, total expected revenue (INR) and up to `limit` rows (highest value first).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Match in title, customer, contact, tags or city" },
          stage: { type: "string", description: "Stage name contains, e.g. HOT, WARM, COLD, New, Qualified" },
          status: { type: "string", enum: ["open", "won", "lost", "all"] },
          owner: { type: "string", description: "Salesperson name or 'me'" },
          min_value: { type: "number", description: "Minimum expected revenue in rupees (1 crore = 10000000, 1 lakh = 100000)" },
          closed_within_days: { type: "integer", description: "For won/lost: closed in the last N days" },
          limit: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: { name: "pipeline_summary", description: "Open pipeline per stage (count & value), weighted forecast and won/lost this month.", parameters: { type: "object", properties: { owner: { type: "string", description: "Salesperson name or 'me'; omit for whole team" } } } },
  },
  {
    type: "function",
    function: {
      name: "list_activities",
      description: "Sales activities (calls, meetings, visits, emails, to-dos).",
      parameters: { type: "object", properties: { user: { type: "string", description: "Person's name or 'me'; omit for everyone" }, when: { type: "string", enum: ["overdue", "today", "upcoming", "done_last_7_days", "done_last_30_days"] }, limit: { type: "integer" } }, required: ["when"] },
    },
  },
  {
    type: "function",
    function: { name: "customer_overview", description: "Look up a customer: open tickets, deals, quotations.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  },
];

async function run(name: string, a: Record<string, unknown>, me: Me): Promise<unknown> {
  const lim = Math.min(Number(a.limit) || 10, 30);
  if (name === "search_tickets") {
    const assignee = alias(users, "assignee");
    const c: SQL[] = [];
    const sc = ticketScope(me); if (sc) c.push(sc);
    const st = String(a.status || "open");
    if (st === "open") c.push(inArray(tickets.stage, OPEN_STAGES));
    else if (st !== "all") c.push(eq(tickets.stage, st as (typeof OPEN_STAGES)[number]));
    if (a.team_location) c.push(like(teams.location, `%${a.team_location}%`));
    if (a.min_priority != null) c.push(gte(tickets.priority, Number(a.min_priority)));
    const uid = await userIdByName(a.assignee as string | undefined, me);
    if (uid === null) c.push(isNull(tickets.assigneeId)); else if (uid !== undefined) c.push(eq(tickets.assigneeId, uid));
    if (a.overdue) c.push(lt(tickets.dueAt, new Date()), inArray(tickets.stage, OPEN_STAGES));
    if (a.no_reply_yet) c.push(isNull(tickets.firstResponseAt));
    if (a.created_within_days) c.push(gte(tickets.createdAt, new Date(Date.now() - Number(a.created_within_days) * DAY)));
    if (a.text) { const p = `%${a.text}%`; c.push(or(like(tickets.subject, p), like(customers.name, p), like(tickets.site, p), like(tickets.tags, p))!); }
    const where = c.length ? and(...c) : undefined;
    const base = db.select({ id: tickets.id, subject: tickets.subject, stage: tickets.stage, priority: tickets.priority, created: tickets.createdAt, due: tickets.dueAt, customer: customers.name, team: teams.location, assignee: assignee.name })
      .from(tickets).leftJoin(customers, eq(customers.id, tickets.customerId)).leftJoin(teams, eq(teams.id, tickets.teamId)).leftJoin(assignee, eq(assignee.id, tickets.assigneeId)).where(where);
    const [rows, [cnt]] = await Promise.all([
      base.orderBy(desc(tickets.priority), desc(tickets.createdAt)).limit(lim),
      db.select({ n: sql<number>`count(*)` }).from(tickets).leftJoin(customers, eq(customers.id, tickets.customerId)).leftJoin(teams, eq(teams.id, tickets.teamId)).where(where),
    ]);
    return { total: Number(cnt!.n), tickets: rows.map((r) => ({ ref: ticketRef(r.id), link: `/tickets/${r.id}`, subject: r.subject, customer: r.customer, team: r.team, stage: STAGE_META[r.stage].label, priority: PRIORITIES[r.priority]!.label, assignee: r.assignee ?? "unassigned", created: fmtDate(r.created), due: fmtDate(r.due) })) };
  }
  if (name === "ticket_stats") {
    const g = String(a.group_by);
    const assignee = alias(users, "assignee");
    const key = g === "team" ? teams.location : g === "category" ? tickets.category : g === "assignee" ? assignee.name : tickets.stage;
    const c: SQL[] = [];
    const sc = ticketScope(me); if (sc) c.push(sc);
    if (a.open_only) c.push(inArray(tickets.stage, OPEN_STAGES));
    if (a.created_within_days) c.push(gte(tickets.createdAt, new Date(Date.now() - Number(a.created_within_days) * DAY)));
    const rows = await db.select({ key, n: sql<number>`count(*)` }).from(tickets).leftJoin(teams, eq(teams.id, tickets.teamId)).leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
      .where(c.length ? and(...c) : undefined).groupBy(key).orderBy(desc(sql`count(*)`));
    return rows.map((r) => ({ [g]: r.key ?? "(none)", count: Number(r.n) }));
  }
  if (name === "search_deals") {
    const owner = alias(users, "owner");
    const c: SQL[] = [];
    const sc = leadScope(me); if (sc) c.push(sc);
    const st = String(a.status || "open");
    if (st !== "all") c.push(eq(leads.status, st as "open" | "won" | "lost"));
    if (a.stage) c.push(like(crmStages.name, `%${a.stage}%`));
    const uid = await userIdByName(a.owner as string | undefined, me);
    if (uid) c.push(eq(leads.ownerId, uid));
    if (a.min_value) c.push(gte(leads.expectedRevenue, Number(a.min_value)));
    if (a.closed_within_days) c.push(gte(leads.closedAt, new Date(Date.now() - Number(a.closed_within_days) * DAY)));
    if (a.text) { const p = `%${a.text}%`; c.push(or(like(leads.title, p), like(customers.name, p), like(leads.contactName, p), like(leads.tags, p), like(leads.city, p))!); }
    const rows = await db.select({ id: leads.id, title: leads.title, value: leads.expectedRevenue, prob: leads.probability, status: leads.status, stage: crmStages.name, customer: customers.name, owner: owner.name, close: leads.expectedCloseAt, updated: leads.updatedAt })
      .from(leads).innerJoin(crmStages, eq(crmStages.id, leads.stageId)).leftJoin(customers, eq(customers.id, leads.customerId)).leftJoin(owner, eq(owner.id, leads.ownerId))
      .where(c.length ? and(...c) : undefined).orderBy(desc(leads.expectedRevenue));
    return { total: rows.length, totalValue: inr(rows.reduce((s, r) => s + r.value, 0)), deals: rows.slice(0, lim).map((r) => ({ title: r.title, link: `/crm/${r.id}`, customer: r.customer, stage: r.status === "open" ? r.stage : r.status, value: r.value ? inrShort(r.value) : "not set", probability: `${r.prob}%`, owner: r.owner, expectedClose: fmtDate(r.close), lastUpdated: fmtDate(r.updated) })) };
  }
  if (name === "pipeline_summary") {
    const uid = await userIdByName(a.owner as string | undefined, me);
    const own = and(uid ? eq(leads.ownerId, uid) : undefined, leadScope(me));
    const rows = await db.select({ stage: crmStages.name, seq: crmStages.sequence, n: sql<number>`count(${leads.id})`, v: sql<number>`coalesce(sum(${leads.expectedRevenue}),0)`, w: sql<number>`coalesce(sum(${leads.expectedRevenue} * ${leads.probability} / 100.0),0)` })
      .from(crmStages).leftJoin(leads, and(eq(leads.stageId, crmStages.id), eq(leads.status, "open"), own)).groupBy(crmStages.id).orderBy(asc(crmStages.sequence));
    const start = startOfLocalMonth(Date.now());
    const closed = await db.select({ status: leads.status, n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${leads.expectedRevenue}),0)` }).from(leads).where(and(gte(leads.closedAt, start), own)).groupBy(leads.status);
    return {
      stages: rows.map((r) => ({ stage: r.stage, deals: Number(r.n), value: inrShort(Number(r.v)) })),
      openTotal: inrShort(rows.reduce((s, r) => s + Number(r.v), 0)),
      weightedForecast: inrShort(rows.reduce((s, r) => s + Number(r.w), 0)),
      thisMonth: closed.map((c) => ({ status: c.status, deals: Number(c.n), value: inrShort(Number(c.v)) })),
    };
  }
  if (name === "list_activities") {
    const uid = await userIdByName(a.user as string | undefined, me);
    const today = startOfLocalDay(Date.now());
    const tomorrow = new Date(today.getTime() + DAY);
    const w = String(a.when);
    const c: SQL[] = [];
    const sc = activityScope(me); if (sc) c.push(sc);
    if (uid) c.push(eq(activities.userId, uid));
    if (w === "overdue") c.push(isNull(activities.doneAt), lt(activities.dueAt, today));
    else if (w === "today") c.push(isNull(activities.doneAt), gte(activities.dueAt, today), lt(activities.dueAt, tomorrow));
    else if (w === "upcoming") c.push(isNull(activities.doneAt), gte(activities.dueAt, tomorrow));
    else c.push(isNotNull(activities.doneAt), gte(activities.doneAt, new Date(Date.now() - (w === "done_last_7_days" ? 7 : 30) * DAY)));
    const rows = await db.query.activities.findMany({ where: and(...c), orderBy: w.startsWith("done") ? desc(activities.doneAt) : asc(activities.dueAt), limit: lim, with: { lead: { columns: { id: true, title: true } }, customer: { columns: { name: true } }, user: { columns: { name: true } } } });
    return rows.map((r) => ({ type: r.type, summary: r.summary, outcome: r.outcome, due: fmtDate(r.dueAt), done: fmtDate(r.doneAt), who: r.user?.name, customer: r.customer?.name, deal: r.lead ? { title: r.lead.title, link: `/crm/${r.lead.id}` } : null }));
  }
  if (name === "customer_overview") {
    const cs = await db.select().from(customers).where(like(customers.name, `%${a.name}%`)).limit(3);
    return Promise.all(cs.map(async (c) => {
      const [t, l, q] = await Promise.all([
        db.select({ id: tickets.id, subject: tickets.subject, stage: tickets.stage }).from(tickets).where(and(eq(tickets.customerId, c.id), inArray(tickets.stage, OPEN_STAGES), ticketScope(me))),
        db.select({ id: leads.id, title: leads.title, status: leads.status, value: leads.expectedRevenue }).from(leads).where(and(eq(leads.customerId, c.id), leadScope(me))),
        db.select({ number: quotations.number, status: quotations.status, total: quotations.total }).from(quotations).where(and(eq(quotations.customerId, c.id), quotationScope(me))),
      ]);
      return { customer: c.name, link: `/customers/${c.id}`, city: c.city, openTickets: t.map((x) => ({ ref: ticketRef(x.id), link: `/tickets/${x.id}`, subject: x.subject })), deals: l.map((x) => ({ title: x.title, link: `/crm/${x.id}`, status: x.status, value: inrShort(x.value) })), quotations: q.map((x) => ({ ...x, total: inr(x.total) })) };
    }));
  }
  throw new Error(`Unknown tool ${name}`);
}

export async function askAssistant(history: { role: "user" | "assistant"; content: string }[], me: Me) {
  const hd = me.hdAccess !== "none", crm = me.crmAccess !== "none";
  const about = [hd && "helpdesk tickets", crm && "sales deals, activities", "customers"].filter(Boolean).join(", ");
  const system = `You are the assistant inside ${BRAND.name} for Zero Discharge Systems Pvt. Ltd. (industrial water treatment: RO, MEE, ZLD). You answer questions about ${about} using the tools — never guess numbers. Today is ${fmtDate(new Date())}. The user is ${me.name} (${me.role}); "my/me" means them.
Style: short and direct. Use bullet points for lists. Money in Indian format (₹, lakh, crore). When you mention a ticket, deal or customer, link it with markdown using the "link" field, e.g. [TKT-0012](/tickets/12). If something can't be answered with the tools, say so briefly.`;
  const messages: Msg[] = [{ role: "system", content: system }, ...history.slice(-10)];
  return aiChatWithTools({
    feature: "ask",
    userId: me.id,
    messages,
    tools: tools.filter((t) => (hd || !["search_tickets", "ticket_stats"].includes(t.function.name)) && (crm || !["search_deals", "pipeline_summary", "list_activities"].includes(t.function.name))),
    run: (n, a) => run(n, a, me),
    mock: async (q) => {
      const s = q.toLowerCase();
      if (/deal|pipeline|sales|opportunit|crore|lakh|hot/.test(s)) {
        const p = (await run("pipeline_summary", {}, me)) as { openTotal: string; weightedForecast: string; stages: { stage: string; deals: number; value: string }[] };
        const hot = (await run("search_deals", { stage: "HOT", limit: 3 }, me)) as { deals: { title: string; link: string; value: string }[] };
        return `**Open pipeline:** ${p.openTotal} (weighted ${p.weightedForecast})\n\n${p.stages.map((x) => `- ${x.stage}: ${x.deals} deals, ${x.value}`).join("\n")}\n\nTop HOT deals:\n${hot.deals.map((d) => `- [${d.title}](${d.link}) — ${d.value}`).join("\n")}\n\n_(demo answer — AI_PROVIDER=mock)_`;
      }
      if (/activit|call|follow/.test(s)) {
        const r = (await run("list_activities", { user: "me", when: "overdue", limit: 5 }, me)) as { summary: string; due: string; deal: { title: string; link: string } | null }[];
        return `You have **${r.length} overdue** activities:\n${r.map((x) => `- ${x.summary} (due ${x.due})${x.deal ? ` — [${x.deal.title}](${x.deal.link})` : ""}`).join("\n")}\n\n_(demo answer)_`;
      }
      const t = (await run("search_tickets", { min_priority: 2, limit: 5 }, me)) as { total: number; tickets: { ref: string; link: string; subject: string; customer: string | null; team: string | null }[] };
      return `There are **${t.total} open high-priority tickets**. Most recent:\n${t.tickets.map((x) => `- [${x.ref}](${x.link}) ${x.subject} — ${x.customer} (${x.team})`).join("\n")}\n\n_(demo answer — AI_PROVIDER=mock)_`;
    },
  });
}
