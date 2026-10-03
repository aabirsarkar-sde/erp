import "server-only";
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, leads, orders, users, customers, kpiDefs, kpiTargets } from "@/db";
import { leadScope } from "@/lib/core/access";
import { fromLocal, localParts } from "@/lib/core/tz";
import { tagList, type TagDef } from "@/lib/crm/meta";
import type { CurrentUser } from "@/lib/core/auth";

export const FC_PERIODS = { month: "This month", next_month: "Next month", quarter: "This quarter", next_quarter: "Next quarter", fy: "This financial year" } as const;
export type FcPeriod = keyof typeof FC_PERIODS;
export const FC_GROUPS = { owner: "Salesperson", geography: "Geography", segment: "Business line", product: "Product" } as const;
export type FcGroup = keyof typeof FC_GROUPS;

/** Indian financial year: quarters Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar */
export function fcRange(p: FcPeriod, now = Date.now()) {
  const { y, m } = localParts(now);
  const fyStart = m >= 3 ? y : y - 1;
  const qStartM = m - ((m - 3 + 12) % 3); // month index where this quarter starts
  const mk = (yy: number, mm: number) => fromLocal(yy, mm, 1);
  switch (p) {
    case "month": return { from: mk(y, m), to: mk(y, m + 1) };
    case "next_month": return { from: mk(y, m + 1), to: mk(y, m + 2) };
    case "quarter": return { from: mk(y, qStartM), to: mk(y, qStartM + 3) };
    case "next_quarter": return { from: mk(y, qStartM + 3), to: mk(y, qStartM + 6) };
    case "fy": return { from: mk(fyStart, 3), to: mk(fyStart + 1, 3) };
  }
}

export type FcRow = { label: string; won: number; commit: number; best: number; weighted: number; target: number | null; deals: number };

export async function forecast(me: CurrentUser, p: FcPeriod, g: FcGroup, defs: TagDef[]) {
  const { from, to } = fcRange(p);
  const owner = alias(users, "owner");
  const [open, won, wonNoOrder, monthlyOrderKpi] = await Promise.all([
    db.select({ id: leads.id, title: leads.title, value: leads.expectedRevenue, probability: leads.probability, forecast: leads.forecast, closeAt: leads.expectedCloseAt, ownerId: leads.ownerId, owner: owner.name, city: leads.city, tags: leads.tags, segment: leads.segment, product: leads.product, customer: customers.name })
      .from(leads).leftJoin(owner, eq(owner.id, leads.ownerId)).leftJoin(customers, eq(customers.id, leads.customerId))
      .where(and(eq(leads.status, "open"), eq(leads.kind, "opportunity"), ne(leads.forecast, "omitted"), leadScope(me))),
    db.select({ value: orders.value, ownerId: orders.ownerId, owner: owner.name, segment: orders.segment, city: leads.city, tags: leads.tags, product: leads.product })
      .from(orders).leftJoin(leads, eq(leads.id, orders.leadId)).leftJoin(owner, eq(owner.id, orders.ownerId))
      .where(and(gte(orders.poDate, from), lt(orders.poDate, to), leadScope(me))),
    // wins recorded before orders existed (or imported) count by their closing date
    db.select({ value: leads.expectedRevenue, ownerId: leads.ownerId, owner: owner.name, segment: leads.segment, city: leads.city, tags: leads.tags, product: leads.product })
      .from(leads).leftJoin(owner, eq(owner.id, leads.ownerId))
      .where(and(eq(leads.status, "won"), gte(leads.closedAt, from), lt(leads.closedAt, to), sql`not exists (select 1 from orders o where o.lead_id = ${leads.id})`, leadScope(me))),
    db.select().from(kpiDefs).where(and(eq(kpiDefs.metric, "order_value"), eq(kpiDefs.period, "monthly"), eq(kpiDefs.active, true))).limit(1),
  ]);
  const key = (x: { owner: string | null; city: string | null; tags: string | null; segment: string | null; product: string | null }) => {
    if (g === "owner") return x.owner ?? "Unassigned";
    if (g === "segment") return x.segment ?? "Not set";
    if (g === "product") return x.product ?? "Not set";
    const geo = tagList(x.tags).find((t) => defs.find((d) => d.group === "Geography" && d.name.toLowerCase() === t.toLowerCase()));
    return geo ?? x.city ?? "Not set";
  };
  const rows = new Map<string, FcRow>();
  const R = (k: string) => { let r = rows.get(k); if (!r) rows.set(k, (r = { label: k, won: 0, commit: 0, best: 0, weighted: 0, target: null, deals: 0 })); return r; };
  const inPeriod = open.filter((l) => l.closeAt && +l.closeAt >= +from && +l.closeAt < +to);
  for (const l of inPeriod) {
    const r = R(key(l));
    r.deals++;
    r.weighted += (l.value * l.probability) / 100;
    if (l.forecast === "commit") { r.commit += l.value; r.best += l.value; }
    else if (l.forecast === "best_case") r.best += l.value;
  }
  for (const o of [...won, ...wonNoOrder]) R(key(o)).won += o.value;
  // targets: the monthly "Order value won" KRA × months in the period (per-person overrides respected)
  const kd = monthlyOrderKpi[0];
  if (kd && g === "owner") {
    const months = Math.round((+to - +from) / (30.44 * 86_400_000));
    const ov = await db.select().from(kpiTargets).where(eq(kpiTargets.kpiId, kd.id));
    const team = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(eq(users.active, true), ne(users.crmAccess, "none")));
    for (const u of team) {
      const t = ov.find((o) => o.userId === u.id)?.target ?? (u.role === "admin" ? 0 : kd.target);
      if (t > 0) R(u.name).target = t * months;
    }
  }
  const list = [...rows.values()].sort((a, b) => b.won + b.best - (a.won + a.best) || b.weighted - a.weighted);
  const total = list.reduce((a, r) => ({ won: a.won + r.won, commit: a.commit + r.commit, best: a.best + r.best, weighted: a.weighted + r.weighted, target: r.target != null ? (a.target ?? 0) + r.target : a.target, deals: a.deals + r.deals }), { won: 0, commit: 0, best: 0, weighted: 0, target: null as number | null, deals: 0 });
  const noDate = open.filter((l) => !l.closeAt).length;
  const overdueClose = open.filter((l) => l.closeAt && +l.closeAt < Date.now() - 86_400_000).length;
  return { from, to, rows: list, total, deals: inPeriod.sort((a, b) => b.value - a.value), noDate, overdueClose };
}
