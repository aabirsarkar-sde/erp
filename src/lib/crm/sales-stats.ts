import "server-only";
import { and, eq, gte, isNotNull, lt, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, leads, crmStages, customers, users, activities, contacts } from "@/db";
import { activityScope, leadScope } from "@/lib/core/access";
import { fromLocalInput } from "@/lib/core/tz";
import { PROPOSAL_META, daysBetween, tagList, type TagDef } from "@/lib/crm/meta";
import type { CurrentUser } from "@/lib/core/auth";

export type SalesFilters = { days?: string; from?: string; to?: string; user?: string };

function salesPeriod(f: SalesFilters) {
  const from = f.from ? fromLocalInput(f.from) : f.days === "all" ? null : new Date(Date.now() - (Number(f.days) || 90) * 864e5);
  const to = f.to ? new Date(+fromLocalInput(f.to)! + 864e5) : null;
  const label = f.from || f.to ? `${f.from ?? "…"} → ${f.to ?? "today"}` : f.days === "all" ? "All time" : `Last ${Number(f.days) || 90} days`;
  return { from, to, label };
}

/** everything the sales & marketing reports need, scoped to what `me` may see */
export async function salesReport(f: SalesFilters, me: CurrentUser) {
  const { from, to, label } = salesPeriod(f);
  const userId = me.crmAccess === "all" && f.user && f.user !== "all" ? Number(f.user) || null : null;
  const owner = alias(users, "owner");
  const lc: SQL[] = [];
  const ls = leadScope(me); if (ls) lc.push(ls);
  if (userId) lc.push(eq(leads.ownerId, userId));
  const allLeadsQ = db
    .select({ id: leads.id, title: leads.title, kind: leads.kind, status: leads.status, stage: crmStages.name, stageSeq: crmStages.sequence, value: leads.expectedRevenue, probability: leads.probability, source: leads.source, proposalStatus: leads.proposalStatus, lostReason: leads.lostReason, product: leads.product, tags: leads.tags, city: leads.city, createdAt: leads.createdAt, closedAt: leads.closedAt, convertedAt: leads.convertedAt, ownerId: leads.ownerId, owner: owner.name, customer: customers.name, segment: leads.segment, expectedCloseAt: leads.expectedCloseAt, forecast: leads.forecast })
    .from(leads).leftJoin(crmStages, eq(crmStages.id, leads.stageId)).leftJoin(owner, eq(owner.id, leads.ownerId)).leftJoin(customers, eq(customers.id, leads.customerId))
    .where(lc.length ? and(...lc) : undefined);
  const inP = (d: Date | null) => !!d && (!from || +d >= +from) && (!to || +d < +to);

  const ac: SQL[] = [isNotNull(activities.doneAt)];
  const as = activityScope(me); if (as) ac.push(as);
  if (from) ac.push(gte(activities.doneAt, from));
  if (to) ac.push(lt(activities.doneAt, to));
  if (userId) ac.push(eq(activities.userId, userId));
  const u = alias(users, "u");
  const actsQ = db
    .select({ id: activities.id, type: activities.type, summary: activities.summary, discussion: activities.discussion, outcome: activities.outcome, nextAction: activities.nextAction, location: activities.location, doneAt: activities.doneAt, dueAt: activities.dueAt, userId: activities.userId, user: u.name, customer: customers.name, contact: contacts.name, leadId: activities.leadId, lead: leads.title })
    .from(activities).leftJoin(u, eq(u.id, activities.userId)).leftJoin(customers, eq(customers.id, activities.customerId)).leftJoin(contacts, eq(contacts.id, activities.contactId)).leftJoin(leads, eq(leads.id, activities.leadId))
    .where(and(...ac)).orderBy(activities.doneAt);
  const [allLeads, acts] = await Promise.all([allLeadsQ, actsQ]);

  const open = allLeads.filter((l) => l.status === "open" && l.kind === "opportunity");
  const won = allLeads.filter((l) => l.status === "won" && inP(l.closedAt));
  const lost = allLeads.filter((l) => l.status === "lost" && inP(l.closedAt));
  const newLeads = allLeads.filter((l) => inP(l.createdAt));
  const sum = (xs: { value: number }[]) => xs.reduce((a, x) => a + x.value, 0);

  const byStageMap = new Map<string, { label: string; seq: number; n: number; value: number; weighted: number }>();
  for (const l of open) { const k = l.stage ?? "—"; const g = byStageMap.get(k) ?? { label: k, seq: l.stageSeq ?? 0, n: 0, value: 0, weighted: 0 }; g.n++; g.value += l.value; g.weighted += (l.value * l.probability) / 100; byStageMap.set(k, g); }
  const byStage = [...byStageMap.values()].sort((a, b) => a.seq - b.seq);

  const people = new Map<string, { label: string; open: number; pipeline: number; won: number; wonValue: number; lost: number; newLeads: number; visits: number; calls: number; meetings: number }>();
  const P = (name: string | null) => { const k = name ?? "Unassigned"; let g = people.get(k); if (!g) { g = { label: k, open: 0, pipeline: 0, won: 0, wonValue: 0, lost: 0, newLeads: 0, visits: 0, calls: 0, meetings: 0 }; people.set(k, g); } return g; };
  for (const l of open) { const g = P(l.owner); g.open++; g.pipeline += l.value; }
  for (const l of won) { const g = P(l.owner); g.won++; g.wonValue += l.value; }
  for (const l of lost) P(l.owner).lost++;
  for (const l of newLeads) P(l.owner).newLeads++;
  for (const a of acts) { const g = P(a.user); if (a.type === "visit") g.visits++; else if (a.type === "call") g.calls++; else if (a.type === "meeting") g.meetings++; }
  const bySalesperson = [...people.values()].sort((a, b) => b.wonValue - a.wonValue || b.pipeline - a.pipeline);

  const count = <T,>(xs: T[], key: (x: T) => string) => { const m = new Map<string, number>(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1); return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n); };
  const bySource = count(newLeads, (l) => l.source ?? "Not recorded").map((s) => ({ ...s, won: newLeads.filter((l) => (l.source ?? "Not recorded") === s.label && l.status === "won").length }));
  const proposals = Object.entries(PROPOSAL_META).map(([k, m]) => { const xs = allLeads.filter((l) => l.proposalStatus === k && (l.status === "open" || inP(l.closedAt))); return { key: k, label: m.label, n: xs.length, value: sum(xs) }; }).filter((p) => p.n);
  const lostReasons = count(lost, (l) => l.lostReason ?? "Other");

  const totals = {
    newLeads: newLeads.length,
    converted: allLeads.filter((l) => inP(l.convertedAt)).length,
    openN: open.length, openValue: sum(open), weighted: open.reduce((a, l) => a + (l.value * l.probability) / 100, 0),
    wonN: won.length, wonValue: sum(won), lostN: lost.length,
    winRate: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : null,
    // turnaround: days from creating the opportunity to the order (won), and average age of what's still open
    winTat: won.length ? won.reduce((a, l) => a + daysBetween(l.createdAt, l.closedAt!), 0) / won.length : null,
    openAge: open.length ? open.reduce((a, l) => a + daysBetween(l.createdAt, Date.now()), 0) / open.length : null,
    visits: acts.filter((a) => a.type === "visit").length, calls: acts.filter((a) => a.type === "call").length, meetings: acts.filter((a) => a.type === "meeting").length,
  };
  return { label, totals, allLeads, inPeriod: inP, byStage, bySalesperson, bySource, proposals, lostReasons, won, lost, visits: acts.filter((a) => a.type === "visit" || a.type === "meeting"), activities: acts, open };
}
export type SalesReport = Awaited<ReturnType<typeof salesReport>>;

