import Link from "next/link";
import { asc, eq, like, or, sql } from "drizzle-orm";
import { db, customers, tickets } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, LinkButton, Empty } from "@/components/ui";
import { IconPlus, IconSearch } from "@/components/icons";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      city: customers.city,
      phone: customers.phone,
      email: customers.email,
      open: sql<number>`coalesce(sum(case when ${tickets.stage} in ('new','in_progress','waiting') then 1 else 0 end),0)`,
      total: sql<number>`count(${tickets.id})`,
    })
    .from(customers)
    .leftJoin(tickets, eq(tickets.customerId, customers.id))
    .where(q ? or(like(customers.name, `%${q}%`), like(customers.city, `%${q}%`), like(customers.email, `%${q}%`)) : undefined)
    .groupBy(customers.id)
    .orderBy(asc(customers.name));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Customers" subtitle={`${rows.length} companies`} actions={<LinkButton href="/customers/new"><IconPlus className="size-4" />New customer</LinkButton>} />
      <form className="relative mb-4">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input name="q" defaultValue={q} placeholder="Search by name, city or email…" className="input pl-9" />
      </form>
      {rows.length === 0 ? (
        <Empty title="No customers found" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="card flex items-start gap-3 p-4 transition hover:border-brand-200 hover:shadow-sm">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700">{c.name.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.name}</div>
                <div className="truncate text-xs text-slate-500">{[c.city, c.phone, c.email].filter(Boolean).join(" · ") || "No details yet"}</div>
                <div className="mt-2 flex gap-3 text-xs">
                  <span className={Number(c.open) ? "font-medium text-amber-700" : "text-slate-400"}>{c.open} open</span>
                  <span className="text-slate-400">{c.total} total tickets</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
