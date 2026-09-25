import type { Stage } from "@/db/schema";

export const STAGE_META: Record<Stage, { label: string; cls: string; dot: string }> = {
  new: { label: "New", cls: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  waiting: { label: "Waiting on customer", cls: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  resolved: { label: "Resolved", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export const OPEN_STAGES: Stage[] = ["new", "in_progress", "waiting"];

export const PRIORITIES = [
  { value: 0, label: "Low", cls: "text-slate-500" },
  { value: 1, label: "Normal", cls: "text-slate-700" },
  { value: 2, label: "High", cls: "text-orange-600" },
  { value: 3, label: "Urgent", cls: "text-red-600" },
] as const;

export const CATEGORIES = [
  "Plant breakdown",
  "Performance issue",
  "Service visit",
  "Spare parts",
  "Chemical supply",
  "AMC / Warranty",
  "Installation / Commissioning",
  "Query",
  "Other",
];

export const ticketRef = (id: number) => `TKT-${String(id).padStart(4, "0")}`;