export const DIMENSIONS = [["owner", "Salesperson"], ["product", "Product"], ["geography", "Geography"], ["temperature", "Hot / Warm / Cold"], ["stage", "Stage"], ["customer", "Customer"], ["source", "Lead source"], ["label", "Any label"]] as const;
export type Dimension = (typeof DIMENSIONS)[number][0];

/** Pipeline "dashboard by …": open count/value, weighted, average age, won count/value and turnaround per group */
export function groupPipeline(r: SalesReport, dim: Dimension, defs: TagDef[]) {
  const group = (l: SalesReport["allLeads"][number]): string[] => {
    const labelIn = (g: string) => tagList(l.tags).filter((t) => defs.find((d) => d.name.toLowerCase() === t.toLowerCase())?.group === g);
    switch (dim) {
      case "owner": return [l.owner ?? "Unassigned"];
      case "product": return [l.product ?? "Not set"];
      case "geography": { const g = labelIn("Geography"); return g.length ? g : [l.city ?? "Not set"]; }
      case "temperature": { const g = labelIn("Temperature"); return g.length ? g : ["No temperature label"]; }
      case "stage": return [l.stage ?? "—"];
      case "customer": return [l.customer ?? "—"];
      case "source": return [l.source ?? "Not recorded"];
      case "label": { const t = tagList(l.tags); return t.length ? t : ["No label"]; }
    }
  };
  const m = new Map<string, { label: string; open: number; value: number; weighted: number; ageSum: number; won: number; wonValue: number; tatSum: number; lost: number }>();
  const G = (k: string) => { let g = m.get(k); if (!g) m.set(k, (g = { label: k, open: 0, value: 0, weighted: 0, ageSum: 0, won: 0, wonValue: 0, tatSum: 0, lost: 0 })); return g; };
  for (const l of r.allLeads) {
    if (l.kind !== "opportunity" && l.status === "open") continue;
    for (const k of group(l)) {
      const g = G(k);
      if (l.status === "open") { g.open++; g.value += l.value; g.weighted += (l.value * l.probability) / 100; g.ageSum += daysBetween(l.createdAt, Date.now()); }
      else if (l.status === "won" && r.inPeriod(l.closedAt)) { g.won++; g.wonValue += l.value; g.tatSum += daysBetween(l.createdAt, l.closedAt!); }
      else if (l.status === "lost" && r.inPeriod(l.closedAt)) g.lost++;
    }
  }
  return [...m.values()]
    .map((g) => ({ ...g, avgAge: g.open ? g.ageSum / g.open : null, avgTat: g.won ? g.tatSum / g.won : null }))
    .filter((g) => g.open || g.won || g.lost)
    .sort((a, b) => b.value - a.value || b.wonValue - a.wonValue);
}
