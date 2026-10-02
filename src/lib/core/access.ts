import "server-only";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, leads, leadMembers, tickets, teamMembers, ticketWatchers, activities, quotations, documents } from "@/db";
import type { CurrentUser } from "@/lib/core/auth";

/**
 * Who can see what.
 *  CRM       all  → every opportunity · own → opportunities they own, are assigned to, or follow
 *  Helpdesk  all  → every ticket      · zone → tickets in their zone(s) + any ticket assigned to them or that they follow
 *  "none" hides the department entirely.
 */
type Me = Pick<CurrentUser, "id" | "email" | "role" | "crmAccess" | "hdAccess">;
const NONE = sql`0 = 1`;

export const hasCrm = (me: Me) => me.crmAccess !== "none";
const hasHd = (me: Me) => me.hdAccess !== "none";
export const hdAll = (me: Me) => me.hdAccess === "all";

const myLeadIds = (me: Me) => db.select({ id: leadMembers.leadId }).from(leadMembers).where(eq(leadMembers.userId, me.id));

export function leadScope(me: Me): SQL | undefined {
  if (me.crmAccess === "all") return undefined;
  if (me.crmAccess === "none") return NONE;
  return or(eq(leads.ownerId, me.id), inArray(leads.id, myLeadIds(me)))!;
}

/** activities: linked ones follow the opportunity; unlinked ones are visible to their assignee/creator (or everyone with CRM all) */
export function activityScope(me: Me): SQL | undefined {
  if (me.crmAccess === "all") return undefined;
  if (me.crmAccess === "none") return or(eq(activities.userId, me.id), eq(activities.createdById, me.id))!;
  const visibleLeads = db.select({ id: leads.id }).from(leads).where(leadScope(me));
  return or(eq(activities.userId, me.id), eq(activities.createdById, me.id), inArray(activities.leadId, visibleLeads))!;
}

export function quotationScope(me: Me): SQL | undefined {
  if (me.crmAccess === "all") return undefined;
  if (me.crmAccess === "none") return NONE;
  const visibleLeads = db.select({ id: leads.id }).from(leads).where(leadScope(me));
  return or(eq(quotations.salespersonId, me.id), inArray(quotations.leadId, visibleLeads))!;
}

export function documentScope(me: Me): SQL | undefined {
  if (me.crmAccess === "all") return undefined;
  const visibleLeads = db.select({ id: leads.id }).from(leads).where(leadScope(me) ?? sql`1=1`);
  return or(sql`${documents.leadId} is null`, eq(documents.uploadedById, me.id), inArray(documents.leadId, visibleLeads))!;
}

export function ticketScope(me: Me): SQL | undefined {
  if (me.hdAccess === "all") return undefined;
  if (me.hdAccess === "none") return NONE;
  const myZones = db.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, me.id));
  const followed = db.select({ id: ticketWatchers.ticketId }).from(ticketWatchers).where(eq(ticketWatchers.email, me.email.toLowerCase()));
  return or(inArray(tickets.teamId, myZones), eq(tickets.assigneeId, me.id), inArray(tickets.id, followed))!;
}

export async function canSeeLead(me: Me, leadId: number) {
  const r = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), leadScope(me))).limit(1);
  return r.length > 0;
}
export async function canSeeTicket(me: Me, ticketId: number) {
  const r = await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.id, ticketId), ticketScope(me))).limit(1);
  return r.length > 0;
}
export async function canSeeQuotation(me: Me, id: number) {
  const r = await db.select({ id: quotations.id }).from(quotations).where(and(eq(quotations.id, id), quotationScope(me))).limit(1);
  return r.length > 0;
}

export async function canSeeActivity(me: Me, id: number) {
  const r = await db.select({ id: activities.id }).from(activities).where(and(eq(activities.id, id), activityScope(me))).limit(1);
  return r.length > 0;
}

/** for pages: 404 instead of leaking that a record exists */
export async function assertTicket(me: Me, ticketId: number) { if (!(await canSeeTicket(me, ticketId))) notFound(); }
/** for actions: throw */
export async function guardLead(me: Me, leadId: number) { if (!(await canSeeLead(me, leadId))) throw new Error("You don't have access to this opportunity."); }
export async function guardTicket(me: Me, ticketId: number) { if (!(await canSeeTicket(me, ticketId))) throw new Error("You don't have access to this ticket."); }
export function requireDept(me: Me, dept: "crm" | "hd") { if (dept === "crm" ? !hasCrm(me) : !hasHd(me)) notFound(); }
