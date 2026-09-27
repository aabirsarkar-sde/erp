export function PublicShell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <main className="min-h-dvh bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-10" />
          <div><div className="text-lg font-semibold">{title}</div><div className="text-xs text-slate-500">Zero Discharge Systems Pvt. Ltd. · Raybon / Rochem service</div></div>
        </div>
        {children}
      </div>
    </main>
  );
}
