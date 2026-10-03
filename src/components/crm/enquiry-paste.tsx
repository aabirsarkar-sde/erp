"use client";
import { useActionState } from "react";
import { addPastedEnquiry } from "@/app/actions/enquiries";

/** paste a forwarded WhatsApp chat (or note a phone enquiry) — AI fills in name, company, product */
export function EnquiryPaste({ initial, ai }: { initial?: string; ai: boolean }) {
  const [state, action, pending] = useActionState(addPastedEnquiry, undefined);
  return (
    <form action={action} className="space-y-2" data-testid="enquiry-paste">
      <textarea name="text" required rows={initial ? 6 : 3} defaultValue={initial} placeholder="Paste the WhatsApp chat here (long-press → Forward / Export chat → copy), or type what the caller asked for…" className="input text-sm" aria-label="Chat or notes" />
      <div className="flex flex-wrap items-center gap-2">
        <select name="source" defaultValue="whatsapp" className="input w-auto py-1.5 text-sm" aria-label="Came in by"><option value="whatsapp">WhatsApp</option><option value="phone">Phone call</option><option value="other">Other</option></select>
        <input name="phone" placeholder="Their number (if not in the chat)" className="input w-56 py-1.5 text-sm" aria-label="Phone" />
        <button disabled={pending} className="btn-primary py-1.5 text-sm">{pending ? (ai ? "Reading the chat…" : "Adding…") : "Add enquiry"}</button>
        {ai && <span className="text-xs text-violet-700">✨ AI picks out the name, company, number and what they want</span>}
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
