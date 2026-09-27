import { requireUser } from "@/lib/auth";
import { listTickets } from "@/lib/queries";
import { PrintShell } from "@/components/print-shell";
import { STAGE_META, PRIORITIES, ticketRef } from "@/lib/constants";
import { fmtDate, fmtTat } from "@/lib/format";

export const metadata = { title: "Tickets report" };

export default async function PrintTickets({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const rows = await listTickets({ ...sp, stage: sp.stage ?? "open" }, me.id, 2000);
  const done = rows.filter((r) => r.tatMinutes != null);
  const avg = done.length ? done.reduce((a, r) => a + r.tatMinutes!, 0) / done.length : null;
  return (
    <PrintShell title="Tickets report" subtitle={`${rows.length} tickets · avg TAT ${fmtTat(avg)}`} landscape>
      <table className="w-full border-collapse">
        <thead><tr className="bg-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-600">
          {["Ticket", "Reported", "Plant", "Customer", "Zone", "Type", "Priority", "Status", "Complainant", "Assigned", "TAT"].map((h) => <th key={h} className="border border-slate-200 px-1.5 py-1">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="break-inside-avoid align-top">
              <td className="border border-slate-200 px-1.5 py-1 font-mono">{ticketRef(r.id)}</td>
              <td className="whitespace-nowrap border border-slate-200 px-1.5 py-1">{fmtDate(r.reportedAt ?? r.createdAt)}</td>
              <td className="border border-slate-200 px-1.5 py-1">{r.plantNo} {r.plantName}</td>
              <td className="border border-slate-200 px-1.5 py-1">{r.customerName}</td>
              <td className="border border-slate-200 px-1.5 py-1">{r.teamName}</td>
              <td className="border border-slate-200 px-1.5 py-1">{r.category}</td>
              <td className="border border-slate-200 px-1.5 py-1">{PRIORITIES[r.priority]?.label}</td>
              <td className="border border-slate-200 px-1.5 py-1">{STAGE_META[r.stage].label}</td>
              <td className="border border-slate-200 px-1.5 py-1">{r.complainantName}</td>
              <td className="border border-slate-200 px-1.5 py-1">{r.assigneeName ?? "—"}</td>
              <td className="whitespace-nowrap border border-slate-200 px-1.5 py-1">{fmtTat(r.tatMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintShell>
  );
}
