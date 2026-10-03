// KPI / KRA definitions shared by server and client code (no database access here).
import { DAY_MS, fromLocal, localDateKey, localParts, startOfLocalDay, startOfLocalMonth, startOfLocalWeek } from "@/lib/core/tz";

export type KpiPeriod = "daily" | "weekly" | "monthly";
export const PERIOD_LABEL: Record<KpiPeriod, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

/** what the system can count by itself; "manual*" ones are typed in by the sales head or the person */
export const KPI_METRICS = {
  calls: { label: "Calls made", unit: "count", hint: "Call activities marked done" },
  visits: { label: "Site visits", unit: "count", hint: "Visit activities marked done" },
  meetings: { label: "Meetings", unit: "count", hint: "Meeting activities marked done" },
  emails: { label: "Emails logged", unit: "count", hint: "Email activities marked done" },
  whatsapp: { label: "WhatsApp follow-ups", unit: "count", hint: "WhatsApp activities marked done" },
  activities: { label: "All activities done", unit: "count", hint: "Every completed activity" },
  reports_filed: { label: "Days with a daily report", unit: "count", hint: "Days with at least one 'work done' entry" },
  new_leads: { label: "New leads added", unit: "count", hint: "Leads created and owned by the person" },
  new_opportunities: { label: "New opportunities", unit: "count", hint: "Opportunities created and owned by the person" },
  pipeline_added: { label: "Pipeline value added", unit: "inr", hint: "Expected value of new opportunities" },
  quotations: { label: "Quotations sent", unit: "count", hint: "Quotations dated in the period (not drafts)" },
  quotation_value: { label: "Quotation value", unit: "inr", hint: "Total of those quotations" },
  orders_won: { label: "Orders won", unit: "count", hint: "Opportunities marked won" },
  order_value: { label: "Order value won", unit: "inr", hint: "Value of opportunities won" },
  manual: { label: "Entered by hand (number)", unit: "count", hint: "You or the person types the achieved figure" },
  manual_inr: { label: "Entered by hand (₹)", unit: "inr", hint: "e.g. collections — typed in by hand" },
} as const;
export type KpiMetric = keyof typeof KPI_METRICS;
export const isManual = (m: string) => m === "manual" || m === "manual_inr";
export const metricMeta = (m: string) => KPI_METRICS[m as KpiMetric] ?? KPI_METRICS.manual;

export function periodRange(period: KpiPeriod, anchor: Date | number) {
  const from = period === "daily" ? startOfLocalDay(anchor) : period === "weekly" ? startOfLocalWeek(anchor) : startOfLocalMonth(anchor);
  let to: Date;
  if (period === "monthly") { const p = localParts(from); to = fromLocal(p.y, p.m + 1, 1); }
  else to = new Date(+from + (period === "daily" ? 1 : 7) * DAY_MS);
  const key = period === "monthly" ? localDateKey(from).slice(0, 7) : localDateKey(from);
  return { from, to, key };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function periodLabel(period: KpiPeriod, from: Date) {
  const p = localParts(from);
  if (period === "monthly") return `${MONTHS[p.m]} ${p.y}`;
  if (period === "daily") return `${p.d} ${MONTHS[p.m]} ${p.y}`;
  const e = localParts(+from + 6 * DAY_MS);
  return `Week of ${p.d} ${MONTHS[p.m]}${e.m !== p.m ? ` – ${e.d} ${MONTHS[e.m]}` : `–${e.d}`}`;
}
/** move the anchor one period back/forward */
export function shiftPeriod(period: KpiPeriod, from: Date, delta: number) {
  if (period === "monthly") { const p = localParts(from); return fromLocal(p.y, p.m + delta, 1); }
  return new Date(+from + delta * (period === "daily" ? 1 : 7) * DAY_MS);
}

/** progress colour: on track ≥100 %, close ≥60 %, behind below. Daily/weekly figures mid-period are judged pro-rata. */
export function kpiTone(actual: number, target: number) {
  if (!target) return { pct: 0, bar: "bg-slate-300", text: "text-slate-500", label: "—" };
  const pct = Math.round((actual / target) * 100);
  return pct >= 100 ? { pct, bar: "bg-emerald-500", text: "text-emerald-700", label: "Achieved" }
    : pct >= 60 ? { pct, bar: "bg-amber-400", text: "text-amber-700", label: "Close" }
    : { pct, bar: "bg-rose-500", text: "text-rose-700", label: "Behind" };
}
