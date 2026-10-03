// Opportunity & enquiry scoring — transparent rules, every point explained. Pure, unit tested.
export type ScoreInput = {
  probability: number; value: number; createdAt: Date; lastTouch: Date | null; recentActivities: number; overdue: number;
  proposalStatus: string; trials: { status: string }[]; repeatCustomer: boolean; tags: string | null; contactComplete: boolean;
};
export type Score = { score: number; band: "A" | "B" | "C"; reasons: { pts: number; why: string }[] };

const days = (from: Date | number, now: number) => Math.floor((now - +from) / 86_400_000);

export function scoreOpportunity(x: ScoreInput, now = Date.now()): Score {
  const r: { pts: number; why: string }[] = [];
  const add = (pts: number, why: string) => { if (pts) r.push({ pts: Math.round(pts), why }); };
  add(x.probability * 0.25, `stage probability ${x.probability}%`);
  add(x.value >= 5e7 ? 15 : x.value >= 1e7 ? 12 : x.value >= 25e5 ? 8 : x.value >= 5e5 ? 4 : 1, "deal size");
  const touch = x.lastTouch ? days(x.lastTouch, now) : days(x.createdAt, now);
  add(touch <= 7 ? 20 : touch <= 14 ? 14 : touch <= 30 ? 7 : touch > 60 ? -10 : 0, x.lastTouch ? `last contact ${touch} days ago` : `no contact since created ${touch} days ago`);
  add(Math.min(10, x.recentActivities * 2.5), `${x.recentActivities} activities in 30 days`);
  if (x.trials.some((t) => t.status === "success")) add(10, "successful trial");
  else if (x.trials.some((t) => t.status === "running" || t.status === "planned")) add(4, "trial in progress");
  else if (x.trials.some((t) => t.status === "failed")) add(-5, "trial failed");
  add(x.proposalStatus === "accepted" ? 10 : ["submitted", "revised", "under_negotiation"].includes(x.proposalStatus) ? 6 : 0, "proposal stage");
  if (x.repeatCustomer) add(8, "repeat customer");
  const tags = (x.tags ?? "").toLowerCase();
  add(/\bhot\b/.test(tags) ? 8 : /\bwarm\b/.test(tags) ? 3 : /\bcold\b/.test(tags) ? -5 : 0, "Hot / Warm / Cold label");
  if (x.overdue) add(-8, `${x.overdue} overdue follow-up(s)`);
  if (x.contactComplete) add(3, "contact details complete");
  if (days(x.createdAt, now) > 180) add(-5, "open over 6 months");
  const score = Math.max(0, Math.min(100, r.reduce((a, b) => a + b.pts, 0)));
  return { score, band: score >= 70 ? "A" : score >= 45 ? "B" : "C", reasons: r.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)) };
}

const FREE_MAIL = /@(gmail|yahoo|outlook|hotmail|rediffmail|icloud|live)\./i;
export function scoreEnquiry(e: { company: string | null; phone: string | null; email: string | null; product: string | null; message: string | null; customerId: number | null }): Score {
  const r: { pts: number; why: string }[] = [];
  const add = (pts: number, why: string) => { if (pts) r.push({ pts, why }); };
  const msg = e.message ?? "";
  if (e.customerId) add(20, "existing customer");
  if (e.company) add(15, "company named");
  if (e.phone) add(10, "phone given");
  if (e.email) add(e.email && !FREE_MAIL.test(e.email) ? 15 : 5, e.email && !FREE_MAIL.test(e.email) ? "company email" : "email given");
  if (e.product) add(10, "product chosen");
  if (/\b\d+(\.\d+)?\s*(kld|klpd|m3|m³|cmd|tpd|lph|mld|ppm)\b/i.test(msg)) add(15, "capacity / specs given");
  if (/urgent|immediate|asap|tender|budgetary|quotation|offer/i.test(msg)) add(10, "asks for an offer / urgent");
  if (msg.length > 80) add(5, "detailed requirement");
  const score = Math.min(100, r.reduce((a, b) => a + b.pts, 0));
  return { score, band: score >= 60 ? "A" : score >= 35 ? "B" : "C", reasons: r };
}
