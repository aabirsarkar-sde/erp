"use client";
import { useActionState } from "react";
import { submitWebEnquiry } from "@/app/actions/enquiries";

const PRODUCTS = ["Zero Liquid Discharge (ZLD)", "RO / Reverse osmosis plant", "Effluent treatment (ETP)", "Sewage treatment (STP)", "Evaporator / MEE", "Membranes & spares", "O&M / AMC service", "Other"];

/** public "Contact sales" form — also embeddable on the company website (/enquiry?embed=1) */
export function EnquiryForm({ product }: { product?: string }) {
  const [state, action, pending] = useActionState(submitWebEnquiry, undefined);
  if (state?.ok) return (
    <div className="card p-6 text-center" data-testid="enquiry-thanks">
      <div className="text-3xl">✅</div>
      <h2 className="mt-2 text-lg font-semibold">Thank you — we&apos;ve received your enquiry</h2>
      <p className="mt-1 text-sm text-slate-600">Our sales team will get back to you shortly.</p>
    </div>
  );
  return (
    <form action={action} className="card space-y-3 p-5">
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Your name *</span><input name="name" required className="input" autoComplete="name" /></label>
        <label className="block"><span className="label">Company</span><input name="company" className="input" autoComplete="organization" /></label>
        <label className="block"><span className="label">Phone</span><input name="phone" type="tel" className="input" autoComplete="tel" /></label>
        <label className="block"><span className="label">Email</span><input name="email" type="email" className="input" autoComplete="email" /></label>
        <label className="block"><span className="label">City / plant location</span><input name="city" className="input" /></label>
        <label className="block"><span className="label">Interested in</span><select name="product" defaultValue={product ?? ""} className="input"><option value="">Choose…</option>{PRODUCTS.map((p) => <option key={p}>{p}</option>)}</select></label>
      </div>
      <label className="block"><span className="label">Your requirement *</span><textarea name="message" required rows={4} className="input" placeholder="e.g. 300 KLD effluent from a pharma unit, looking for a ZLD solution…" /></label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full">{pending ? "Sending…" : "Send enquiry"}</button>
      <p className="text-center text-[11px] text-slate-400">We use these details only to reply to your enquiry.</p>
    </form>
  );
}
