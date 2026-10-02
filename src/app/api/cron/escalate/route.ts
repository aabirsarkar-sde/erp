import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db, tickets, users, teamMembers } from "@/db";
import { OPEN_STAGES, PRIORITIES, ticketRef } from "@/lib/helpdesk/constants";
import { fmtTat } from "@/lib/core/format";
import { sendMail, appUrl } from "@/lib/core/mail";
import { getHoEmails } from "@/lib/helpdesk/notify";

// Daily escalation digest (Vercel Cron → see vercel.json). Protected by CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const now = new Date();
  const stale = new Date(Date.now() - 24 * 3600e3);
  const rows = await db.query.tickets.findMany({
    where: and(inArray(tickets.stage, OPEN_STAGES), or(lt(tickets.dueAt, now), and(isNull(tickets.assigneeId), lt(tickets.createdAt, stale)))),
    with: { team: true, plant: true, customer: true, assignee: true },
  });
  if (!rows.length) return Response.json({ escalated: 0 });
  const line = (t: (typeof rows)[number]) => `• ${ticketRef(t.id)} [${PRIORITIES[t.priority]!.label}] ${t.category ?? ""} — ${t.plant ? `${t.plant.plantNo} ` : ""}${t.customer?.name ?? ""} · ${t.assignee ? `with ${t.assignee.name}` : "UNASSIGNED"} · open ${fmtTat((+now - +(t.reportedAt ?? t.createdAt)) / 60000)}\n  ${appUrl()}/tickets/${t.id}`;
  // per-zone digest to that zone's team members
  const byZone = new Map<number, typeof rows>();
  for (const t of rows) byZone.set(t.teamId, [...(byZone.get(t.teamId) ?? []), t]);
  for (const [teamId, list] of byZone) {
    const members = await db.select({ email: users.email }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(and(eq(teamMembers.teamId, teamId), eq(users.active, true)));
    for (const m of members) await sendMail({ to: m.email, subject: `⚠ ${list.length} overdue / unassigned complaint${list.length > 1 ? "s" : ""} — ${list[0]!.team.location}`, text: `These complaints in your zone need attention today:\n\n${list.map(line).join("\n\n")}` });
  }
  // full list to managers + HO
  const mgrs = await db.select({ email: users.email }).from(users).where(and(inArray(users.role, ["admin", "manager"]), eq(users.active, true)));
  const to = [...new Set([...mgrs.map((m) => m.email), ...(await getHoEmails())])];
  for (const email of to) await sendMail({ to: email, subject: `Escalation: ${rows.length} complaint${rows.length > 1 ? "s" : ""} overdue or unassigned`, text: `Daily escalation report\n\n${rows.map(line).join("\n\n")}` });
  return Response.json({ escalated: rows.length });
}
