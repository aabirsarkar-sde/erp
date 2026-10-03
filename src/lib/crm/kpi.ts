import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db, activities, leads, quotations, kpiDefs, kpiTargets, kpiValues, users } from "@/db";
import { isManual, periodRange, type KpiPeriod } from "@/lib/crm/kpi-meta";

export type KpiDefRow = typeof kpiDefs.$inferSelect;
export type KpiCell = { actual: number; target: number; manual: boolean; note?: string | null };

/** people shown on the KPI board: active users with Sales access (admins only when given a personal target) */
async function kpiPeople(defIds: number[]) {
  const [team, overrides] = await Promise.all([
    db.select({ id: users.id, name: users.name, role: users.role, title: users.title }).from(users).where(and(eq(users.active, true), ne(users.crmAccess, "none"))).orderBy(asc(users.name)),
    defIds.length ? db.select().from(kpiTargets).where(inArray(kpiTargets.kpiId, defIds)) : Promise.resolve([] as (typeof kpiTargets.$inferSelect)[]),
  ]);
  const withOverride = new Set(overrides.filter((o) => o.target > 0).map((o) => o.userId));
  return { people: team.filter((u) => u.role !== "admin" || withOverride.has(u.id)), overrides };
}

/** what the system counted for each person in [from, to) — one grouped query per source */
async function autoActuals(from: Date, to: Date) {
  const s = (d: Date) => Math.floor(+d / 1000);
  const [acts, days, created, quotes, won] = await Promise.all([
    db.select({ userId: activities.userId, type: activities.type, n: sql<number>`count(*)` }).from(activities)
      .where(and(isNotNull(activities.doneAt), gte(activities.doneAt, from), lt(activities.doneAt, to))).groupBy(activities.userId, activities.type),
    db.select({ userId: activities.userId, n: sql<number>`count(distinct (${activities.doneAt} + 19800) / 86400)` }).from(activities)
      .where(and(isNotNull(activities.doneAt), gte(activities.doneAt, from), lt(activities.doneAt, to))).groupBy(activities.userId),
    db.select({ userId: leads.ownerId, kind: leads.kind, n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${leads.expectedRevenue}),0)` }).from(leads)
      .where(and(gte(leads.createdAt, from), lt(leads.createdAt, to))).groupBy(leads.ownerId, leads.kind),
    db.select({ userId: quotations.salespersonId, n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${quotations.total}),0)` }).from(quotations)
      .where(and(ne(quotations.status, "draft"), sql`${quotations.date} >= ${s(from)}`, sql`${quotations.date} < ${s(to)}`)).groupBy(quotations.salespersonId),
    db.select({ userId: leads.ownerId, n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${leads.expectedRevenue}),0)` }).from(leads)
      .where(and(eq(leads.status, "won"), gte(leads.closedAt, from), lt(leads.closedAt, to))).groupBy(leads.ownerId),
  ]);
  const m = new Map<string, number>();
  const add = (uid: number | null, k: string, v: number) => { if (uid == null) return; const key = `${k}:${uid}`; m.set(key, (m.get(key) ?? 0) + Number(v)); };
  const typeKey: Record<string, string> = { call: "calls", visit: "visits", meeting: "meetings", email: "emails", whatsapp: "whatsapp" };
  for (const a of acts) { add(a.userId, "activities", a.n); if (typeKey[a.type]) add(a.userId, typeKey[a.type]!, a.n); }
  for (const d of days) add(d.userId, "reports_filed", d.n);
  for (const c of created) { if (c.kind === "lead") add(c.userId, "new_leads", c.n); else { add(c.userId, "new_opportunities", c.n); add(c.userId, "pipeline_added", c.v); } }
  for (const q of quotes) { add(q.userId, "quotations", q.n); add(q.userId, "quotation_value", q.v); }
  for (const w of won) { add(w.userId, "orders_won", w.n); add(w.userId, "order_value", w.v); }
  return (metric: string, uid: number) => m.get(`${metric}:${uid}`) ?? 0;
}

/** the scoreboard for one period: every active KPI/KRA × every salesperson */
export async function kpiBoard(period: KpiPeriod, anchor: Date | number, onlyUser?: number) {
  const r = periodRange(period, anchor);
  const defs = await db.select().from(kpiDefs).where(and(eq(kpiDefs.active, true), eq(kpiDefs.period, period))).orderBy(asc(kpiDefs.kind), asc(kpiDefs.sortOrder), asc(kpiDefs.id));
  const ids = defs.map((d) => d.id);
  const [{ people, overrides }, actual, manual] = await Promise.all([
    kpiPeople(ids),
    autoActuals(r.from, r.to),
    ids.length ? db.select().from(kpiValues).where(and(inArray(kpiValues.kpiId, ids), eq(kpiValues.period, r.key))) : Promise.resolve([] as (typeof kpiValues.$inferSelect)[]),
  ]);
  const ov = new Map(overrides.map((o) => [`${o.kpiId}:${o.userId}`, o.target]));
  const mv = new Map(manual.map((v) => [`${v.kpiId}:${v.userId}`, v]));
  const rows = (onlyUser ? people.filter((p) => p.id === onlyUser) : people).map((p) => ({
    ...p,
    cells: Object.fromEntries(defs.map((d) => {
      const target = ov.get(`${d.id}:${p.id}`) ?? d.target;
      const man = isManual(d.metric);
      const v = mv.get(`${d.id}:${p.id}`);
      return [d.id, { actual: man ? (v?.value ?? 0) : actual(d.metric, p.id), target, manual: man, note: v?.note } satisfies KpiCell];
    })) as Record<number, KpiCell>,
  }));
  return { ...r, period, defs, rows };
}
export type KpiBoard = Awaited<ReturnType<typeof kpiBoard>>;

/** one person's daily, weekly and monthly targets for a date (calendar strip, dashboard) */
export async function myKpis(userId: number, anchor: Date | number) {
  const [d, w, m] = await Promise.all((["daily", "weekly", "monthly"] as const).map((p) => kpiBoard(p, anchor, userId)));
  return [d!, w!, m!].flatMap((b) => b.defs.map((def) => ({ def, period: b.period, cell: b.rows[0]?.cells[def.id] })).filter((x) => x.cell && x.cell.target > 0)) as { def: KpiDefRow; period: KpiPeriod; cell: KpiCell }[];
}

export const canEditKpiValue = (me: { id: number; role: string; crmAccess: string }, userId: number) => me.role === "admin" || me.crmAccess === "all" || me.id === userId;
