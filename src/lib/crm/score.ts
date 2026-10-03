import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, leads, activities, trials } from "@/db";
import { scoreOpportunity, type Score } from "@/lib/crm/score-rules";
import { missingContact } from "@/lib/crm/meta";

/** scores for a set of opportunities — a few grouped queries, no per-lead round trips */
export async function scoreFor(ids: number[], now = Date.now()): Promise<Map<number, Score>> {
  const out = new Map<number, Score>();
  if (!ids.length) return out;
  const since = new Date(now - 30 * 86_400_000), today = new Date(now);
  const [ls, acts, overdue, tr, wonCustomers] = await Promise.all([
    db.select().from(leads).where(inArray(leads.id, ids)),
    db.select({ leadId: activities.leadId, last: sql<number>`max(${activities.doneAt})`, recent: sql<number>`sum(case when ${activities.doneAt} >= ${Math.floor(+since / 1000)} then 1 else 0 end)` })
      .from(activities).where(and(inArray(activities.leadId, ids), isNotNull(activities.doneAt))).groupBy(activities.leadId),
    db.select({ leadId: activities.leadId, n: sql<number>`count(*)` }).from(activities).where(and(inArray(activities.leadId, ids), isNull(activities.doneAt), lt(activities.dueAt, today))).groupBy(activities.leadId),
    db.select({ leadId: trials.leadId, status: trials.status }).from(trials).where(inArray(trials.leadId, ids)),
    db.selectDistinct({ c: leads.customerId }).from(leads).where(and(eq(leads.status, "won"), isNotNull(leads.customerId))),
  ]);
  const won = new Set(wonCustomers.map((w) => w.c));
  for (const l of ls) {
    const a = acts.find((x) => x.leadId === l.id);
    out.set(l.id, scoreOpportunity({
      probability: l.probability, value: l.expectedRevenue, createdAt: l.createdAt, lastTouch: a?.last ? new Date(Number(a.last) * 1000) : null,
      recentActivities: Number(a?.recent ?? 0), overdue: Number(overdue.find((x) => x.leadId === l.id)?.n ?? 0), proposalStatus: l.proposalStatus,
      trials: tr.filter((t) => t.leadId === l.id), repeatCustomer: !!l.customerId && won.has(l.customerId), tags: l.tags, contactComplete: missingContact(l).length === 0,
    }, now));
  }
  return out;
}
