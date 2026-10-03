import type { ActivityType } from "@/db/crm";

const STAGE_COLORS: Record<string, { dot: string; bar: string; soft: string }> = {
  sky: { dot: "bg-sky-500", bar: "bg-sky-500", soft: "bg-sky-50 text-sky-700" },
  indigo: { dot: "bg-indigo-500", bar: "bg-indigo-500", soft: "bg-indigo-50 text-indigo-700" },
  red: { dot: "bg-red-500", bar: "bg-red-500", soft: "bg-red-50 text-red-700" },
  violet: { dot: "bg-violet-500", bar: "bg-violet-500", soft: "bg-violet-50 text-violet-700" },
  amber: { dot: "bg-amber-500", bar: "bg-amber-500", soft: "bg-amber-50 text-amber-800" },
  slate: { dot: "bg-slate-400", bar: "bg-slate-400", soft: "bg-slate-100 text-slate-600" },
  emerald: { dot: "bg-emerald-500", bar: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700" },
};
export const stageColor = (c: string) => STAGE_COLORS[c] ?? STAGE_COLORS.slate!;

export const ACTIVITY_META: Record<ActivityType, { label: string; emoji: string }> = {
  call: { label: "Call", emoji: "📞" },
  meeting: { label: "Meeting", emoji: "🤝" },
  visit: { label: "Site visit", emoji: "🏭" },
  email: { label: "Email", emoji: "✉️" },
  whatsapp: { label: "WhatsApp", emoji: "💬" },
  todo: { label: "To-do", emoji: "✅" },
};

export const LOST_REASONS = ["Price too high", "Lost to competitor", "Project dropped / postponed", "No budget", "Technical mismatch", "No response", "Other"];
export const LEAD_SOURCES = ["Referral", "Website", "Existing customer", "Exhibition", "Cold call", "Consultant", "Other"];

export const quoteRef = (n: string, rev: number) => (rev ? `${n} R${rev}` : n);

export const tagList = (t: string | null) => (t ? t.split(",").map((x) => x.trim()).filter(Boolean) : []);

// client-safe copy (avoid importing the db schema into browser bundles)
export const ACTIVITY_TYPE_LIST = ["call", "meeting", "visit", "email", "whatsapp", "todo"] as const;

export const PROPOSAL_META: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-600" },
  preparing: { label: "Preparing", cls: "bg-amber-50 text-amber-800" },
  submitted: { label: "Submitted", cls: "bg-sky-50 text-sky-700" },
  revised: { label: "Revised & resubmitted", cls: "bg-indigo-50 text-indigo-700" },
  under_negotiation: { label: "Under negotiation", cls: "bg-violet-50 text-violet-700" },
  accepted: { label: "Accepted", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-700" },
};

// ---------- Labels (tags) ----------
export const TAG_GROUP_LIST = ["Geography", "Customer", "Product", "Temperature", "Order", "Other"] as const;
export type TagDef = { name: string; group: string; color: string };
export const TAG_COLORS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  pink: "bg-pink-50 text-pink-700 ring-pink-200",
};
export const TAG_GROUP_COLOR: Record<string, string> = { Geography: "sky", Customer: "violet", Product: "teal", Temperature: "amber", Order: "emerald", Other: "slate" };
export const tagCls = (name: string, defs: TagDef[]) => {
  const d = defs.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return TAG_COLORS[d?.color ?? (/^OR FY/i.test(name) ? "emerald" : "slate")] ?? TAG_COLORS.slate!;
};
export const joinTags = (list: string[]) => [...new Map(list.map((t) => [t.trim().toLowerCase(), t.trim()])).values()].filter(Boolean).join(", ") || null;

