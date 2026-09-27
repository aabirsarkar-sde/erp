import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTickets, lookups, type TicketFilters as F, type TicketRow } from "@/lib/queries";
import { TicketFilters } from "@/components/ticket-filters";
import { PageHeader, StageBadge, PriorityFlag, Avatar, Empty, LinkButton } from "@/components/ui";
import { STAGE_META, ticketRef, typeMeta } from "@/lib/constants";
import { timeAgo, fmtTat, fmtDate } from "@/lib/format";
import { STAGES } from "@/db/schema";
import { IconPlus } from "@/components/icons";

export const metadata = { title: "Tickets" };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const board = sp.view === "board";
  const f: F = { ...sp, stage: board && !sp.stage ? "all" : sp.stage };
  const [rows, lk] = await Promise.all([listTickets(f, me.id), lookups()]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Tickets"
        subtitle={`${rows.length} ticket${rows.length === 1 ? "" : "s"}`}
        actions={<>
          <a href={`/api/export/tickets?${new URLSearchParams(sp as Record<string, string>)}&format=xlsx`} className="btn-secondary">Excel</a>
          <a href={`/print/tickets?${new URLSearchParams(sp as Record<string, string>)}`} target="_blank" className="btn-secondary">PDF</a>
          <LinkButton href="/tickets/new"><IconPlus className="size-4" />New complaint</LinkButton>
        </>}
      />
      <TicketFilters teams={lk.teams} users={lk.users} />
      {rows.length === 0 ? (
        <Empty title="No tickets match these filters" hint="Try clearing a filter or searching for something else." />
      ) : board ? (
        <Board rows={rows} />
      ) : (
        <List rows={rows} />
      )}
    </div>
  );
}

function Overdue({ t }: { t: TicketRow }) {
  const open = t.stage === "new" || t.stage === "in_progress" || t.stage === "waiting";
  if (!open || !t.dueAt || new Date(t.dueAt) > new Date()) return null;
  return <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600">Overdue</span>;
}

function List({ rows }: { rows: TicketRow[] }) {
  return (
    <div className="card overflow-hidden">
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Ticket</th>
            <th className="px-3 py-2.5">Plant / customer</th>
            <th className="px-3 py-2.5">Team</th>
            <th className="px-3 py-2.5">Stage</th>
            <th className="px-3 py-2.5">Priority</th>
            <th className="px-3 py-2.5">Assignee</th>
            <th className="px-4 py-2.5 text-right">Reported · TAT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((t) => (
            <tr key={t.id} className="group relative hover:bg-slate-50">
              <td className="max-w-md px-4 py-3">
                <Link href={`/tickets/${t.id}`} className="block after:absolute after:inset-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium group-hover:text-brand-700">{t.subject}</span>
                    <Overdue t={t} />
                    {!t.firstResponseAt && t.stage === "new" && <span className="size-2 shrink-0 rounded-full bg-amber-400" title="No reply yet" />}
                  </div>
                  <div className="text-xs text-slate-500">{ticketRef(t.id)}{t.category ? ` · ${typeMeta(t.category).icon} ${t.category}` : ""}</div>
                </Link>
              </td>
              <td className="max-w-[16rem] px-3 py-3 text-slate-600"><div className="truncate">{t.plantNo ? <span className="font-mono text-xs font-semibold text-slate-800">{t.plantNo} </span> : null}{t.plantName ?? ""}</div><div className="truncate text-xs text-slate-500">{t.customerName ?? "—"}</div></td>
              <td className="px-3 py-3 text-slate-600">{t.teamName}</td>
              <td className="px-3 py-3"><StageBadge stage={t.stage} /></td>
              <td className="px-3 py-3"><PriorityFlag p={t.priority} /></td>
              <td className="px-3 py-3">
                <span className="flex items-center gap-2 text-slate-600"><Avatar name={t.assigneeName} size="sm" /><span className="truncate">{t.assigneeName ?? "Unassigned"}</span></span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-500">{fmtDate(t.reportedAt ?? t.createdAt)}{t.tatMinutes != null && <div className="font-medium text-emerald-700">TAT {fmtTat(t.tatMinutes)}</div>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((t) => (
          <li key={t.id}>
            <Link href={`/tickets/${t.id}`} className="block px-4 py-3 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium leading-snug">{t.subject}</span>
                <Avatar name={t.assigneeName} size="sm" />
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{ticketRef(t.id)} · {t.plantNo ? `${t.plantNo} · ` : ""}{t.customerName ?? "No customer"} · {t.teamName}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StageBadge stage={t.stage} />
                <PriorityFlag p={t.priority} />
                <Overdue t={t} />
                <span className="ml-auto text-xs text-slate-400">{t.tatMinutes != null ? `TAT ${fmtTat(t.tatMinutes)}` : timeAgo(t.createdAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Board({ rows }: { rows: TicketRow[] }) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      {STAGES.map((s) => {
        const col = rows.filter((r) => r.stage === s);
        return (
          <div key={s} className="w-72 shrink-0 snap-start rounded-xl bg-slate-100/80 p-2">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="flex items-center gap-2 text-sm font-semibold"><span className={`size-2 rounded-full ${STAGE_META[s].dot}`} />{STAGE_META[s].label}</span>
              <span className="text-xs font-medium text-slate-500">{col.length}</span>
            </div>
            <div className="space-y-2">
              {col.map((t) => (
                <Link key={t.id} href={`/tickets/${t.id}`} className="card block p-3 transition hover:border-brand-200 hover:shadow-sm">
                  <div className="text-sm font-medium leading-snug">{t.subject}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{t.customerName ?? "No customer"}</div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-2"><PriorityFlag p={t.priority} withLabel={false} /><span className="text-[11px] text-slate-400">{ticketRef(t.id)}</span><Overdue t={t} /></span>
                    <Avatar name={t.assigneeName} size="sm" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
