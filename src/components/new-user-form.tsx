"use client";
import { useActionState, useEffect, useRef } from "react";
import { createUser } from "@/app/actions/admin";

export function NewUserForm({ zones = [], crm = true, hd = true }: { zones?: { id: number; name: string }[]; crm?: boolean; hd?: boolean }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-6">
      <input name="name" required placeholder="Full name" className="input sm:col-span-2" />
      <input name="email" type="email" required placeholder="Email" className="input sm:col-span-2" />
      <input name="password" type="text" required minLength={6} placeholder="Temp password" className="input" />
      <select name="role" className="input" defaultValue="agent">
        <option value="agent">User</option>
        <option value="manager">Manager</option>
        <option value="admin">Admin</option>
      </select>
      <input name="title" placeholder="Title (e.g. Zonal Manager — Dahej)" className="input sm:col-span-2" />
      {crm && <select name="crmAccess" className="input sm:col-span-2" defaultValue={hd ? "none" : "own"}><option value="none">Sales/CRM: no access</option><option value="own">Sales/CRM: own + followed</option><option value="all">Sales/CRM: all opportunities</option></select>}
      {hd && <select name="hdAccess" className="input sm:col-span-2" defaultValue="zone"><option value="none">Helpdesk: no access</option><option value="zone">Helpdesk: own zone(s)</option><option value="all">Helpdesk: all zones</option></select>}
      {hd && zones.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 sm:col-span-6"><span className="text-xs text-slate-500">Zones:</span>
          {zones.map((z) => <label key={z.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs"><input type="checkbox" name="zones" value={z.id} className="accent-brand-600" />{z.name}</label>)}
        </div>
      )}
      <div className="flex items-center gap-3 sm:col-span-6">
        <button disabled={pending} className="btn-primary">Add user</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
