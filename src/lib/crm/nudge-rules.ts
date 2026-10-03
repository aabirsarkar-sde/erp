// The follow-up rules behind the AI suggestions — pure, unit tested.
import { DAY_MS, startOfLocalDay } from "@/lib/core/tz";
import { ACTIVITY_META } from "@/lib/crm/meta";

export type NudgeRule = "overdue" | "quote" | "jartest" | "proposal" | "silence";
export type Nudge = { userId: number; leadId: number; rule: NudgeRule; days: number; customer: string; title: string; contact: string | null; phone: string | null; email: string | null; value: number; fact: string };

export const NUDGE_DEFAULTS = { quoteDays: 7, silenceDays: 14, perPerson: 5 };
/** pure rule engine — exported for tests */
export function pickNudge(
  l: { createdAt: Date; proposalStatus: string },
  acts: { type: string; summary: string; discussion: string | null; outcome: string | null; dueAt: Date | null; doneAt: Date | null }[],
  lastQuote: { date: Date; number: string } | null,
  now: number,
  cfg: typeof NUDGE_DEFAULTS,
): { rule: NudgeRule; days: number; fact: string } | null {
  const today = +startOfLocalDay(now);
  const days = (d: Date | number) => Math.max(0, Math.floor((today - +startOfLocalDay(d)) / DAY_MS));
  const planned = acts.filter((a) => !a.doneAt && a.dueAt);
  const overdue = planned.filter((a) => +a.dueAt! < today).sort((a, b) => +a.dueAt! - +b.dueAt!)[0];
  if (overdue) return { rule: "overdue", days: days(overdue.dueAt!), fact: `${ACTIVITY_META[overdue.type as keyof typeof ACTIVITY_META]?.label ?? "Activity"} "${overdue.summary}" was due ${days(overdue.dueAt!)} day(s) ago and isn't reported` };
  if (planned.some((a) => +a.dueAt! >= today)) return null; // something is already planned
  const done = acts.filter((a) => a.doneAt).sort((a, b) => +b.doneAt! - +a.doneAt!);
  const last = done[0];
  const lastTouch = Math.max(+l.createdAt, last ? +last.doneAt! : 0);
  if (lastQuote && +lastQuote.date >= lastTouch - DAY_MS && days(lastQuote.date) >= cfg.quoteDays) return { rule: "quote", days: days(lastQuote.date), fact: `quotation ${lastQuote.number} was sent ${days(lastQuote.date)} days ago with no follow-up since` };
  const jar = done.find((a) => /jar\s*test|trial|pilot|sample/i.test(`${a.summary} ${a.discussion ?? ""} ${a.outcome ?? ""}`));
  if (jar && jar === last && days(jar.doneAt!) >= cfg.quoteDays) return { rule: "jartest", days: days(jar.doneAt!), fact: `the last contact was "${jar.summary}" (jar test / trial) ${days(jar.doneAt!)} days ago` };
  if (["submitted", "revised"].includes(l.proposalStatus) && days(lastTouch) >= cfg.quoteDays) return { rule: "proposal", days: days(lastTouch), fact: `the proposal is submitted and nobody has followed up for ${days(lastTouch)} days` };
  if (days(lastTouch) >= cfg.silenceDays) return { rule: "silence", days: days(lastTouch), fact: last ? `the last contact was "${last.summary}" ${days(lastTouch)} days ago` : `nobody has contacted them since the opportunity was created ${days(lastTouch)} days ago` };
  return null;
}

