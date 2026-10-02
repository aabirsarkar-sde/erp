import "server-only";
import { startOfLocalMonth } from "@/lib/core/tz";
import { and, asc, desc, eq, gte, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, leads, crmStages, customers, users, activities, leadMembers } from "@/db";
import { leadScope } from "@/lib/core/access";
import type { CurrentUser } from "@/lib/core/auth";

export type LeadFilters = { q?: string; owner?: string; status?: string; tag?: string; kind?: string; source?: string; product?: string };

export async function listLeads(f: LeadFilters, me: CurrentUser) {
  const meId = me.id;
  const owner = alias(users, "owner");
  const c: SQL[] = [];
  const scope = leadScope(me);
  if (scope) c.push(scope);
  if (f.kind) c.push(eq(leads.kind, f.kind as "lead" | "opportunity"));
  const status = f.status || "open";
  if (status !== "all") c.push(eq(leads.status, status as "open" | "won" | "lost"));
  if (f.owner === "me" || f.owner === undefined) c.push(or(eq(leads.ownerId, meId), inArray(leads.id, db.select({ id: leadMembers.leadId }).from(leadMembers).where(eq(leadMembers.userId, meId))))!);
  else if (f.owner && f.owner !== "all" && Number.isFinite(Number(f.owner))) c.push(eq(leads.ownerId, Number(f.owner)));
  if (f.source) c.push(eq(leads.source, f.source));
  if (f.tag) c.push(like(leads.tags, `%${f.tag}%`));
  if (f.product) c.push(eq(leads.product, f.product));
  if (f.q?.trim()) {
    const p = `%${f.q.trim()}%`;
    c.push(or(like(leads.title, p), like(customers.name, p), like(leads.contactName, p), like(leads.tags, p), like(leads.city, p))!);
  }
  const nextAct = db
    .select({ leadId: activities.leadId, next: sql<number>`min(${activities.dueAt})`.as("next") })
    .from(activities)
    .where(isNull(activities.doneAt))
    .groupBy(activities.leadId)
    .as("na");
  return db
    .select({
      id: leads.id,
      title: leads.title,
      stageId: leads.stageId,
      status: leads.status,
      expectedRevenue: leads.expectedRevenue,
      probability: leads.probability,
      priority: leads.priority,
      tags: leads.tags,
      kind: leads.kind,
      product: leads.product,
      proposalStatus: leads.proposalStatus,
      source: leads.source,
      createdAt: leads.createdAt,
      sortOrder: leads.sortOrder,
      expectedCloseAt: leads.expectedCloseAt,
      customerId: leads.customerId,
      customerName: customers.name,
      contactName: leads.contactName,
      phone: leads.phone,
      email: leads.email,
      address: leads.address,
      ownerId: leads.ownerId,
      closedAt: leads.closedAt,
      city: leads.city,
      ownerName: owner.name,
      nextActivity: nextAct.next,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .leftJoin(customers, eq(customers.id, leads.customerId))
    .leftJoin(owner, eq(owner.id, leads.ownerId))
    .leftJoin(nextAct, eq(nextAct.leadId, leads.id))
    .where(c.length ? and(...c) : undefined)
    .orderBy(asc(leads.sortOrder), desc(leads.updatedAt));
}
export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

export const getStages = () => db.select().from(crmStages).orderBy(asc(crmStages.sequence));

export async function wonThisMonth(me: CurrentUser, onlyMine: boolean) {
  const meId = onlyMine ? me.id : undefined;
  const start = startOfLocalMonth(Date.now()); // IST month, regardless of server time zone
  const [r] = await db
    .select({ n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${leads.expectedRevenue}),0)` })
    .from(leads)
    .where(and(eq(leads.status, "won"), gte(leads.closedAt, start), meId ? eq(leads.ownerId, meId) : undefined, leadScope(me)));
  return { n: Number(r!.n), v: Number(r!.v) };
}
