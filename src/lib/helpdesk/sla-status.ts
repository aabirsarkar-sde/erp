// Pure helpers (usable on client and server)
export type SlaState = { label: string; tone: "ok" | "warn" | "bad" | "muted" } | null;

const H = 3600e3;
function span(ms: number) {
  const h = Math.abs(ms) / H;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function responseSla(t: { createdAt: Date; firstResponseAt: Date | null; priority: number; stage: string }, responseHours: number[]): SlaState {
  const target = new Date(t.createdAt).getTime() + (responseHours[t.priority] ?? 24) * H;
  if (t.firstResponseAt) {
    const late = new Date(t.firstResponseAt).getTime() > target;
    return { label: late ? "Response SLA missed" : "Responded in SLA", tone: late ? "bad" : "ok" };
  }
  if (t.stage === "resolved" || t.stage === "closed") return null;
  const left = target - Date.now();
  if (left < 0) return { label: `Reply overdue ${span(left)}`, tone: "bad" };
  return { label: `Reply due in ${span(left)}`, tone: left < 2 * H ? "warn" : "muted" };
}

export const TONE_CLS = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
  muted: "bg-slate-100 text-slate-600",
} as const;
