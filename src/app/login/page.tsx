"use client";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-10" />
          <div>
            <div className="text-lg font-semibold">Raybon ERP</div>
            <div className="text-xs text-slate-500">Zero Discharge Systems Pvt. Ltd.</div>
          </div>
        </div>
        <form action={action} className="card space-y-4 p-6">
          <h1 className="text-base font-semibold">Sign in</h1>
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required autoComplete="email" className="input" placeholder="you@company.com" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className="input" />
          </label>
          {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
          <button disabled={pending} className="btn-primary w-full">{pending ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </main>
  );
}
