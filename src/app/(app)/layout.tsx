import Link from "next/link";
import { requireUser } from "@/lib/core/auth";
import { BRAND } from "@/lib/core/edition";
import { logout } from "@/app/actions/auth";
import { SideNav, BottomNav } from "@/components/ui/nav";
import { Avatar } from "@/components/ui/ui";
import { IconLogout, IconPlus, IconCog, IconBell } from "@/components/ui/icons";
import { unreadCount } from "@/lib/workspace/notify";

function Bell({ n }: { n: number }) {
  return (
    <Link href="/notifications" className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title={n ? `${n} unread notifications` : "Notifications"} data-testid="bell">
      <IconBell className="size-5" />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const access = { isAdmin, crm: user.crmAccess !== "none", hd: user.hdAccess !== "none" };
  const unread = await unreadCount(user.id);
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-1">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5 px-2">
            <img src="/brand-icon.svg" alt="" className="size-8" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">{BRAND.name}</div>
              <div className="text-[11px] text-slate-500">{BRAND.tagline}</div>
            </div>
          </Link>
          <Bell n={unread} />
        </div>
        {access.hd ? <Link href="/tickets/new" className="btn-primary mb-4 w-full"><IconPlus className="size-4" />New complaint</Link> : <Link href="/calendar/activity" className="btn-primary mb-4 w-full"><IconPlus className="size-4" />New activity</Link>}
        <SideNav access={access} />
        <div className="mt-auto flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-[11px] text-slate-500">{user.title ?? (user.role === "admin" ? "Admin" : [access.crm && "Sales", access.hd && "O&M"].filter(Boolean).join(" · "))}</div>
          </div>
          <form action={logout}>
            <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Sign out"><IconLogout className="size-4" /></button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <img src="/brand-icon.svg" alt="" className="size-7" />
          <span className="text-sm font-semibold">{BRAND.name}</span>
        </Link>
        <form action={logout} className="flex items-center gap-2">
          <Bell n={unread} />
          {isAdmin && <Link href="/settings" className="rounded-md p-1.5 text-slate-500" title="Settings"><IconCog className="size-5" /></Link>}
          <Avatar name={user.name} size="sm" />
          <button className="rounded-md p-1.5 text-slate-400" title="Sign out"><IconLogout className="size-4" /></button>
        </form>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10 lg:px-8">{children}</main>
      <BottomNav access={access} />
    </div>
  );
}
