import { eq } from "drizzle-orm";
import { db, tickets } from "@/db";
import { PublicShell } from "@/components/ui/public-shell";
import { STAGE_META } from "@/lib/helpdesk/constants";
import { fmtDateTime, fmtTat } from "@/lib/core/format";

export const metadata = { title: "Complaint status" };

export default async function Status({ searchParams }: { searchParams: Promise<{ ref?: string; contact?: string }> }) {
  const { ref, contact } = await searchParams;
  let result: React.ReactNode = null;
  if (ref && contact) {
    const id = Number(ref.replace(/\D/g, ""));
    const t = id ? await db.query.tickets.findFirst({ where: eq(tickets.id, id), with: { assignee: { columns: { name: true } } } }) : null;
    const c = contact.trim().toLowerCase();
    const digits = (x: string) => x.replace(/\D/g, "").slice(-10);
    const match = t && (c.includes("@") ? t.complainantEmail?.toLowerCase() === c : digits(c).length >= 8 && !!t.complainantPhone && digits(t.complainantPhone) === digits(c));
    result = match && t ? (
      <div className="card mt-4 space-y-1.5 p-5 text-sm">
        <div className="flex items-center justify-between"><span className="font-mono font-semibold">{ref.toUpperCase()}</span><span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{STAGE_META[t.stage].label}</span></div>
        <div className="font-medium">{t.subject}</div>
        <div className="text-slate-600">Reported {fmtDateTime(t.reportedAt ?? t.createdAt)}</div>
        <div className="text-slate-600">Engineer: {t.assignee?.name ?? "being assigned"}</div>
        {t.resolvedAt && <div className="text-emerald-700">Resolved {fmtDateTime(t.resolvedAt)} · turn-around {fmtTat(t.tatMinutes)}</div>}
      </div>
    ) : <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">No complaint found with that reference and phone/email.</p>;
  }
  return (
    <PublicShell title="Complaint status">
      <form className="card space-y-3 p-5">
        <input name="ref" required defaultValue={ref} placeholder="Reference, e.g. TKT-0012" className="input font-mono uppercase" />
        <input name="contact" required defaultValue={contact} placeholder="Phone or email used when registering" className="input" />
        <button className="btn-primary w-full">Check status</button>
      </form>
      {result}
      <p className="mt-4 text-center text-xs text-slate-500"><a href="/complaint" className="text-brand-700 underline">Register a new complaint</a></p>
    </PublicShell>
  );
}
