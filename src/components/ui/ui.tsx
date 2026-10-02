import Link from "next/link";
import { STAGE_META, PRIORITIES } from "@/lib/helpdesk/constants";
import { initials } from "@/lib/core/format";
import type { Stage } from "@/db/schema";

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  const m = STAGE_META[stage];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${m.cls}`}>
      <span className={`size-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export function PriorityFlag({ p, withLabel = true }: { p: number; withLabel?: boolean }) {
  const m = PRIORITIES[p] ?? PRIORITIES[1];
  const bars = [0, 1, 2].map((i) => (
    <span key={i} className={`w-1 rounded-sm ${i < p ? "bg-current" : "bg-slate-200"}`} style={{ height: 5 + i * 3 }} />
  ));
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.cls}`} title={`${m.label} priority`}>
      <span className="flex items-end gap-0.5">{bars}</span>
      {withLabel && m.label}
    </span>
  );
}

const AV = ["bg-rose-500", "bg-amber-500", "bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-teal-600", "bg-fuchsia-600"];
export function Avatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" }) {
  const c = name ? AV[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length] : "bg-slate-300";
  const s = size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${c} ${s}`} title={name ?? "Unassigned"}>
      {name ? initials(name) : "–"}
    </span>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Link href={href} className={`btn-${variant}`}>
      {children}
    </Link>
  );
}

export function Stat({ label, value, href, tone = "slate" }: { label: string; value: number; href: string; tone?: "slate" | "red" | "amber" | "brand" }) {
  const t = { slate: "text-slate-900", red: "text-red-600", amber: "text-amber-600", brand: "text-brand-700" }[tone];
  return (
    <Link href={href} className="card group p-4 transition hover:border-brand-200 hover:shadow-sm">
      <div className={`text-2xl font-semibold tabular-nums ${t}`}>{value}</div>
      <div className="mt-0.5 text-sm text-slate-500 group-hover:text-slate-700">{label}</div>
    </Link>
  );
}
