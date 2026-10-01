"use client";
import { useState } from "react";
import { importRows, type ImportResult } from "@/app/actions/import";
import { parseCsv, guessMapping, FIELDS, type ImportKind } from "@/lib/csv";

const KINDS: { k: ImportKind; label: string; hint: string }[] = [
  { k: "contacts", label: "Contacts & companies", hint: "Odoo → Contacts → select all → Action → Export. Tick Name, Is a Company, Related Company, Email, Phone, Mobile, City, Street, Tax ID, Job Position." },
  { k: "plants", label: "Plants", hint: "A sheet with one row per plant: Plant number, Plant name, Customer, Zone (Vadodara, Ankleshwar…), City, State, Capacity. Save it as CSV from Excel." },
  { k: "leads", label: "CRM opportunities", hint: "Odoo → CRM → Pipeline (list view, remove the “My Pipeline” filter) → select all → Export. Tick Opportunity, Customer, Stage, Expected Revenue, Probability, Salesperson, Tags, Contact Name, Email, Phone, City, Expected Closing, Priority." },
  { k: "tickets", label: "Helpdesk tickets", hint: "Odoo → Helpdesk → Tickets (list view) → select all → Export. Tick Subject, Customer, Helpdesk Team, Stage, Priority, Assigned to, Description, Created on." },
];

export function Importer({ crm = true, hd = true }: { crm?: boolean; hd?: boolean }) {
  const kinds = KINDS.filter((k) => (k.k !== "leads" || crm) && (!["tickets", "plants"].includes(k.k) || hd));
  const [kind, setKind] = useState<ImportKind>("contacts");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async (f: File) => {
    setErr(null); setResult(null);
    if (!/\.csv$/i.test(f.name)) return setErr("Please export from Odoo as CSV (in the export dialog, choose the CSV format).");
    const all = parseCsv(await f.text());
    if (all.length < 2) return setErr("That file has no data rows.");
    setFileName(f.name); setHeaders(all[0]!); setRows(all.slice(1)); setMap(guessMapping(kind, all[0]!));
  };
  const switchKind = (k: ImportKind) => { setKind(k); setResult(null); if (headers.length) setMap(guessMapping(k, headers)); };

  const fields = FIELDS[kind];
  const missing = fields.filter((f) => f.required && map[f.key] === undefined);
  const mapped = (r: string[]) => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, r[i] ?? ""]));

  const run = async () => {
    setBusy(true); setErr(null); setProgress(0);
    const total: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    try {
      for (let i = 0; i < rows.length; i += 400) {
        const r = await importRows(kind, rows.slice(i, i + 400).map(mapped));
        total.created += r.created; total.updated += r.updated; total.skipped += r.skipped; total.errors.push(...r.errors);
        setProgress(Math.min(rows.length, i + 400));
      }
      setResult(total);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:w-fit">
          {kinds.map((k) => <button key={k.k} onClick={() => switchKind(k.k)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${kind === k.k ? "bg-white shadow-sm" : "text-slate-500"}`}>{k.label}</button>)}
        </div>
        <p className="text-xs text-slate-500">{KINDS.find((k) => k.k === kind)!.hint}</p>
        <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 hover:border-brand-400">
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <span className="font-medium text-slate-700">{fileName ? `${fileName} — ${rows.length.toLocaleString("en-IN")} rows` : "Choose the CSV exported from Odoo"}</span>
          {fileName && <span className="text-xs">Click to choose a different file</span>}
        </label>
        {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      </div>

      {headers.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-1 text-sm font-semibold">Match the columns</h2>
          <p className="mb-3 text-xs text-slate-500">We guessed from the Odoo column names — check and fix anything that&apos;s wrong.</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="grid grid-cols-[9rem_1fr] items-center gap-2 text-sm">
                <span className={f.required ? "font-medium" : "text-slate-600"}>{f.label}{f.required && " *"}</span>
                <select value={map[f.key] ?? ""} onChange={(e) => { const m = { ...map }; if (e.target.value === "") delete m[f.key]; else m[f.key] = Number(e.target.value); setMap(m); }} className="input py-1 text-xs">
                  <option value="">— skip —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</h3>
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500"><tr>{fields.filter((f) => map[f.key] !== undefined).map((f) => <th key={f.key} className="whitespace-nowrap px-2 py-1.5 font-medium">{f.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 5).map((r, i) => <tr key={i}>{fields.filter((f) => map[f.key] !== undefined).map((f) => <td key={f.key} className="max-w-48 truncate px-2 py-1.5">{r[map[f.key]!]}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={run} disabled={busy || missing.length > 0} className="btn-primary">{busy ? `Importing… ${progress}/${rows.length}` : `Import ${rows.length.toLocaleString("en-IN")} rows`}</button>
            {missing.length > 0 && <span className="text-xs text-red-600">Map the required column: {missing.map((m) => m.label).join(", ")}</span>}
            <span className="text-xs text-slate-500">Safe to run twice — existing records are matched and updated, not duplicated.</span>
          </div>
          {result && (
            <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              ✓ Done — {result.created} created, {result.updated} updated, {result.skipped} skipped.
              {result.errors.length > 0 && <details className="mt-1 text-red-700"><summary>{result.errors.length} problems</summary><ul className="mt-1 list-disc pl-5 text-xs">{result.errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
