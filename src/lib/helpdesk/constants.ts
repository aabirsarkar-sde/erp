import type { Stage } from "@/db/schema";

export const STAGE_META: Record<Stage, { label: string; cls: string; dot: string }> = {
  new: { label: "New", cls: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  in_progress: { label: "In process", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  waiting: { label: "Awaiting", cls: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  resolved: { label: "Done", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  closed: { label: "Done (archived)", cls: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export const OPEN_STAGES: Stage[] = ["new", "in_progress", "waiting"];

export const PRIORITIES = [
  { value: 0, label: "Low", cls: "text-slate-500" },
  { value: 1, label: "Normal", cls: "text-slate-700" },
  { value: 2, label: "High", cls: "text-orange-600" },
  { value: 3, label: "Urgent", cls: "text-red-600" },
] as const;

// Standard complaint types (from the client's workflow)
export const COMPLAINT_TYPES = ["Electrical", "Mechanical", "Feed water quality", "Instrumentation", "Membrane", "Manpower", "Other"] as const;
export const CATEGORIES: string[] = [...COMPLAINT_TYPES];
export const TYPE_META: Record<string, { icon: string; chip: string }> = {
  Electrical: { icon: "⚡", chip: "bg-yellow-50 text-yellow-800 ring-yellow-200" },
  Mechanical: { icon: "⚙️", chip: "bg-slate-100 text-slate-700 ring-slate-300" },
  "Feed water quality": { icon: "💧", chip: "bg-sky-50 text-sky-700 ring-sky-200" },
  Instrumentation: { icon: "📟", chip: "bg-violet-50 text-violet-700 ring-violet-200" },
  Membrane: { icon: "🧪", chip: "bg-teal-50 text-teal-700 ring-teal-200" },
  Manpower: { icon: "👷", chip: "bg-orange-50 text-orange-700 ring-orange-200" },
  Other: { icon: "📋", chip: "bg-slate-50 text-slate-600 ring-slate-200" },
};
export const typeMeta = (t: string | null | undefined) => TYPE_META[t ?? "Other"] ?? TYPE_META.Other!;

export const ticketRef = (id: number) => `TKT-${String(id).padStart(4, "0")}`;
