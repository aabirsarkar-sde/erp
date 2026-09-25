"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconTicket, IconPlus, IconFunnel, IconMenu } from "./icons";
import { NAV, type Item } from "@/lib/nav-config";

const isActive = (path: string, href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="space-y-4">
      {NAV.filter((g) => !g.admin || isAdmin).map((g, i) => (
        <div key={i}>
          {g.title && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</div>}
          <div className="space-y-0.5">
            {g.items.map(({ href, label, icon: I, exact }) => {
              const a = isActive(path, href, exact) && !(href === "/tickets" && path === "/tickets/new" && false);
              return (
                <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${a ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                  <I className="size-[18px]" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const items: (Item & { primary?: boolean })[] = [
    { href: "/", label: "Home", icon: IconHome, exact: true },
    { href: "/tickets", label: "Tickets", icon: IconTicket },
    { href: "/tickets/new", label: "Ticket", icon: IconPlus, primary: true },
    { href: "/crm", label: "Pipeline", icon: IconFunnel },
    { href: "/more", label: "More", icon: IconMenu },
  ];
  const inMore = ["/activities", "/quotations", "/customers", "/reports", "/settings", "/more"].some((p) => path.startsWith(p));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map((it) => {
        const I = it.icon;
        const a = it.primary ? false : it.href === "/more" ? inMore : isActive(path, it.href, it.exact) && path !== "/tickets/new";
        return (
          <Link key={it.href} href={it.href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${a ? "text-brand-700" : "text-slate-500"}`}>
            {it.primary ? <span className="-mt-5 flex size-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white"><I className="size-5" /></span> : <I className="size-5" />}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
