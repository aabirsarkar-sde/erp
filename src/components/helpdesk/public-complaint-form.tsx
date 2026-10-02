"use client";
import { useActionState, useState } from "react";
import { submitPublicComplaint } from "@/app/actions/public";
import { COMPLAINT_TYPES, TYPE_META } from "@/lib/helpdesk/constants";

export function PublicComplaintForm({ plantNo }: { plantNo?: string }) {
  const [state, action, pending] = useActionState(submitPublicComplaint, undefined);
  const [type, setType] = useState("");
  if (state?.ok) return (
    <div className="card p-6 text-center">
      <div className="text-3xl">✅</div>
      <h2 className="mt-2 text-lg font-semibold">Complaint registered</h2>
      <p className="mt-1 text-sm text-slate-600">Your reference number is <b className="font-mono">{state.ref}</b>. Our team has been notified and will contact you shortly.</p>
      <a href="/complaint/status" className="btn-secondary mt-4">Check status</a>
    </div>
  );
  return (
    <form action={action} className="card space-y-4 p-5">
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" />
      <label className="block"><span className="label">Plant number *</span><input name="plantNo" required defaultValue={plantNo} placeholder="e.g. PLT-012 (on your nameplate / AMC)" className="input font-mono uppercase" /></label>
      <div>
        <span className="label">Type of complaint *</span>
        <input type="hidden" name="type" value={type} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COMPLAINT_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={`rounded-lg border px-2 py-2 text-xs font-medium ${type === t ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600"}`}>{TYPE_META[t]!.icon} {t}</button>
          ))}
        </div>
      </div>
      <label className="block"><span className="label">Describe the problem *</span><textarea name="narration" required rows={5} className="input" placeholder="What is happening, since when, any alarms or readings…" /></label>
      <div className="grid gap-2 sm:grid-cols-3">
        <input name="name" required placeholder="Your name *" className="input" />
        <input name="phone" type="tel" placeholder="Phone" className="input" />
        <input name="email" type="email" placeholder="Email (for updates)" className="input" />
      </div>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full py-2.5">{pending ? "Submitting…" : "Submit complaint"}</button>
    </form>
  );
}
