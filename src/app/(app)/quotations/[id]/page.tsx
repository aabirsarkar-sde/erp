import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, quotations, quotationLines, products } from "@/db";
import { requireUser } from "@/lib/auth";
import { canSeeQuotation } from "@/lib/access";
import { lookups } from "@/lib/queries";
import { setQuoteStatus, reviseQuotation, deleteQuotation } from "@/app/actions/quotations";
import { QuoteEditor } from "@/components/quote-editor";
import { aiEnabled } from "@/lib/ai";
import { QuoteStatus } from "@/components/quote-status";
import { IconBack } from "@/components/icons";
import { quoteRef } from "@/lib/crm";
import { inr } from "@/lib/format";

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!Number.isFinite(id) || !(await canSeeQuotation(me, id))) notFound();
  const [q, lk, prods] = await Promise.all([
    db.query.quotations.findFirst({ where: eq(quotations.id, id), with: { lines: { orderBy: asc(quotationLines.sort) }, lead: { columns: { id: true, title: true } }, customer: true } }),
    lookups(),
    db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name)),
  ]);
  if (!q) notFound();
  const locked = q.status !== "draft";
  return (
    <div className="mx-auto max-w-6xl">
      <Link href={q.lead ? `/crm/${q.lead.id}` : "/quotations"} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <IconBack className="size-4" />{q.lead ? q.lead.title : "Quotations"}
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2"><QuoteStatus s={q.status} />{locked && <span className="text-xs text-slate-500">Locked — create a revision to change it</span>}</div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{quoteRef(q.number, q.revision)}</h1>
          <p className="text-sm text-slate-500">{q.customer?.name ?? "No customer"} · {inr(q.total)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/print/quotations/${q.id}`} target="_blank" className="btn-secondary">Print / PDF</a>
          {q.status === "draft" && <form action={setQuoteStatus.bind(null, q.id, "sent")}><button className="btn-primary">Mark as sent</button></form>}
          {q.status === "sent" && (
            <>
              <form action={setQuoteStatus.bind(null, q.id, "accepted")}><button className="btn bg-emerald-600 text-white hover:bg-emerald-700">Accepted</button></form>
              <form action={setQuoteStatus.bind(null, q.id, "rejected")}><button className="btn-secondary">Rejected</button></form>
            </>
          )}
          {locked && <form action={reviseQuotation.bind(null, q.id)}><button className="btn-secondary">New revision</button></form>}
          {q.status !== "draft" && <form action={setQuoteStatus.bind(null, q.id, "draft")}><button className="btn-ghost">Back to draft</button></form>}
          {q.status === "draft" && <form action={deleteQuotation.bind(null, q.id)}><button className="btn-ghost text-red-600">Delete</button></form>}
        </div>
      </div>
      <QuoteEditor q={q} customers={lk.customers} users={lk.users} products={prods} readOnly={locked} ai={aiEnabled()} />
    </div>
  );
}
