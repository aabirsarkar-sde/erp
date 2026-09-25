"use client";
import { useActionState, useEffect, useRef } from "react";
import { createUser } from "@/app/actions/admin";

export function NewUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-6">
      <input name="name" required placeholder="Full name" className="input sm:col-span-2" />
      <input name="email" type="email" required placeholder="Email" className="input sm:col-span-2" />
      <input name="password" type="text" required minLength={6} placeholder="Temp password" className="input" />
      <select name="role" className="input" defaultValue="agent">
        <option value="agent">Agent</option>
        <option value="manager">Manager</option>
        <option value="admin">Admin</option>
      </select>
      <div className="flex items-center gap-3 sm:col-span-6">
        <button disabled={pending} className="btn-primary">Add user</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
