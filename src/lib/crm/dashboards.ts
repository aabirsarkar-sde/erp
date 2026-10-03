import "server-only";
import { and, asc, eq, isNull, lt, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, dashboards, quotations, users, customers, activities, enquiries, orders, crmStages } from "@/db";
import { activityScope, leadScope, quotationScope } from "@/lib/core/access";
import { leads } from "@/db";
import { salesReport } from "@/lib/crm/sales-stats";
import { getTagDefs } from "@/lib/crm/tags";
import { daysBetween, tagList, type TagDef } from "@/lib/crm/meta";
import { fromLocal, localDateKey, localParts, startOfLocalMonth, DAY_MS } from "@/lib/core/tz";
import { W_METRICS, type Widget, type WGroup, type WRange } from "@/lib/crm/dashboards-meta";
import type { CurrentUser } from "@/lib/core/auth";

export type DashboardRow = typeof dashboards.$inferSelect;
export const parseWidgets = (s: string): Widget[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };

/** my boards + boards others shared */
export const listDashboards = (me: CurrentUser) =>
  db.select({ id: dashboards.id, name: dashboards.name, shared: dashboards.shared, userId: dashboards.userId, owner: users.name, widgets: dashboards.widgets, sortOrder: dashboards.sortOrder })
    .from(dashboards).leftJoin(users, eq(users.id, dashboards.userId))
    .where(or(eq(dashboards.userId, me.id), eq(dashboards.shared, true)))
    .orderBy(asc(dashboards.sortOrder), asc(dashboards.id));

