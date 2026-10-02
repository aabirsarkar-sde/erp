import { getCompany } from "@/lib/core/company";
import { PrintButton } from "@/components/ui/print-button";

export async function PrintShell({ title, subtitle, children, landscape }: { title: string; subtitle?: string; children: React.ReactNode; landscape?: boolean }) {
  const co = await getCompany();
  return (
    <div className="min-h-dvh bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; } @media print { body { background: white; } }`}</style>
      <PrintButton />
      <article className={`mx-auto bg-white p-8 text-[11px] leading-relaxed text-slate-800 shadow print:max-w-none print:p-0 print:shadow-none ${landscape ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
        <header className="mb-4 flex items-end justify-between border-b-2 border-brand-600 pb-3">
          <div className="flex items-center gap-2.5">
            { }
            <img src="/brand-icon.svg" alt="" className="size-9" />
            <div><div className="text-base font-bold text-slate-900">{co.name}</div><div className="text-slate-500">{co.address}</div></div>
          </div>
          <div className="text-right">
            <div className="text-base font-bold text-brand-700">{title}</div>
            {subtitle && <div className="text-slate-500">{subtitle}</div>}
            <div className="text-slate-400">Printed {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
          </div>
        </header>
        {children}
      </article>
    </div>
  );
}
