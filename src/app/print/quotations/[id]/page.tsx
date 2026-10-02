import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, quotations, quotationLines } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { canSeeQuotation } from "@/lib/core/access";
import { getCompany } from "@/lib/core/company";
import { PrintButton } from "@/components/ui/print-button";
import { quoteRef } from "@/lib/crm/meta";
import { inr, fmtDate, amountInWords } from "@/lib/core/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const q = await db.query.quotations.findFirst({ where: eq(quotations.id, Number((await params).id)), with: { customer: { columns: { name: true } } } });
  return { title: q ? `${quoteRef(q.number, q.revision)} — ${q.customer?.name ?? ""}` : "Quotation" };
}

export default async function PrintQuotation({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!Number.isFinite(id) || !(await canSeeQuotation(me, id))) notFound();
  const [q, co] = await Promise.all([
    db.query.quotations.findFirst({ where: eq(quotations.id, id), with: { lines: { orderBy: asc(quotationLines.sort) }, customer: true, contact: true, salesperson: { columns: { name: true, email: true, phone: true } } } }),
    getCompany(),
  ]);
  if (!q) notFound();
  const gross = q.lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);

  return (
    <div className="min-h-dvh bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: white; } }`}</style>
      <PrintButton />
      <article className="mx-auto max-w-[210mm] bg-white p-10 text-[12px] leading-relaxed text-slate-800 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-brand-600 pb-4">
          <div className="flex items-start gap-3">
            { }
            <img src="/brand-icon.svg" alt="" className="size-12" />
            <div>
              <div className="text-lg font-bold text-slate-900">{co.name}</div>
              <div className="whitespace-pre-line text-slate-600">{co.address}</div>
              <div className="text-slate-600">{[co.phone, co.email, co.website].filter(Boolean).join(" · ")}</div>
              {co.gstin && <div className="text-slate-600">GSTIN: {co.gstin}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold uppercase tracking-wide text-brand-700">Quotation</div>
            <table className="ml-auto mt-1 text-right">
              <tbody>
                <tr><td className="pr-3 text-slate-500">No.</td><td className="font-semibold">{quoteRef(q.number, q.revision)}</td></tr>
                <tr><td className="pr-3 text-slate-500">Date</td><td>{fmtDate(q.date)}</td></tr>
                {q.validUntil && <tr><td className="pr-3 text-slate-500">Valid until</td><td>{fmtDate(q.validUntil)}</td></tr>}
              </tbody>
            </table>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">To</div>
            <div className="font-semibold text-slate-900">{q.customer?.name}</div>
            {q.contact && <div>Kind attn: {q.contact.name}</div>}
            {q.customer?.address && <div className="whitespace-pre-line text-slate-600">{q.customer.address}</div>}
            {q.customer?.city && !q.customer.address && <div className="text-slate-600">{q.customer.city}</div>}
            {q.customer?.gstin && <div className="text-slate-600">GSTIN: {q.customer.gstin}</div>}
          </div>
          {q.salesperson && (
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Contact person</div>
              <div className="font-medium">{q.salesperson.name}</div>
              <div className="text-slate-600">{[q.salesperson.phone, q.salesperson.email].filter(Boolean).join(" · ")}</div>
            </div>
          )}
        </section>

        {q.subject && <p className="mt-5"><b>Subject:</b> {q.subject}</p>}

        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-600">
              <th className="border border-slate-200 px-2 py-1.5 w-8">#</th>
              <th className="border border-slate-200 px-2 py-1.5">Description</th>
              <th className="border border-slate-200 px-2 py-1.5 text-right">Qty</th>
              <th className="border border-slate-200 px-2 py-1.5 text-right">Rate (₹)</th>
              <th className="border border-slate-200 px-2 py-1.5 text-right">GST</th>
              <th className="border border-slate-200 px-2 py-1.5 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="align-top">
            {q.lines.map((l, i) => {
              const [first, ...rest] = l.description.split("\n");
              return (
                <tr key={l.id} className="break-inside-avoid">
                  <td className="border border-slate-200 px-2 py-1.5">{i + 1}</td>
                  <td className="border border-slate-200 px-2 py-1.5"><div className="font-medium">{first}</div>{rest.length > 0 && <div className="whitespace-pre-line text-slate-600">{rest.join("\n")}</div>}</td>
                  <td className="whitespace-nowrap border border-slate-200 px-2 py-1.5 text-right">{l.qty} {l.unit}</td>
                  <td className="whitespace-nowrap border border-slate-200 px-2 py-1.5 text-right tabular-nums">{inr(l.unitPrice, 2).slice(1)}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">{l.taxRate}%</td>
                  <td className="whitespace-nowrap border border-slate-200 px-2 py-1.5 text-right tabular-nums">{inr(l.qty * l.unitPrice, 2).slice(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <table className="w-72 text-right tabular-nums">
            <tbody>
              {q.discount > 0 && (
                <>
                  <tr><td className="py-0.5 pr-4 text-slate-500">Gross</td><td>{inr(gross, 2)}</td></tr>
                  <tr><td className="py-0.5 pr-4 text-slate-500">Discount</td><td>− {inr(q.discount, 2)}</td></tr>
                </>
              )}
              <tr><td className="py-0.5 pr-4 text-slate-500">Taxable value</td><td>{inr(q.subtotal, 2)}</td></tr>
              {q.taxMode === "intra" ? (
                <>
                  <tr><td className="py-0.5 pr-4 text-slate-500">CGST</td><td>{inr(q.tax / 2, 2)}</td></tr>
                  <tr><td className="py-0.5 pr-4 text-slate-500">SGST</td><td>{inr(q.tax / 2, 2)}</td></tr>
                </>
              ) : (
                <tr><td className="py-0.5 pr-4 text-slate-500">IGST</td><td>{inr(q.tax, 2)}</td></tr>
              )}
              <tr className="border-t-2 border-slate-800 text-sm font-bold"><td className="py-1 pr-4">Total</td><td>{inr(q.total, 2)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-right text-[11px] italic text-slate-600">{amountInWords(q.total)}</p>

        {q.terms && (
          <section className="mt-6 break-inside-avoid">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Terms & conditions</div>
            <ol className="list-decimal space-y-0.5 pl-5 text-slate-700">
              {q.terms.split("\n").filter((x) => x.trim()).map((t, i) => <li key={i}>{t}</li>)}
            </ol>
          </section>
        )}
        {co.bank && (
          <section className="mt-4 break-inside-avoid">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Bank details</div>
            <p className="whitespace-pre-line text-slate-700">{co.bank}</p>
          </section>
        )}
        <footer className="mt-12 flex justify-end break-inside-avoid">
          <div className="text-center">
            <div className="text-slate-600">For {co.name}</div>
            <div className="mt-12 border-t border-slate-400 px-8 pt-1 text-slate-600">Authorised signatory</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
