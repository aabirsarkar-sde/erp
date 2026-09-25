import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import { SideNav, BottomNav } from "@/components/nav";
import { Avatar } from "@/components/ui";
import { IconLogout, IconPlus, IconCog } from "@/components/icons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <img src="/icon.svg" alt="" className="size-8" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Raybon ERP</div>
            <div className="text-[11px] text-slate-500">Zero Discharge Systems</div>
          </div>
        </Link>
        <Link href="/tickets/new" className="btn-primary mb-4 w-full"><IconPlus className="size-4" />New ticket</Link>
        <SideNav isAdmin={isAdmin} />
        <div className="mt-auto flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="text-[11px] capitalize text-slate-500">{user.role}</div>
          </div>
          <form action={logout}>
            <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Sign out"><IconLogout className="size-4" /></button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="size-7" />
          <span className="text-sm font-semibold">Raybon ERP</span>
        </Link>
        <form action={logout} className="flex items-center gap-2">
          {isAdmin && <Link href="/settings" className="rounded-md p-1.5 text-slate-500" title="Settings"><IconCog className="size-5" /></Link>}
          <Avatar name={user.name} size="sm" />
          <button className="rounded-md p-1.5 text-slate-400" title="Sign out"><IconLogout className="size-4" /></button>
        </form>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10 lg:px-8">{children}</main>
      <BottomNav />
    </div>
  );
}
