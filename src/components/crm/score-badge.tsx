// Score chip with the reasons on hover — usable from server and client components.
type S = { score: number; band: "A" | "B" | "C"; reasons: { pts: number; why: string }[] };
const CLS = { A: "bg-emerald-600 text-white", B: "bg-amber-400 text-amber-950", C: "bg-slate-200 text-slate-700" };

export function ScoreBadge({ s, compact }: { s: S; compact?: boolean }) {
  const tip = `Score ${s.score}/100\n${s.reasons.map((r) => `${r.pts > 0 ? "+" : ""}${r.pts}  ${r.why}`).join("\n")}`;
  return <span title={tip} data-testid="score" className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${CLS[s.band]}`}>{compact ? s.score : `Score ${s.score}`}</span>;
}
