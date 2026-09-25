const CLS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  sent: "bg-sky-50 text-sky-700 ring-sky-200",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
};
export function QuoteStatus({ s }: { s: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${CLS[s] ?? CLS.draft}`}>{s}</span>;
}
