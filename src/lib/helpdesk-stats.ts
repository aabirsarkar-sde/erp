import "server-only";
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, tickets, teams, plants, customers, users } from "@/db";
import { COMPLAINT_TYPES, OPEN_STAGES } from "./constants";
import { ticketScope } from "./access";
import type { CurrentUser } from "./auth";

export type HdFilters = { days?: string; from?: string; to?: string; zone?: string };

export async function helpdeskRows(f: HdFilters, me: CurrentUser) {
  const assignee = alias(users, "assignee");
  const closer = alias(users, "closer");
  const at = sql<number>`coalesce(${tickets.reportedAt}, ${tickets.createdAt})`;
  const c: SQL[] = [];
  const scope = ticketScope(me);
  if (scope) c.push(scope);
  if (f.from) c.push(gte(at, Math.floor(Date.parse(f.from + "T00:00:00+05:30") / 1000)));
  if (f.to) c.push(lt(at, Math.floor(Date.parse(f.to + "T00:00:00+05:30") / 1000) + 86400));
  if (!f.from && !f.to && f.days !== "all") c.push(gte(at, Math.floor(Date.now() / 1000) - Number(f.days || 90) * 86400));
  if (f.zone) c.push(eq(tickets.teamId, Number(f.zone)));
  return db
    .select({
      id: tickets.id, subject: tickets.subject, type: tickets.category, stage: tickets.stage, priority: tickets.priority, at,
      tat: tickets.tatMinutes, csat: tickets.csatScore, resolvedAt: tickets.resolvedAt,
      zoneId: tickets.teamId, zone: teams.location, plantId: tickets.plantId, plantNo: plants.plantNo, plantName: plants.name,
      city: sql<string | null>`coalesce(${plants.city}, ${customers.city})`, state: plants.state, customer: customers.name,
      assigneeId: tickets.assigneeId, assignee: assignee.name, closerId: tickets.closedById, closer: closer.name, complainant: tickets.complainantName,
    })
    .from(tickets)
    .leftJoin(teams, eq(teams.id, tickets.teamId))
    .leftJoin(plants, eq(plants.id, tickets.plantId))
    .leftJoin(customers, eq(customers.id, tickets.customerId))
    .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
    .leftJoin(closer, eq(closer.id, tickets.closedById))
    .where(c.length ? and(...c) : undefined);
}
export type HdRow = Awaited<ReturnType<typeof helpdeskRows>>[number];

const isOpen = (r: HdRow) => (OPEN_STAGES as string[]).includes(r.stage);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export type Group = { key: string; label: string; total: number; open: number; closed: number; avgTat: number | null; csat: number | null; href: string };

export function groupBy(rows: HdRow[], by: "type" | "zone" | "geo" | "employee" | "plant"): Group[] {
  const m = new Map<string, HdRow[]>();
  const keyOf = (r: HdRow): [string, string][] => {
    switch (by) {
      case "type": return [[r.type ?? "Other", r.type ?? "Other"]];
      case "zone": return [[String(r.zoneId), r.zone ?? "—"]];
      case "geo": return [[`${r.city ?? "—"}|${r.state ?? ""}`, [r.city ?? "Unknown", r.state].filter(Boolean).join(", ")]];
      case "plant": return [[String(r.plantId ?? "none"), r.plantNo ? `${r.plantNo} · ${r.plantName}` : "No plant"]];
      case "employee": {
        // an employee "owns" tickets they closed, plus open tickets assigned to them
        const k = r.closerId ?? (isOpen(r) ? r.assigneeId : null);
        const name = r.closer ?? (isOpen(r) ? r.assignee : null);
        return [[String(k ?? "none"), name ?? "Unassigned"]];
      }
    }
  };
  const labels = new Map<string, string>();
  for (const r of rows) for (const [k, l] of keyOf(r)) { labels.set(k, l); m.set(k, [...(m.get(k) ?? []), r]); }
  const href = (k: string) => {
    if (by === "type") return `/tickets?type=${encodeURIComponent(k)}&stage=all`;
    if (by === "zone") return `/tickets?team=${k}&stage=all`;
    if (by === "plant") return k === "none" ? "/tickets?stage=all" : `/tickets?plant=${k}&stage=all`;
    if (by === "employee") return k === "none" ? "/tickets?assignee=unassigned" : `/tickets?assignee=${k}&stage=all`;
    return `/tickets?city=${encodeURIComponent(k.split("|")[0]!)}&stage=all`;
  };
  const out = [...m.entries()].map(([k, rs]) => {
    const closed = rs.filter((r) => !isOpen(r));
    return {
      key: k, label: labels.get(k)!, total: rs.length, open: rs.length - closed.length, closed: closed.length,
      avgTat: avg(closed.map((r) => r.tat).filter((x): x is number => x != null)),
      csat: avg(rs.map((r) => r.csat).filter((x): x is number => x != null)),
      href: href(k),
    };
  });
  if (by === "type") for (const t of COMPLAINT_TYPES) if (!out.some((g) => g.key === t)) out.push({ key: t, label: t, total: 0, open: 0, closed: 0, avgTat: null, csat: null, href: href(t) });
  return by === "employee" ? out.sort((a, b) => b.closed - a.closed || b.total - a.total) : out.sort((a, b) => b.total - a.total);
}

export function summary(rows: HdRow[]) {
  const closed = rows.filter((r) => !isOpen(r));
  const tats = closed.map((r) => r.tat).filter((x): x is number => x != null);
  return {
    total: rows.length, open: rows.length - closed.length, closed: closed.length,
    avgTat: avg(tats), medianTat: tats.length ? [...tats].sort((a, b) => a - b)[Math.floor(tats.length / 2)]! : null,
    csat: avg(rows.map((r) => r.csat).filter((x): x is number => x != null)),
  };
}
