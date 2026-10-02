import Link from "next/link";
import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, quotations, customers, users, QUOTE_STATUS } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { quotationScope, requireDept } from "@/lib/core/access";
import { PageHeader, LinkButton, Empty, Avatar } from "@/components/ui/ui";
import { SearchBox, ParamSelect } from "@/components/ui/url-filters";
import { QuoteStatus } from "@/components/crm/quote-status";
import { IconPlus } from "@/components/ui/icons";
import { inr, fmtDate } from "@/lib/core/format";
import { quoteRef } from "@/lib/crm/meta";

export const metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const sales = alias(users, "sales");
  const c: SQL[] = [];
  const qs0 = quotationScope(me);
  if (qs0) c.push(qs0);
  if (sp.status && (QUOTE_STATUS as readonly string[]).includes(sp.status)) c.push(eq(quotations.status, sp.status as (typeof QUOTE_STATUS)[number]));
  if (sp.q) c.push(or(like(quotations.number, `%${sp.q}%`), like(customers.name, `%${sp.q}%`), like(quotations.subject, `%${sp.q}%`))!);
  const rows = await db
    .select({ id: quotations.id, number: quotations.number, revision: quotations.revision, date: quotations.date, subject: quotations.subject, status: quotations.status, total: quotations.total, customerName: customers.name, salesName: sales.name })
    .from(quotations)
    .leftJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(sales, eq(sales.id, quotations.salespersonId))
    .where(c.length ? and(...c) : undefined)
    .orderBy(desc(quotations.date), desc(quotations.id))
    .limit(300);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Quotations"
        subtitle={`${rows.length} quotation${rows.length === 1 ? "" : "s"} · ${inr(rows.reduce((a, r) => a + r.total, 0))}`}
        actions={<><LinkButton href="/quotations/products" variant="secondary">Products</LinkButton><LinkButton href="/quotations/new"><IconPlus className="size-4" />New quotation</LinkButton></>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox placeholder="Search number, customer, subject…" />
        <ParamSelect name="status" options={[["", "All statuses"], ...QUOTE_STATUS.map((s) => [s, s[0]!.toUpperCase() + s.slice(1)] as [string, string])]} />
      </div>
      {rows.length === 0 ? <Empty title="No quotations" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2.5">Number</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Salesperson</th><th className="px-3 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="relative hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Link href={`/quotations/${r.id}`} className="font-mono text-xs font-semibold after:absolute after:inset-0 hover:text-brand-700">{quoteRef(r.number, r.revision)}</Link></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{fmtDate(r.date)}</td>
                  <td className="max-w-xs px-3 py-2.5"><div className="truncate font-medium">{r.customerName ?? "—"}</div>{r.subject && <div className="truncate text-xs text-slate-500">{r.subject}</div>}</td>
                  <td className="px-3 py-2.5"><span className="flex items-center gap-2 text-slate-600"><Avatar name={r.salesName} size="sm" />{r.salesName ?? "—"}</span></td>
                  <td className="px-3 py-2.5"><QuoteStatus s={r.status} /></td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{inr(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