/** Indian financial year label for an order date, e.g. "OR FY26-27" for 2 Oct 2026 */
export function orderTag(d: Date) {
  const ist = new Date(+d + 330 * 60_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `OR FY${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}

// ---------- Age / turnaround ----------
export const daysBetween = (a: Date | number, b: Date | number) => Math.max(0, Math.floor((+b - +a) / 86_400_000));
export const ageTone = (days: number) => (days > 90 ? "bg-red-50 text-red-700" : days > 45 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600");

/** contact fields every opportunity should have; returns the missing ones */
export function missingContact(l: { contactName: string | null; phone: string | null; email: string | null; address: string | null }) {
  return ([["contactName", "contact person"], ["phone", "phone"], ["email", "email"], ["address", "address"]] as const).filter(([k]) => !l[k]?.trim()).map(([, label]) => label);
}

// ---- activity status colours, used the same way everywhere (calendar, day view, opportunity history)
export type ActState = "planned" | "overdue" | "done";
const IST = 330 * 60_000;
/** done → green · past its time and not done → red · still to come → blue. Untimed (midnight) items turn red the day after. */
export function actState(a: { dueAt: Date | null; doneAt: Date | null }, now = Date.now()): ActState {
  if (a.doneAt) return "done";
  if (!a.dueAt) return "planned";
  const due = +new Date(a.dueAt);
  const untimed = (due + IST) % 86_400_000 === 0;
  const todayStart = now - ((now + IST) % 86_400_000);
  return (untimed ? due < todayStart : due < now) ? "overdue" : "planned";
}
export const ACT_STATE: Record<ActState, { label: string; chip: string; block: string; dot: string; text: string }> = {
  planned: { label: "Planned", chip: "bg-sky-50 text-sky-900 ring-1 ring-inset ring-sky-200", block: "bg-sky-50 border-sky-500 text-sky-900", dot: "bg-sky-500", text: "text-sky-700" },
  done: { label: "Done", chip: "bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200", block: "bg-emerald-50 border-emerald-500 text-emerald-900", dot: "bg-emerald-500", text: "text-emerald-700" },
  overdue: { label: "Overdue — report pending", chip: "bg-rose-50 text-rose-900 ring-1 ring-inset ring-rose-200", block: "bg-rose-50 border-rose-500 text-rose-900", dot: "bg-rose-500", text: "text-rose-700" },
};
export const EVENT_CLS = "bg-violet-50 border-violet-400 text-violet-900";

// ---- Raybon structure: business lines and forecast categories
export const SEGMENTS = ["Water treatment (RO / ZLD)", "Membranes & spares", "Chemicals", "O&M / AMC", "Evaporators / MEE"];
export const FORECAST_META: Record<string, { label: string; cls: string; hint: string }> = {
  commit: { label: "Commit", cls: "bg-emerald-50 text-emerald-800", hint: "Will close in the month shown" },
  best_case: { label: "Best case", cls: "bg-sky-50 text-sky-800", hint: "Could close if things go well" },
  pipeline: { label: "Pipeline", cls: "bg-slate-100 text-slate-700", hint: "Early — counted only as weighted value" },
  omitted: { label: "Omitted", cls: "bg-slate-50 text-slate-400", hint: "Left out of the forecast" },
};
export const TRIAL_STATUS_META: Record<string, { label: string; cls: string }> = {
  planned: { label: "Planned", cls: "bg-sky-50 text-sky-800" },
  running: { label: "Running", cls: "bg-amber-50 text-amber-800" },
  success: { label: "Successful", cls: "bg-emerald-50 text-emerald-800" },
  failed: { label: "Failed", cls: "bg-rose-50 text-rose-800" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
};
/** suggested pipeline for an industrial B2B sale */
export const RAYBON_STAGES = [
  { name: "Enquiry", probability: 10, color: "sky" },
  { name: "Technical evaluation", probability: 20, color: "indigo" },
  { name: "Trial", probability: 35, color: "violet" },
  { name: "Quotation", probability: 50, color: "amber" },
  { name: "Negotiation", probability: 70, color: "red" },
];
export const TRIAL_KINDS = ["Water analysis", "Jar test", "Sample trial", "Pilot trial", "Plant trial", "Membrane autopsy"];
