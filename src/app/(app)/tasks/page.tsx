import { requireUser } from "@/lib/core/auth";
import { listTasks, isSupervisor } from "@/lib/workspace/tasks";
import { lookups } from "@/lib/core/lookups";
import { PageHeader } from "@/components/ui/ui";
import { ParamSelect } from "@/components/ui/url-filters";
import { TaskBoard, TaskForm } from "@/components/workspace/tasks";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ who?: string; open?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const sup = isSupervisor(me);
  const who = sp.who ?? "me";
  const [rows, lk] = await Promise.all([listTasks(me, { who }), lookups()]);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Tasks" subtitle={sup ? "Assign work and follow it through — you can see everyone's tasks" : "Your tasks and the ones you've given others"} />
      <div className="card mb-4 p-4"><TaskForm users={lk.users} meId={me.id} /></div>
      <div className="mb-3 flex flex-wrap gap-2">
        <ParamSelect name="who" fallback="me" options={[["me", "Assigned to me"], ["byme", "Assigned by me"], ...(sup ? ([["all", "Everyone"], ...lk.users.filter((u) => u.id !== me.id).map((u) => [String(u.id), u.name] as [string, string])] as [string, string][]) : [])]} />
      </div>
      <TaskBoard tasks={rows} users={lk.users} openId={sp.open ? Number(sp.open) : undefined} />
    </div>
  );
}
