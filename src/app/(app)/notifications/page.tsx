import Link from "next/link";
import { requireUser } from "@/lib/core/auth";
import { listNotifications, parseActions } from "@/lib/workspace/notify";
import { markAllRead } from "@/app/actions/notifications";
import { PageHeader, Empty } from "@/components/ui/ui";
import { NotificationItem } from "@/components/workspace/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const me = await requireUser();
  const { f } = await searchParams;
  const rows = await listNotifications(me.id, { unread: f === "unread", kind: f === "nudge" || f === "reminder" ? f : undefined, limit: 100 });
  const tabs = [["", "All"], ["unread", "Unread"], ["nudge", "AI suggestions"], ["reminder", "Reminders"]] as const;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" subtitle="Reminders from your manager, AI follow-up suggestions, tasks and new enquiries"
        actions={<form action={markAllRead}><button className="btn-secondary">Mark all read</button></form>} />
      <div className="mb-3 flex gap-1 border-b border-slate-200">
        {tabs.map(([k, l]) => <Link key={k} href={k ? `/notifications?f=${k}` : "/notifications"} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${(f ?? "") === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`}>{l}</Link>)}
      </div>
      {rows.length === 0 ? <Empty title="Nothing here" hint="You're all caught up." /> : (
        <ul className="card divide-y divide-slate-100" data-testid="notifications">
          {rows.map((n) => <NotificationItem key={n.id} n={{ ...n, actions: parseActions(n.actions) }} />)}
        </ul>
      )}
    </div>
  );
}
