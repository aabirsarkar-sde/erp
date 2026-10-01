import { getCurrentUser } from "@/lib/auth";
import { helpdeskRows, groupBy, summary } from "@/lib/helpdesk-stats";
import { addSheet, newWorkbook, xlsxResponse } from "@/lib/xlsx";
import { STAGE_META, ticketRef } from "@/lib/constants";
import { fmtTat } from "@/lib/format";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const f = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await helpdeskRows(f, me);
  const s = summary(rows);
  const wb = newWorkbook();
  addSheet(wb, "Summary", [{ header: "Measure", key: "k", width: 26 }, { header: "Value", key: "v", width: 18 }], [
    { k: "Total tickets", v: s.total }, { k: "Open", v: s.open }, { k: "Done", v: s.closed },
    { k: "Average TAT", v: fmtTat(s.avgTat) }, { k: "Average TAT (hours)", v: s.avgTat != null ? +(s.avgTat / 60).toFixed(1) : "" },
    { k: "Median TAT", v: fmtTat(s.medianTat) }, { k: "Customer rating (avg of 5)", v: s.csat != null ? +s.csat.toFixed(2) : "" },
  ], "Helpdesk dashboard — summary");
  const gcols = (first: string) => [
    { header: first, key: "label", width: 30 }, { header: "Total", key: "total" }, { header: "Open", key: "open" }, { header: "Closed / solved", key: "closed", width: 15 },
    { header: "Avg TAT (hours)", key: "tatH", width: 15, numFmt: "0.0" }, { header: "Avg TAT", key: "tat" }, { header: "Rating", key: "csat", numFmt: "0.0" },
  ];
  for (const [view, name, first] of [["type", "By type", "Type"], ["zone", "By zone", "Zone"], ["geo", "By geography", "City / state"], ["employee", "By employee", "Employee"], ["plant", "By plant", "Plant"]] as const) {
    addSheet(wb, name, gcols(first), groupBy(rows, view).map((g) => ({ ...g, tatH: g.avgTat != null ? g.avgTat / 60 : "", tat: fmtTat(g.avgTat), csat: g.csat ?? "" })));
  }
  addSheet(wb, "Tickets", [
    { header: "Ticket", key: "ref", width: 11 }, { header: "Type", key: "type", width: 18 }, { header: "Zone", key: "zone", width: 14 }, { header: "Plant", key: "plant", width: 26 },
    { header: "Customer", key: "customer", width: 28 }, { header: "Status", key: "status", width: 16 }, { header: "Solved by", key: "closer", width: 18 },
    { header: "TAT (hours)", key: "tatH", width: 11, numFmt: "0.0" }, { header: "Subject", key: "subject", width: 45 },
  ], rows.map((r) => ({ ref: ticketRef(r.id), type: r.type, zone: r.zone, plant: r.plantNo ? `${r.plantNo} ${r.plantName}` : "", customer: r.customer, status: STAGE_META[r.stage].label, closer: r.closer ?? r.assignee ?? "", tatH: r.tat != null ? r.tat / 60 : "", subject: r.subject })));
  return xlsxResponse(wb, `helpdesk-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
