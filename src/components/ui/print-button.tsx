"use client";
import { useEffect } from "react";
export function PrintButton({ auto }: { auto?: boolean }) {
  useEffect(() => { if (auto) setTimeout(() => window.print(), 400); }, [auto]);
  return (
    <div className="mb-4 flex justify-center gap-2 print:hidden">
      <button onClick={() => window.print()} className="btn-primary">Print / Save as PDF</button>
      <button onClick={() => window.close()} className="btn-secondary">Close</button>
    </div>
  );
}
