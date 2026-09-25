"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveQuotation } from "@/app/actions/quotations";
import { quoteTotals, type Line } from "@/lib/quote-math";
import { inr, fmtDateInput } from "@/lib/format";
import { Field } from "./ui";
import { aiScope } from "@/app/actions/ai";
import { AiButton, AiError } from "./ai-ui";

type Opt = { id: number; name: string };
type Product = { id: number; name: string; description: string | null; unit: string; price: number; taxRate: number };
type Q = {
  id: number; customerId: number | null; subject: string | null; date: Date; validUntil: Date | null; salespersonId: number | null;
  taxMode: "intra" | "inter"; discount: number; terms: string | null; lines: Line[];
};

export function QuoteEditor({ q, customers, users, products, readOnly, ai }: { q: Q; customers: Opt[]; users: Opt[]; products: Product[]; readOnly: boolean; ai?: boolean }) {
  const [h, setH] = useState({
    customerId: q.customerId, subject: q.subject ?? "", date: fmtDateInput(q.date), validUntil: fmtDateInput(q.validUntil),
    salespersonId: q.salespersonId, taxMode: q.taxMode, discount: q.discount, terms: q.terms ?? "",
  });
  const [lines, setLines] = useState<Line[]>(q.lines.length ? q.lines : []);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [scopeReq, setScopeReq] = useState("");
  const [scopeErr, setScopeErr] = useState<string | null>(null);
  const [scoping, startScope] = useTransition();
  const runScope = () => startScope(async () => {
    setScopeErr(null);
    const r = await aiScope(scopeReq, q.id);
    if (!r.ok) return setScopeErr(r.error);
    setLines((prev) => [...prev, ...r.data.lines.map((l) => ({ productId: null, description: l.description, qty: l.qty, unit: l.unit, unitPrice: 0, taxRate: 18 }))]);
    setDirty(true); setScopeReq("");
  });
  const t = useMemo(() => quoteTotals(lines, h.discount), [lines, h.discount]);

  const upd = <K extends keyof typeof h>(k: K, v: (typeof h)[K]) => { setH({ ...h, [k]: v }); setDirty(true); };
  const updLine = (i: number, patch: Partial<Line>) => { setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l))); setDirty(true); };
  const addLine = (p?: Product) => {
    setLines([...lines, p ? { productId: p.id, description: `${p.name}${p.description ? `\n${p.description}` : ""}`, qty: 1, unit: p.unit, unitPrice: p.price, taxRate: p.taxRate } : { productId: null, description: "", qty: 1, unit: "Nos", unitPrice: 0, taxRate: 18 }]);
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) => { const n = [...lines]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j]!, n[i]!]; setLines(n); setDirty(true); };

  const save = () =>
    start(async () => {
      const valid = lines.filter((l) => l.description.trim());
      const r = await saveQuotation(q.id, { ...h, subject: h.subject || null, validUntil: h.validUntil || null, terms: h.terms || null, discount: Number(h.discount) || 0, lines: valid });
      if (r && "error" in r) setMsg(r.error!);
      else { setDirty(false); setMsg("Saved"); setTimeout(() => setMsg(null), 2000); }
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (!readOnly) save(); } };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey); window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  });

  const num = (v: string) => (v === "" ? 0 : Number(v));
  const cell = "input px-2 py-1.5 tabular-nums";

  return (
    <fieldset disabled={readOnly} className="space-y-5">
      <div className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Customer" className="sm:col-span-2">
          <select value={h.customerId ?? ""} onChange={(e) => upd("customerId", e.target.value ? Number(e.target.value) : null)} className="input">
            <option value="">— Select customer —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={h.date} onChange={(e) => upd("date", e.target.value)} className="input" /></Field>
        <Field label="Valid until"><input type="date" value={h.validUntil} onChange={(e) => upd("validUntil", e.target.value)} className="input" /></Field>
        <Field label="Subject" className="sm:col-span-2"><input value={h.subject} onChange={(e) => upd("subject", e.target.value)} className="input" placeholder="Techno-commercial offer for …" /></Field>
        <Field label="Salesperson">
          <select value={h.salespersonId ?? ""} onChange={(e) => upd("salespersonId", e.target.value ? Number(e.target.value) : null)} className="input">
            <option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="GST">
          <select value={h.taxMode} onChange={(e) => upd("taxMode", e.target.value as "intra" | "inter")} className="input">
            <option value="intra">CGST + SGST (within state)</option>
            <option value="inter">IGST (other state)</option>
          </select>
        </Field>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="w-8 px-2 py-2.5" /><th className="px-2 py-2.5">Description</th><th className="w-20 px-2 py-2.5 text-right">Qty</th><th className="w-24 px-2 py-2.5">Unit</th><th className="w-36 px-2 py-2.5 text-right">Rate (₹)</th><th className="w-20 px-2 py-2.5 text-right">GST %</th><th className="w-36 px-3 py-2.5 text-right">Amount</th><th className="w-8" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-2 py-2 text-center text-xs text-slate-400">
                    <div className="flex flex-col items-center">
                      <button type="button" onClick={() => move(i, -1)} className="hover:text-slate-700">▲</button>
                      <span>{i + 1}</span>
                      <button type="button" onClick={() => move(i, 1)} className="hover:text-slate-700">▼</button>
                    </div>
                  </td>
                  <td className="px-2 py-2"><textarea value={l.description} onChange={(e) => updLine(i, { description: e.target.value })} rows={Math.min(5, Math.max(2, l.description.split("\n").length))} className="input px-2 py-1.5" placeholder="Item / scope description" /></td>
                  <td className="px-2 py-2"><input value={l.qty} onChange={(e) => updLine(i, { qty: num(e.target.value) })} inputMode="decimal" className={`${cell} text-right`} /></td>
                  <td className="px-2 py-2"><input value={l.unit} onChange={(e) => updLine(i, { unit: e.target.value })} className={cell} /></td>
                  <td className="px-2 py-2"><input value={l.unitPrice} onChange={(e) => updLine(i, { unitPrice: num(e.target.value) })} inputMode="decimal" className={`${cell} text-right`} /></td>
                  <td className="px-2 py-2"><input value={l.taxRate} onChange={(e) => updLine(i, { taxRate: num(e.target.value) })} inputMode="decimal" className={`${cell} text-right`} /></td>
                  <td className="px-3 py-3.5 text-right font-medium tabular-nums">{inr(l.qty * l.unitPrice, 2)}</td>
                  <td className="py-3"><button type="button" onClick={() => { setLines(lines.filter((_, j) => j !== i)); setDirty(true); }} className="px-2 text-slate-300 hover:text-red-600" title="Remove">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
            <button type="button" onClick={() => addLine()} className="btn-secondary py-1.5">+ Add line</button>
            <select value="" onChange={(e) => { const p = products.find((x) => x.id === Number(e.target.value)); if (p) addLine(p); }} className="input w-auto py-1.5">
              <option value="">+ Add product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {inr(p.price)}</option>)}
            </select>
          </div>
        )}
        {!readOnly && ai && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-violet-50/40 px-4 py-3">
            <input value={scopeReq} onChange={(e) => setScopeReq(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runScope(); } }} placeholder="Describe the scope, e.g. 450 KLD RO + MEE for pharma effluent with ATFD" className="input min-w-0 flex-1 py-1.5" />
            <AiButton onClick={runScope} busy={scoping} className="py-1.5">Write lines</AiButton>
            <div className="w-full"><AiError msg={scopeErr} /></div>
          </div>
        )}
        <div className="flex justify-end border-t border-slate-200 bg-slate-50/60 px-4 py-4">
          <dl className="w-full max-w-sm space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-slate-500">Gross</dt><dd>{inr(t.gross, 2)}</dd></div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Discount (₹)</dt>
              <dd><input value={h.discount || ""} onChange={(e) => upd("discount", num(e.target.value))} inputMode="decimal" placeholder="0" className="input w-36 px-2 py-1 text-right" /></dd>
            </div>
            <div className="flex justify-between"><dt className="text-slate-500">Taxable value</dt><dd>{inr(t.subtotal, 2)}</dd></div>
            {h.taxMode === "intra" ? (
              <>
                <div className="flex justify-between"><dt className="text-slate-500">CGST</dt><dd>{inr(t.tax / 2, 2)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">SGST</dt><dd>{inr(t.tax / 2, 2)}</dd></div>
              </>
            ) : (
              <div className="flex justify-between"><dt className="text-slate-500">IGST</dt><dd>{inr(t.tax, 2)}</dd></div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><dt>Total</dt><dd>{inr(t.total, 2)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="card p-5">
        <Field label="Terms & conditions"><textarea value={h.terms} onChange={(e) => upd("terms", e.target.value)} rows={7} className="input font-mono text-xs" /></Field>
      </div>

      {!readOnly && (
        <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 md:bottom-4">
          {msg && <span className="rounded-md bg-white px-2 py-1 text-sm text-slate-600 shadow">{msg}</span>}
          {dirty && !msg && <span className="rounded-md bg-white px-2 py-1 text-xs text-amber-700 shadow">Unsaved changes</span>}
          <button type="button" onClick={save} disabled={pending} className="btn-primary px-6 py-2.5 shadow-lg">{pending ? "Saving…" : "Save quotation"}</button>
        </div>
      )}
    </fieldset>
  );
}
