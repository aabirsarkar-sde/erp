"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, users, leads, leadNotes, activities, tasks, enquiries, tickets } from "@/db";
import { requireAdmin } from "@/lib/core/auth";
import { notify } from "@/lib/workspace/notify";

/** someone leaves or changes role: move their customers' deals and open work to colleagues, keeping all history */
export async function handOver(fromId: number, fd: FormData) {
  const me = await requireAdmin();
  const toId = Number(fd.get("toId"));
  if (!toId || toId === fromId) return;
  const [from, to] = await Promise.all([db.query.users.findFirst({ where: eq(users.id, fromId) }), db.query.users.findFirst({ where: eq(users.id, toId) })]);
  if (!from || !to) return;
  const leadIds = fd.getAll("leadIds").map(Number).filter(Boolean);
  const moved = { deals: 0, activities: 0, tasks: 0, enquiries: 0, tickets: 0 };
  if (leadIds.length) {
    await db.update(leads).set({ ownerId: toId, updatedAt: new Date() }).where(and(inArray(leads.id, leadIds), eq(leads.ownerId, fromId)));
    await db.insert(leadNotes).values(leadIds.map((leadId) => ({ leadId, authorId: me.id, kind: "event" as const, body: `Handed over from ${from.name} to ${to.name}` })));
    moved.deals = leadIds.length;
    // planned work on those deals follows them
    const r = await db.update(activities).set({ userId: toId }).where(and(inArray(activities.leadId, leadIds), eq(activities.userId, fromId), isNull(activities.doneAt))).returning({ id: activities.id });
    moved.activities += r.length;
  }
  if (fd.get("openWork") === "on") {
    const a = await db.update(activities).set({ userId: toId }).where(and(eq(activities.userId, fromId), isNull(activities.doneAt))).returning({ id: activities.id });
    const t = await db.update(tasks).set({ assigneeId: toId }).where(and(eq(tasks.assigneeId, fromId), ne(tasks.status, "done"))).returning({ id: tasks.id });
    const e = await db.update(enquiries).set({ assignedToId: toId }).where(and(eq(enquiries.assignedToId, fromId), eq(enquiries.status, "new"))).returning({ id: enquiries.id });
    const k = await db.update(tickets).set({ assigneeId: toId }).where(and(eq(tickets.assigneeId, fromId), inArray(tickets.stage, ["new", "in_progress", "waiting"]))).returning({ id: tickets.id });
    moved.activities += a.length; moved.tasks = t.length; moved.enquiries = e.length; moved.tickets = k.length;
  }
  if (fd.get("deactivate") === "on") await db.update(users).set({ active: false }).where(eq(users.id, fromId));
  await notify({ userId: toId, kind: "system", fromUserId: me.id, title: `${me.name} handed you ${from.name}'s work: ${moved.deals} deal(s), ${moved.activities} planned activities, ${moved.tasks} task(s)${moved.tickets ? `, ${moved.tickets} ticket(s)` : ""}`, href: "/crm" });
  revalidatePath("/", "layout");
  redirect(`/settings/handover?from=${fromId}&done=${encodeURIComponent(JSON.stringify(moved))}&to=${encodeURIComponent(to.name)}`);
}
