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
  todo: { label: "To-do", emoji: "✅" },
};

export const LOST_REASONS = ["Price too high", "Lost to competitor", "Project dropped / postponed", "No budget", "Technical mismatch", "No response", "Other"];
export const LEAD_SOURCES = ["Referral", "Website", "Existing customer", "Exhibition", "Cold call", "Consultant", "Other"];

export const quoteRef = (n: string, rev: number) => (rev ? `${n} R${rev}` : n);

export const tagList = (t: string | null) => (t ? t.split(",").map((x) => x.trim()).filter(Boolean) : []);

// client-safe copy (avoid importing the db schema into browser bundles)
export const ACTIVITY_TYPE_LIST = ["call", "meeting", "visit", "email", "todo"] as const;

export const PROPOSAL_META: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-600" },
  preparing: { label: "Preparing", cls: "bg-amber-50 text-amber-800" },
  submitted: { label: "Submitted", cls: "bg-sky-50 text-sky-700" },
  revised: { label: "Revised & resubmitted", cls: "bg-indigo-50 text-indigo-700" },
  under_negotiation: { label: "Under negotiation", cls: "bg-violet-50 text-violet-700" },
  accepted: { label: "Accepted", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-700" },
};
