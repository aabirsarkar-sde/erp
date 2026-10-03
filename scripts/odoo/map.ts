// Pure helpers for turning Odoo records into Raybon rows — unit tested in tests/unit/odoo-map.test.ts

/** Odoo many2one: [id, "Display name"] | false */
export type M2O = [number, string] | false | null | undefined;
export const m2oId = (v: M2O) => (Array.isArray(v) ? v[0] : null);
export const m2oName = (v: M2O) => (Array.isArray(v) ? v[1] : null);
export const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Odoo datetimes are UTC "YYYY-MM-DD HH:MM:SS"; dates are "YYYY-MM-DD" */
export function odooDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.length <= 10 ? `${v}T00:00:00Z` : `${v.replace(" ", "T")}Z`);
  return Number.isNaN(+d) ? null : d;
}

/** chatter/description HTML → readable text */
export function htmlToText(html: unknown): string | null {
  if (typeof html !== "string" || !html.trim()) return null;
  const t = html
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t || null;
}

/** won / lost / open, across Odoo versions (is_won stage, active flag, probability) */
export function leadStatus(l: { active?: boolean; probability?: number; stage_is_won?: boolean; won_status?: string }): "open" | "won" | "lost" {
  if (l.won_status === "won" || l.stage_is_won) return "won";
  if (l.won_status === "lost" || l.active === false) return "lost";
  return "open";
}

/** Odoo activity type name → our activity type */
export function activityType(name: string | null): "call" | "meeting" | "visit" | "email" | "whatsapp" | "todo" {
  const n = (name ?? "").toLowerCase();
  if (/call|phone/.test(n)) return "call";
  if (/visit|site/.test(n)) return "visit";
  if (/meet/.test(n)) return "meeting";
  if (/whats/.test(n)) return "whatsapp";
  if (/mail/.test(n)) return "email";
  return "todo";
}

/** helpdesk stage name → our ticket stage */
export function ticketStage(name: string | null, folded?: boolean): "new" | "in_progress" | "waiting" | "resolved" | "closed" {
  const n = (name ?? "").toLowerCase();
  if (/cancel|closed|archiv/.test(n)) return "closed";
  if (/solved|resolved|done|complete/.test(n) || folded) return "resolved";
  if (/wait|hold|pending|customer/.test(n)) return "waiting";
  if (/progress|assigned|working|open/.test(n)) return "in_progress";
  return "new";
}

/** sale.order state → quotation status */
export const quoteStatus = (s: unknown): "draft" | "sent" | "accepted" | "rejected" => (s === "sale" || s === "done" ? "accepted" : s === "cancel" ? "rejected" : s === "sent" ? "sent" : "draft");

/** Odoo priority "0".."3" (stars) → 0..3 */
export const stars = (p: unknown) => Math.max(0, Math.min(3, Number(p) || 0));

export const joinAddress = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(", ") || null;
