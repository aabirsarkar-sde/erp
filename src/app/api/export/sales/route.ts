import { getCurrentUser } from "@/lib/core/auth";
import { salesReport } from "@/lib/crm/sales-stats";
import { addSheet, newWorkbook, xlsxResponse } from "@/lib/core/xlsx";
import { ACTIVITY_META, PROPOSAL_META, daysBetween } from "@/lib/crm/meta";
import { fmtDateTime, fmtDate } from "@/lib/core/format";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (me.crmAccess === "none") return new Response("Forbidden", { status: 403 });
  const r = await salesReport(Object.fromEntries(new URL(req.url).searchParams), me);
  const t = r.totals;
  const wb = newWorkbook();
  const INR = "₹#,##0";
  addSheet(wb, "Summary", [{ header: "Measure", key: "k", width: 26 }, { header: "Value", key: "v", width: 18 }], [
    { k: "New leads", v: t.newLeads }, { k: "Converted to opportunity", v: t.converted }, { k: "Open opportunities", v: t.openN }, { k: "Open pipeline (₹)", v: t.openValue },
    { k: "Weighted forecast (₹)", v: Math.round(t.weighted) }, { k: "Won", v: t.wonN }, { k: "Won value (₹)", v: t.wonValue }, { k: "Lost", v: t.lostN },
    { k: "Win rate %", v: t.winRate != null ? +t.winRate.toFixed(1) : "" }, { k: "Visits", v: t.visits }, { k: "Calls", v: t.calls }, { k: "Meetings", v: t.meetings },
  ], `Sales & marketing report — ${r.label}`);
  addSheet(wb, "By stage", [{ header: "Stage", key: "label", width: 22 }, { header: "Deals", key: "n" }, { header: "Value", key: "value", width: 16, numFmt: INR }, { header: "Weighted", key: "weighted", width: 16, numFmt: INR }], r.byStage);
  addSheet(wb, "By salesperson", [
    { header: "Salesperson", key: "label", width: 22 }, { header: "New leads", key: "newLeads" }, { header: "Open opps", key: "open" }, { header: "Pipeline", key: "pipeline", width: 16, numFmt: INR },
    { header: "Won", key: "won" }, { header: "Won value", key: "wonValue", width: 16, numFmt: INR }, { header: "Lost", key: "lost" }, { header: "Visits", key: "visits" }, { header: "Calls", key: "calls" }, { header: "Meetings", key: "meetings" },
  ], r.bySalesperson);
  addSheet(wb, "Lead sources", [{ header: "Source", key: "label", width: 22 }, { header: "Leads", key: "n" }, { header: "Won", key: "won" }], r.bySource);
  addSheet(wb, "Proposals", [{ header: "Proposal status", key: "label", width: 24 }, { header: "Opportunities", key: "n", width: 14 }, { header: "Value", key: "value", width: 16, numFmt: INR }], r.proposals);
  addSheet(wb, "Visit report", [
    { header: "Date", key: "date", width: 18 }, { header: "Type", key: "type", width: 11 }, { header: "By", key: "user", width: 18 }, { header: "Client", key: "customer", width: 28 }, { header: "Contact", key: "contact", width: 18 },
    { header: "Location", key: "location", width: 20 }, { header: "Opportunity", key: "lead", width: 30 }, { header: "Subject", key: "summary", width: 30 }, { header: "Discussion points", key: "discussion", width: 50 }, { header: "Outcome", key: "outcome", width: 40 }, { header: "Next action", key: "nextAction", width: 30 },
  ], r.activities.map((a) => ({ ...a, date: fmtDateTime(a.doneAt), type: ACTIVITY_META[a.type].label })));
  addSheet(wb, "Opportunities", [
    { header: "Opportunity", key: "title", width: 34 }, { header: "Client", key: "customer", width: 28 }, { header: "Product / service", key: "product", width: 24 }, { header: "Stage", key: "stage", width: 16 },
    { header: "Proposal", key: "proposal", width: 18 }, { header: "Value", key: "value", width: 14, numFmt: INR }, { header: "Prob %", key: "probability" }, { header: "Salesperson", key: "owner", width: 18 }, { header: "Source", key: "source", width: 16 }, { header: "Labels", key: "tags", width: 30 }, { header: "Created", key: "created", width: 12 }, { header: "Age (days)", key: "age" },
  ], [...r.open].sort((a, b) => b.value - a.value).map((l) => ({ ...l, proposal: PROPOSAL_META[l.proposalStatus]?.label, created: fmtDate(l.createdAt), age: daysBetween(l.createdAt, Date.now()) })));
  addSheet(wb, "Won & lost", [{ header: "Result", key: "res" }, { header: "Opportunity", key: "title", width: 34 }, { header: "Client", key: "customer", width: 28 }, { header: "Value", key: "value", width: 14, numFmt: INR }, { header: "Salesperson", key: "owner", width: 18 }, { header: "Closed", key: "closed", width: 12 }, { header: "TAT (days)", key: "tat" }, { header: "Lost reason", key: "lostReason", width: 24 }],
    [...r.won.map((l) => ({ ...l, res: "Won" })), ...r.lost.map((l) => ({ ...l, res: "Lost" }))].map((l) => ({ ...l, closed: fmtDate(l.closedAt), tat: l.closedAt ? daysBetween(l.createdAt, l.closedAt) : "" })));
  return xlsxResponse(wb, `sales-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
