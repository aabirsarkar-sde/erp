import { getCurrentUser } from "@/lib/auth";
import { listTickets } from "@/lib/queries";
import { addSheet, newWorkbook, xlsxResponse } from "@/lib/xlsx";
import { PRIORITIES, STAGE_META, ticketRef } from "@/lib/constants";
import { fmtTat } from "@/lib/format";

const d = (x: Date | null | undefined) => (x ? new Date(new Date(x).getTime() + 330 * 60_000).toISOString().replace("T", " ").slice(0, 16) : "");

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const f = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await listTickets({ ...f, stage: f.stage ?? "all" }, me, 20000);
  const wb = newWorkbook();
  addSheet(wb, "Tickets", [
    { header: "Ticket", key: "ref", width: 11 }, { header: "Reported", key: "reported", width: 17 }, { header: "Plant no.", key: "plantNo", width: 10 },
    { header: "Plant", key: "plant", width: 28 }, { header: "Customer", key: "customer", width: 30 }, { header: "Zone", key: "zone", width: 14 },
    { header: "City", key: "city", width: 12 }, { header: "State", key: "state", width: 12 }, { header: "Type", key: "type", width: 18 },
    { header: "Priority", key: "priority", width: 9 }, { header: "Status", key: "status", width: 18 }, { header: "Complainant", key: "complainant", width: 20 },
    { header: "Assigned to", key: "assignee", width: 18 }, { header: "Resolved", key: "resolved", width: 17 }, { header: "TAT (hours)", key: "tatH", width: 11, numFmt: "0.0" },
    { header: "TAT", key: "tat", width: 10 }, { header: "Rating", key: "rating", width: 7 }, { header: "Subject", key: "subject", width: 45 },
  ], rows.map((r) => ({
    ref: ticketRef(r.id), reported: d(r.reportedAt ?? r.createdAt), plantNo: r.plantNo, plant: r.plantName, customer: r.customerName, zone: r.teamName,
    city: r.city, state: r.state, type: r.category, priority: PRIORITIES[r.priority]?.label, status: STAGE_META[r.stage].label, complainant: r.complainantName,
    assignee: r.assigneeName, resolved: d(r.resolvedAt), tatH: r.tatMinutes != null ? r.tatMinutes / 60 : "", tat: r.tatMinutes != null ? fmtTat(r.tatMinutes) : "",
    rating: r.csatScore ?? "", subject: r.subject,
  })), "Raybon — Tickets");
  return xlsxResponse(wb, `tickets-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
