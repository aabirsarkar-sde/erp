"use client";
import { useActionState, useEffect, useRef } from "react";
import { uploadLeadDocs } from "@/app/actions/crm";

export function LeadDocUpload({ leadId }: { leadId: number }) {
  const [state, action, pending] = useActionState(uploadLeadDocs.bind(null, leadId), undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input name="files" type="file" multiple className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input name="description" className="input py-1.5" placeholder="Description, e.g. Techno-commercial offer Rev 1" />
        <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="isProposal" defaultChecked className="size-4 accent-brand-600" /> This is a proposal</label>
        <button disabled={pending} className="btn-primary shrink-0 py-1.5">{pending ? "Uploading…" : "Upload"}</button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">Uploaded ✓</p>}
    </form>
  );
}
