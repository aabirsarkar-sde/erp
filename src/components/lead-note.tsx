"use client";
import { useActionState, useEffect, useRef } from "react";
import { addLeadNote } from "@/app/actions/crm";

export function LeadNote({ leadId }: { leadId: number }) {
  const [state, action, pending] = useActionState(addLeadNote.bind(null, leadId), undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="flex gap-2">
      <input name="body" className="input" placeholder="Add a note…" />
      <button disabled={pending} className="btn-secondary">Add</button>
    </form>
  );
}
