import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { visibleNav } from "@/lib/nav-config";

export default async function MorePage() {
  const me = await requireUser();
  return (
    <div className="mx-auto max-w-md space-y-5">
      {visibleNav({ isAdmin: me.role === "admin", crm: me.crmAccess !== "none", hd: me.hdAccess !== "none" }).map((g, i) => (
        <section key={i}>
          {g.title && <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{g.title}</h2>}
          <div className="card divide-y divide-slate-100">
            {g.items.map(({ href, label, icon: I }) => (
              <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3 text-sm font-medium active:bg-slate-50"><I className="size-5 text-slate-500" />{label}</Link>
            ))}
          </div>
        </section>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/crm/new" className="btn-secondary">+ Opportunity</Link>
        <Link href="/quotations/new" className="btn-secondary">+ Quotation</Link>
      </div>
    </div>
  );
}
