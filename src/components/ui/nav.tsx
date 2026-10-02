"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconHome, IconTicket, IconPlus, IconFunnel, IconMenu } from "@/components/ui/icons";
import { visibleNav, type Item, type Access } from "@/lib/workspace/nav-config";

const isActive = (path: string, href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));

// polled in the background (not on every click, so navigation never waits behind it)
function useChatUnread() {
  const [n, setN] = useState(0);
  const onDiscuss = usePathname().startsWith("/discuss");
  useEffect(() => {
    let alive = true;
    const tick = () => document.visibilityState === "visible" && fetch("/api/chat/unread", { cache: "no-store" }).then((r) => r.json()).then((d) => alive && setN(d.n)).catch(() => {});
    tick();
    const id = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [onDiscuss]);
  return n;
}

export function SideNav({ access }: { access: Access }) {
  const path = usePathname();
  const unread = useChatUnread();
  return (
    <nav className="space-y-4">
      {visibleNav(access).map((g, i) => (
        <div key={i}>
          {g.title && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</div>}
          <div className="space-y-0.5">
            {g.items.map(({ href, label, icon: I, exact, badge }) => {
              // most specific match wins (/crm/leads shouldn't also light up /crm)
              const a = isActive(path, href, exact) && !g.items.some((o) => o.href !== href && o.href.startsWith(href + "/") && isActive(path, o.href));
              return (
                <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${a ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                  <I className="size-[18px]" />
                  <span className="flex-1">{label}</span>
                  {badge === "chat" && unread > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function BottomNav({ access }: { access: Access }) {
  const path = usePathname();
  const unread = useChatUnread();
  const items: (Item & { primary?: boolean })[] = [
    { href: "/", label: "Home", icon: IconHome, exact: true },
    ...(access.hd ? [{ href: "/tickets", label: "Tickets", icon: IconTicket }] : []),
    access.hd ? { href: "/tickets/new", label: "Ticket", icon: IconPlus, primary: true } : { href: "/calendar/activity", label: "Activity", icon: IconPlus, primary: true },
    ...(access.crm ? [{ href: "/crm", label: "Pipeline", icon: IconFunnel }] : []),
    { href: "/more", label: "More", icon: IconMenu },
  ];
  const inMore = ["/activities", "/quotations", "/customers", "/reports", "/settings", "/more", "/calendar", "/discuss", "/documents", "/insights", "/ask"].some((p) => path.startsWith(p));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map((it) => {
        const I = it.icon;
        const a = it.primary ? false : it.href === "/more" ? inMore : isActive(path, it.href, it.exact) && path !== "/tickets/new";
        return (
          <Link key={it.href} href={it.href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${a ? "text-brand-700" : "text-slate-500"}`}>
            {it.href === "/more" && unread > 0 ? <span className="relative"><I className="size-5" /><span className="absolute -right-1.5 -top-1 size-2.5 rounded-full bg-brand-600 ring-2 ring-white" /></span> : it.primary ? <span className="-mt-5 flex size-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white"><I className="size-5" /></span> : <I className="size-5" />}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
