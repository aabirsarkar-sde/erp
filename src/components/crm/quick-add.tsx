"use client";
import { useActionState, useState } from "react";
import { createLead } from "@/app/actions/crm";

type Opt = { id: number; name: string };

/** The 30-second version of "new opportunity": five fields, the rest can be filled in later. */
export function QuickAdd({ customers, products }: { customers: Opt[]; products: string[] }) {
  const [state, action, pending] = useActionState(createLead, undefined);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const existing = customers.find((c) => c.name.toLowerCase() === company.trim().toLowerCase());
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn-secondary">⚡ Quick add</button>
      {open && (
        <form action={action} className="card absolute right-0 z-30 mt-1 w-80 space-y-2 p-3 shadow-lg">
          <input type="hidden" name="kind" value="opportunity" />
          <input type="hidden" name="title" value={`${company.trim() || "New"} — ${product.trim() || "enquiry"}`} />
          {existing ? <input type="hidden" name="customerId" value={existing.id} /> : <input type="hidden" name="companyName" value={company} />}
          <input value={company} onChange={(e) => setCompany(e.target.value)} list="qa-customers" required placeholder="Company *" className="input py-1.5" autoFocus />
          <datalist id="qa-customers">{customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          {company && <p className="-mt-1 text-[11px] text-slate-500">{existing ? "✓ Existing customer — contact details filled in from their record" : "New company — it will be added to Customers"}</p>}
          <input name="product" value={product} onChange={(e) => setProduct(e.target.value)} list="qa-products" placeholder="Product / service" className="input py-1.5" />
          <datalist id="qa-products">{products.map((p) => <option key={p} value={p} />)}</datalist>
          <input name="expectedRevenue" inputMode="numeric" placeholder="Approx. value ₹" className="input py-1.5 tabular-nums" />
          <div className="grid grid-cols-2 gap-2">
            <input name="contactName" placeholder="Contact person" className="input py-1.5" />
            <input name="phone" type="tel" placeholder="Phone" className="input py-1.5" />
          </div>
          <div className="flex items-center gap-2">
            <button disabled={pending} className="btn-primary flex-1 py-1.5">{pending ? "Adding…" : "Add opportunity"}</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost py-1.5">Cancel</button>
          </div>
          {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
