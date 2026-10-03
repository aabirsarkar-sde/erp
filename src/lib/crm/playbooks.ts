import "server-only";
import { and, eq } from "drizzle-orm";
import { db, playbooks, playbookRuns, leads, tasks, activities, leadNotes, customers } from "@/db";
import { notify } from "@/lib/workspace/notify";
import { atLocal10 } from "@/lib/core/tz";
import { parseSteps, playbookMatches } from "@/lib/crm/playbook-meta";

/**
 * Automatic task chains. Called when an opportunity/lead is created and when it enters a stage.
 * Each playbook runs at most once per opportunity.
 */
export async function runPlaybooks(leadId: number, event: "created" | "stage", actorId: number | null, stageId?: number) {
  const [l, pbs] = await Promise.all([
    db.select({ id: leads.id, title: leads.title, product: leads.product, application: leads.application, segment: leads.segment, description: leads.description, ownerId: leads.ownerId, customerId: leads.customerId, customer: customers.name, company: leads.companyName, status: leads.status })
      .from(leads).leftJoin(customers, eq(customers.id, leads.customerId)).where(eq(leads.id, leadId)).then((r) => r[0]),
    db.select().from(playbooks).where(and(eq(playbooks.active, true), eq(playbooks.trigger, event))),
  ]);
  if (!l || l.status !== "open") return 0;
  let added = 0;
  for (const pb of pbs) {
    if (event === "stage" && pb.stageId !== stageId) continue;
    if (!playbookMatches(pb, l)) continue;
    const claimed = await db.insert(playbookRuns).values({ playbookId: pb.id, leadId }).onConflictDoNothing().returning();
    if (!claimed.length) continue; // already ran for this opportunity
    const steps = parseSteps(pb.steps);
    const who = l.customer ?? l.company ?? l.title;
    const notified = new Set<number>();
    for (const st of steps) {
      const assignee = st.assign === "owner" ? l.ownerId ?? actorId : st.assign === "creator" ? actorId ?? l.ownerId : st.assign;
      const title = st.title.replace(/\{\{\s*customer\s*\}\}/gi, who);
      const due = atLocal10(st.days);
      if (st.kind === "task") await db.insert(tasks).values({ title, notes: `From playbook "${pb.name}"`, dueAt: due, assigneeId: assignee, createdById: actorId, leadId, customerId: l.customerId, priority: 1 });
      else await db.insert(activities).values({ type: st.kind, summary: title, note: `From playbook "${pb.name}"`, leadId, customerId: l.customerId, userId: assignee, createdById: actorId, dueAt: due });
      added++;
      if (assignee && assignee !== actorId && !notified.has(assignee)) {
        notified.add(assignee);
        await notify({ userId: assignee, kind: "task", fromUserId: actorId, title: `Playbook "${pb.name}" added ${steps.length} step(s) for ${who}`, href: `/crm/${leadId}`, leadId });
      }
    }
    await db.insert(leadNotes).values({ leadId, authorId: actorId, kind: "event", body: `⚙ Playbook "${pb.name}": ${steps.map((x) => x.title).join(" → ")}` });
  }
  return added;
}
