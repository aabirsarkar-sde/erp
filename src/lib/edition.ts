// One codebase, two products. Each deployment sets APP_EDITION:
//   crm       → "Raybon Sales CRM"   (leads, opportunities, activities & visits, quotations, sales reports)
//   helpdesk  → "Raybon O&M Helpdesk" (complaints/tickets, plants, SLA, customer portal, escalations)
//   (unset)   → both, for local development
// Shared modules (calendar, discuss, documents, customers, AI, settings) are in both.
export type Edition = "crm" | "helpdesk" | "all";
const raw = (process.env.APP_EDITION ?? process.env.NEXT_PUBLIC_APP_EDITION ?? "all").toLowerCase();
export const EDITION: Edition = raw === "crm" || raw === "sales" ? "crm" : raw === "helpdesk" || raw === "hd" ? "helpdesk" : "all";
export const editionHasCrm = EDITION !== "helpdesk";
export const editionHasHd = EDITION !== "crm";

export const BRAND = {
  crm: { name: "Raybon Sales CRM", short: "Sales CRM", tagline: "Sales & Marketing", description: "Leads, opportunities, visits and proposals for Zero Discharge Systems" },
  helpdesk: { name: "Raybon O&M Helpdesk", short: "Helpdesk", tagline: "Operations & Maintenance", description: "Complaints, plants and service tickets for Zero Discharge Systems" },
  all: { name: "Raybon ERP", short: "Raybon ERP", tagline: "Zero Discharge Systems", description: "Helpdesk, CRM and operations for Zero Discharge Systems" },
}[EDITION];
