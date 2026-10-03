// Saved dashboards — widget vocabulary shared by the builder (client) and the engine (server).

export const W_METRICS = {
  pipeline_value: { label: "Open pipeline value", unit: "inr", src: "open" },
  weighted_pipeline: { label: "Weighted pipeline value", unit: "inr", src: "open" },
  open_count: { label: "Open opportunities", unit: "count", src: "open" },
  new_opportunities: { label: "New opportunities", unit: "count", src: "created" },
  new_value: { label: "Value of new opportunities", unit: "inr", src: "created" },
  won_value: { label: "Order value won", unit: "inr", src: "won" },
  won_count: { label: "Orders won", unit: "count", src: "won" },
  lost_count: { label: "Opportunities lost", unit: "count", src: "lost" },
  win_rate: { label: "Win rate %", unit: "pct", src: "closed" },
  avg_tat: { label: "Avg days to win (TAT)", unit: "days", src: "won" },
  avg_age: { label: "Avg age of open deals (days)", unit: "days", src: "open" },
  activities: { label: "Activities done", unit: "count", src: "acts" },
  visits: { label: "Site visits", unit: "count", src: "acts" },
  calls: { label: "Calls", unit: "count", src: "acts" },
  quotations_value: { label: "Quotation value", unit: "inr", src: "quotes" },
  quotations_count: { label: "Quotations sent", unit: "count", src: "quotes" },
  quotes_pending: { label: "Quotations awaiting decision (₹)", unit: "inr", src: "pending" },
  overdue_followups: { label: "Overdue follow-ups", unit: "count", src: "overdue" },
  new_enquiries: { label: "New enquiries (not handled)", unit: "count", src: "enquiries" },
  forecast_quarter: { label: "Forecast this quarter (weighted)", unit: "inr", src: "forecast" },
  orders_value: { label: "Orders booked (₹)", unit: "inr", src: "orders" },
} as const;
export type WMetric = keyof typeof W_METRICS;

export const W_GROUPS = {
  none: "Total only",
  owner: "Salesperson",
  product: "Product",
  geography: "Geography",
  temperature: "Hot / Warm / Cold",
  stage: "Stage",
  customer: "Customer",
  source: "Lead source",
  label: "Label",
  month: "Month",
  type: "Activity type",
  segment: "Business line",
  source_e: "Enquiry source",
} as const;
export type WGroup = keyof typeof W_GROUPS;

export const W_CHARTS = { number: "Big number", bar: "Bar chart", hbar: "Horizontal bars", line: "Line (by month)", table: "Table" } as const;
export type WChart = keyof typeof W_CHARTS;

export const W_RANGES = { "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months", fy: "This financial year", month: "This month", all: "All time" } as const;
export type WRange = keyof typeof W_RANGES;

export type Widget = { id: string; title: string; metric: WMetric; groupBy: WGroup; chart: WChart; range: WRange; size?: "half" | "full" };

/** which groupings make sense for a metric */
export function groupsFor(m: WMetric): WGroup[] {
  const src = W_METRICS[m].src as string;
  if (src === "overdue") return ["none", "owner", "customer", "type"];
  if (src === "pending") return ["none", "owner", "customer", "month"];
  if (src === "enquiries") return ["none", "source_e", "month"];
  if (src === "orders") return ["none", "owner", "customer", "month"];
  if (src === "acts") return ["none", "owner", "type", "month", "customer"];
  if (src === "quotes") return ["none", "owner", "customer", "month"];
  return ["none", "owner", "product", "segment", "geography", "temperature", "stage", "customer", "source", "label", "month"];
}

export const newWidgetId = () => Math.random().toString(36).slice(2, 9);

/** sensible starter boards for someone opening Dashboards the first time */
export const STARTER: { name: string; widgets: Omit<Widget, "id">[] }[] = [
  {
    name: "CEO view",
    widgets: [
      { title: "Open pipeline", metric: "pipeline_value", groupBy: "none", chart: "number", range: "all" },
      { title: "Forecast this quarter", metric: "forecast_quarter", groupBy: "none", chart: "number", range: "all" },
      { title: "Quotations pending", metric: "quotes_pending", groupBy: "none", chart: "number", range: "all" },
      { title: "Overdue follow-ups", metric: "overdue_followups", groupBy: "none", chart: "number", range: "all" },
      { title: "Sales funnel (open value by stage)", metric: "pipeline_value", groupBy: "stage", chart: "hbar", range: "all", size: "half" },
      { title: "Overdue follow-ups by salesperson", metric: "overdue_followups", groupBy: "owner", chart: "hbar", range: "all", size: "half" },
      { title: "Quotations awaiting decision", metric: "quotes_pending", groupBy: "customer", chart: "table", range: "all", size: "half" },
      { title: "Win rate by salesperson", metric: "win_rate", groupBy: "owner", chart: "bar", range: "fy", size: "half" },
      { title: "Orders booked by month", metric: "orders_value", groupBy: "month", chart: "line", range: "365", size: "full" },
      { title: "New enquiries", metric: "new_enquiries", groupBy: "source_e", chart: "hbar", range: "all", size: "half" },
      { title: "Pipeline by business line", metric: "pipeline_value", groupBy: "segment", chart: "hbar", range: "all", size: "half" },
    ],
  },
  {
    name: "Sales overview",
    widgets: [
      { title: "Open pipeline", metric: "pipeline_value", groupBy: "none", chart: "number", range: "all" },
      { title: "Won this FY", metric: "won_value", groupBy: "none", chart: "number", range: "fy" },
      { title: "Win rate", metric: "win_rate", groupBy: "none", chart: "number", range: "fy" },
      { title: "Avg days to win", metric: "avg_tat", groupBy: "none", chart: "number", range: "fy" },
      { title: "Pipeline by salesperson", metric: "pipeline_value", groupBy: "owner", chart: "hbar", range: "all", size: "half" },
      { title: "Pipeline by product", metric: "pipeline_value", groupBy: "product", chart: "hbar", range: "all", size: "half" },
      { title: "Orders won by month", metric: "won_value", groupBy: "month", chart: "line", range: "365", size: "full" },
    ],
  },
];