function rangeStart(r: WRange): Date | null {
  const now = Date.now();
  if (r === "all") return null;
  if (r === "month") return startOfLocalMonth(now);
  if (r === "fy") { const p = localParts(now); return fromLocal(p.m >= 3 ? p.y : p.y - 1, 3, 1); }
  return new Date(now - Number(r) * DAY_MS);
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (d: Date | number) => localDateKey(d).slice(0, 7);
const monthLabel = (k: string) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}`;

export type WidgetResult = { total: number; rows: { label: string; value: number }[]; months?: { labels: string[]; values: number[] } };

/** load the data once per board, then compute every widget from it */
export async function dashboardData(me: CurrentUser, widgets: Widget[]): Promise<Record<string, WidgetResult>> {
  if (!widgets.length) return {};
  const need = (src: string) => widgets.some((w) => (W_METRICS[w.metric]?.src as string) === src);
  const sp = alias(users, "sp");
  const [r, defs, quotes, overdue, enq, ords, stages] = await Promise.all([
    salesReport({ days: "all" }, me),
    getTagDefs(),
    need("quotes") || need("pending")
      ? db.select({ total: quotations.total, date: quotations.date, status: quotations.status, owner: sp.name, customer: customers.name }).from(quotations)
        .leftJoin(sp, eq(sp.id, quotations.salespersonId)).leftJoin(customers, eq(customers.id, quotations.customerId))
        .where(and(ne(quotations.status, "draft"), quotationScope(me)))
      : Promise.resolve([]),
    need("overdue")
      ? db.select({ dueAt: activities.dueAt, type: activities.type, owner: sp.name, customer: customers.name }).from(activities)
        .leftJoin(sp, eq(sp.id, activities.userId)).leftJoin(customers, eq(customers.id, activities.customerId))
        .where(and(isNull(activities.doneAt), lt(activities.dueAt, new Date(Date.now() - 86_400_000)), activityScope(me)))
      : Promise.resolve([]),
    need("enquiries") ? db.select({ source: enquiries.source, createdAt: enquiries.createdAt }).from(enquiries).where(eq(enquiries.status, "new")) : Promise.resolve([]),
    need("orders")
      ? db.select({ value: orders.value, poDate: orders.poDate, owner: sp.name, customer: customers.name }).from(orders)
        .leftJoin(sp, eq(sp.id, orders.ownerId)).leftJoin(customers, eq(customers.id, orders.customerId)).leftJoin(leads, eq(leads.id, orders.leadId)).where(leadScope(me))
      : Promise.resolve([]),
    db.select({ name: crmStages.name, seq: crmStages.sequence }).from(crmStages),
  ]);
  const extra: Extra = { overdue, enq, ords, stageSeq: new Map(stages.map((x) => [x.name, x.seq])) };
  const out: Record<string, WidgetResult> = {};
  for (const w of widgets) out[w.id] = compute(w, r, defs, quotes, extra);
  return out;
}

type Lead = Awaited<ReturnType<typeof salesReport>>["allLeads"][number];
type Act = Awaited<ReturnType<typeof salesReport>>["activities"][number];
type Quote = { total: number; date: Date; status?: string; owner: string | null; customer: string | null };
type Extra = {
  overdue: { dueAt: Date | null; type: string; owner: string | null; customer: string | null }[];
  enq: { source: string; createdAt: Date }[];
  ords: { value: number; poDate: Date; owner: string | null; customer: string | null }[];
  stageSeq: Map<string, number>;
};

function leadGroups(l: Lead, g: WGroup, defs: TagDef[], date: Date | null): string[] {
  const labelIn = (grp: string) => tagList(l.tags).filter((t) => defs.find((d) => d.name.toLowerCase() === t.toLowerCase())?.group === grp);
  switch (g) {
    case "none": return ["Total"];
    case "owner": return [l.owner ?? "Unassigned"];
    case "product": return [l.product ?? "Not set"];
    case "geography": { const x = labelIn("Geography"); return x.length ? x : [l.city ?? "Not set"]; }
    case "temperature": { const x = labelIn("Temperature"); return x.length ? x : ["No label"]; }
    case "stage": return [l.stage ?? "—"];
    case "customer": return [l.customer ?? "—"];
    case "source": return [l.source ?? "Not recorded"];
    case "label": { const t = tagList(l.tags); return t.length ? t : ["No label"]; }
    case "month": return [date ? monthKey(date) : "—"];
    case "segment": return [l.segment ?? "Not set"];
    default: return ["Total"];
  }
}

function compute(w: Widget, r: Awaited<ReturnType<typeof salesReport>>, defs: TagDef[], quotes: Quote[], x: Extra): WidgetResult {
  const m = W_METRICS[w.metric];
  if (!m) return { total: 0, rows: [] };
  const from = rangeStart(w.range);
  const inR = (d: Date | null) => !!d && (!from || +d >= +from);
  // per group: sum and count (for averages / rates)
  const acc = new Map<string, { s: number; n: number; won: number; closed: number }>();
  const add = (keys: string[], v: number, extra?: { won?: boolean; closed?: boolean }) => {
    for (const k of keys) { const a = acc.get(k) ?? { s: 0, n: 0, won: 0, closed: 0 }; a.s += v; a.n++; if (extra?.won) a.won++; if (extra?.closed) a.closed++; acc.set(k, a); }
  };
  const opps = r.allLeads.filter((l) => l.kind === "opportunity" || l.status !== "open");

  switch (w.metric) {
    case "pipeline_value": case "weighted_pipeline": case "open_count": case "avg_age":
      for (const l of opps) if (l.status === "open" && (!from || +l.createdAt >= +from)) {
        const v = w.metric === "pipeline_value" ? l.value : w.metric === "weighted_pipeline" ? (l.value * l.probability) / 100 : w.metric === "avg_age" ? daysBetween(l.createdAt, Date.now()) : 1;
        add(leadGroups(l, w.groupBy, defs, l.createdAt), v);
      }
      break;
    case "new_opportunities": case "new_value":
      for (const l of opps) if (inR(l.createdAt)) add(leadGroups(l, w.groupBy, defs, l.createdAt), w.metric === "new_value" ? l.value : 1);
      break;
    case "won_value": case "won_count": case "avg_tat":
      for (const l of opps) if (l.status === "won" && inR(l.closedAt)) add(leadGroups(l, w.groupBy, defs, l.closedAt), w.metric === "won_value" ? l.value : w.metric === "avg_tat" ? daysBetween(l.createdAt, l.closedAt!) : 1);
      break;
    case "lost_count":
      for (const l of opps) if (l.status === "lost" && inR(l.closedAt)) add(leadGroups(l, w.groupBy, defs, l.closedAt), 1);
      break;
    case "win_rate":
      for (const l of opps) if (l.status !== "open" && inR(l.closedAt)) add(leadGroups(l, w.groupBy, defs, l.closedAt), 0, { won: l.status === "won", closed: true });
      break;
    case "activities": case "visits": case "calls":
      for (const a of r.activities as Act[]) {
        if (!inR(a.doneAt)) continue;
        if (w.metric === "visits" && a.type !== "visit") continue;
        if (w.metric === "calls" && a.type !== "call") continue;
        const k = w.groupBy === "owner" ? a.user ?? "Unassigned" : w.groupBy === "type" ? a.type : w.groupBy === "month" ? monthKey(a.doneAt!) : w.groupBy === "customer" ? a.customer ?? "—" : "Total";
        add([k], 1);
      }
      break;
    case "quotes_pending":
      for (const q of quotes) if (q.status === "sent" && inR(q.date)) add([w.groupBy === "owner" ? q.owner ?? "Unassigned" : w.groupBy === "customer" ? q.customer ?? "—" : w.groupBy === "month" ? monthKey(q.date) : "Total"], q.total);
      break;
    case "overdue_followups":
      for (const a of x.overdue) add([w.groupBy === "owner" ? a.owner ?? "Unassigned" : w.groupBy === "customer" ? a.customer ?? "—" : w.groupBy === "type" ? a.type : "Total"], 1);
      break;
    case "new_enquiries":
      for (const e of x.enq) if (inR(e.createdAt)) add([w.groupBy === "source_e" ? e.source : w.groupBy === "month" ? monthKey(e.createdAt) : "Total"], 1);
      break;
    case "orders_value":
      for (const o of x.ords) if (inR(o.poDate)) add([w.groupBy === "owner" ? o.owner ?? "Unassigned" : w.groupBy === "customer" ? o.customer ?? "—" : w.groupBy === "month" ? monthKey(o.poDate) : "Total"], o.value);
      break;
    case "forecast_quarter": {
      const { y, m } = localParts(Date.now());
      const qs = m - ((m - 3 + 12) % 3), qFrom = fromLocal(y, qs, 1), qTo = fromLocal(y, qs + 3, 1);
      for (const l of opps) if (l.status === "open" && l.forecast !== "omitted" && l.expectedCloseAt && +l.expectedCloseAt >= +qFrom && +l.expectedCloseAt < +qTo) add(leadGroups(l, w.groupBy, defs, l.expectedCloseAt), (l.value * l.probability) / 100);
      break;
    }
    case "quotations_value": case "quotations_count":
      for (const q of quotes) {
        if (!inR(q.date)) continue;
        const k = w.groupBy === "owner" ? q.owner ?? "Unassigned" : w.groupBy === "customer" ? q.customer ?? "—" : w.groupBy === "month" ? monthKey(q.date) : "Total";
        add([k], w.metric === "quotations_value" ? q.total : 1);
      }
      break;
  }

  const avg = m.unit === "days";
  const val = (a: { s: number; n: number; won: number; closed: number }) => (w.metric === "win_rate" ? (a.closed ? (a.won / a.closed) * 100 : 0) : avg ? (a.n ? a.s / a.n : 0) : a.s);
  let rows = [...acc.entries()].map(([label, a]) => ({ label, value: Math.round(val(a) * 10) / 10 }));
  // overall figure computed ungrouped (a deal with two labels must not count twice; averages aren't sums)
  const total = w.groupBy === "none" ? (rows[0]?.value ?? 0) : compute({ ...w, groupBy: "none" }, r, defs, quotes, x).total;

  if (w.groupBy === "month") {
    // continuous run of months so gaps show as zero
    const keys = rows.map((x) => x.label).filter((k) => k !== "—").sort();
    const start = from ? monthKey(from) : keys[0];
    const end = monthKey(Date.now());
    const labels: string[] = [];
    if (start) for (let k = start; k <= end && labels.length < 36; ) { labels.push(k); const [y, mo] = k.split("-").map(Number); k = mo === 12 ? `${y! + 1}-01` : `${y}-${String(mo! + 1).padStart(2, "0")}`; }
    const byK = new Map(rows.map((x) => [x.label, x.value]));
    rows = labels.map((k) => ({ label: monthLabel(k), value: byK.get(k) ?? 0 }));
    return { total, rows, months: { labels: rows.map((x) => x.label), values: rows.map((x) => x.value) } };
  }
  if (w.groupBy === "stage") rows.sort((a, b) => (x.stageSeq.get(a.label) ?? 99) - (x.stageSeq.get(b.label) ?? 99)); // funnel order
  else rows.sort((a, b) => b.value - a.value);
  return { total, rows };
}
