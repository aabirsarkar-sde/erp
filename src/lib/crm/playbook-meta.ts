// Playbook steps — shared by the editor (client) and the engine (server). Pure, unit tested.
export const STEP_KINDS = [["task", "Task"], ["call", "Call"], ["visit", "Site visit"], ["meeting", "Meeting"], ["email", "Email"], ["whatsapp", "WhatsApp"], ["todo", "To-do (calendar)"]] as const;
export type StepKind = (typeof STEP_KINDS)[number][0];
export type PlaybookStep = { title: string; days: number; kind: StepKind; assign: "owner" | "creator" | number };

export function parseSteps(s: string | null | undefined): PlaybookStep[] {
  try {
    const v = JSON.parse(s ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.title === "string" && x.title.trim()).map((x) => ({ title: String(x.title).slice(0, 200), days: Math.max(0, Math.min(365, Number(x.days) || 0)), kind: STEP_KINDS.some(([k]) => k === x.kind) ? x.kind : "task", assign: x.assign === "creator" || typeof x.assign === "number" ? x.assign : "owner" })) : [];
  } catch { return []; }
}

/** does a playbook apply to this opportunity? words are comma separated, any one matching is enough; blank matches everything */
export function playbookMatches(pb: { matchProduct: string | null; matchSegment: string | null }, l: { title: string; product: string | null; application: string | null; segment: string | null; description?: string | null }) {
  const words = (pb.matchProduct ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  const hay = `${l.title} ${l.product ?? ""} ${l.application ?? ""} ${l.description ?? ""}`.toLowerCase();
  if (words.length && !words.some((w) => hay.includes(w))) return false;
  const seg = (pb.matchSegment ?? "").trim().toLowerCase();
  if (seg && !(l.segment ?? "").toLowerCase().includes(seg)) return false;
  return true;
}
