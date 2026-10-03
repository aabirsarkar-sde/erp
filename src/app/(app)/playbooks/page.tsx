import { asc, eq, ne, and } from "drizzle-orm";
import { db, playbooks, users } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { requireDept } from "@/lib/core/access";
import { getStages } from "@/lib/crm/queries";
import { parseSteps } from "@/lib/crm/playbook-meta";
import { SEGMENTS } from "@/lib/crm/meta";
import { PageHeader } from "@/components/ui/ui";
import { PlaybookForm, PlaybookCard } from "@/components/crm/playbook-editor";

export const metadata = { title: "Playbooks" };

export default async function PlaybooksPage() {
  const me = await requireUser();
  requireDept(me, "crm");
  const canEdit = me.role === "admin" || me.crmAccess === "all";
  const [pbs, stages, team] = await Promise.all([
    db.select().from(playbooks).orderBy(asc(playbooks.name)),
    getStages(),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.active, true), ne(users.crmAccess, "none"))).orderBy(asc(users.name)),
  ]);
  const st = stages.map((s) => ({ id: s.id, name: s.name }));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Playbooks" subtitle="Automatic task chains — so a quotation never sits without a follow-up. Each playbook runs once per opportunity." />
      {canEdit && <section className="card mb-5 p-4"><h2 className="mb-3 text-sm font-semibold">New playbook</h2><PlaybookForm stages={st} users={team} segments={SEGMENTS} /></section>}
      {pbs.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No playbooks yet.</p> : (
        <div className="space-y-3" data-testid="playbooks">{pbs.map((p) => <PlaybookCard key={`${p.id}-${p.steps}-${p.active}-${p.name}`} pb={{ ...p, steps: parseSteps(p.steps) }} stages={st} users={team} segments={SEGMENTS} canEdit={canEdit} />)}</div>
      )}
    </div>
  );
}
