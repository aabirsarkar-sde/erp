"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { saveTemplate, deleteTemplate, collateralLink } from "@/app/actions/templates";
import { uploadDocuments, deleteDocument } from "@/app/actions/documents";
import { PLACEHOLDERS, TEMPLATE_CATEGORIES, COLLATERAL_CATEGORIES } from "@/lib/crm/templates-meta";

type Tpl = { id: number; kind: "whatsapp" | "email"; name: string; category: string | null; subject: string | null; body: string };

export function TemplateForm({ kind, t, onDone }: { kind: "whatsapp" | "email"; t?: Tpl; onDone?: () => void }) {
  const [state, action, pending] = useActionState(async (p: { ok?: number; error?: string } | undefined, fd: FormData) => {
    const r = await saveTemplate(t?.id ?? null, p, fd);
    if (r.ok) onDone?.();
    return r;
  }, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (state?.ok && !t) ref.current?.reset(); }, [state, t]);
  const insert = (k: string) => { const el = body.current; if (!el) return; const at = el.selectionStart ?? el.value.length; el.value = `${el.value.slice(0, at)}{{${k}}}${el.value.slice(at)}`; el.focus(); };
  return (
    <form ref={ref} action={action} className="space-y-2" data-testid={`template-form-${kind}`}>
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <input name="name" required defaultValue={t?.name} placeholder="Template name — e.g. Follow-up after quotation" className="input py-1.5 text-sm" aria-label="Template name" />
        <select name="category" defaultValue={t?.category ?? "Follow-up"} className="input py-1.5 text-sm" aria-label="Category">{TEMPLATE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {kind === "email" && <input name="subject" defaultValue={t?.subject ?? ""} placeholder="Subject" className="input py-1.5 text-sm" aria-label="Subject" />}
      <textarea ref={body} name="body" required rows={kind === "email" ? 8 : 5} defaultValue={t?.body} placeholder={kind === "whatsapp" ? "Dear {{contact}}, greetings from Raybon…" : "Dear {{contact}},\n\n…\n\nRegards,\n{{salesperson}}"} className="input text-sm" aria-label="Message" />
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        Insert: {PLACEHOLDERS.map(([k, l]) => <button key={k} type="button" onClick={() => insert(k)} title={l} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono hover:bg-brand-50 hover:text-brand-700">{`{{${k}}}`}</button>)}
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className="btn-primary py-1.5 text-sm">{pending ? "Saving…" : t ? "Save" : "Add template"}</button>
        {t && <button type="button" onClick={onDone} className="btn-secondary py-1.5 text-sm">Cancel</button>}
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}

export function TemplateCard({ t, canEdit }: { t: Tpl; canEdit: boolean }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  if (edit) return <div className="card p-4"><TemplateForm kind={t.kind} t={t} onDone={() => setEdit(false)} /></div>;
  return (
    <div className="card flex flex-col p-4">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div><div className="text-sm font-semibold">{t.name}</div>{t.category && <div className="text-[11px] text-slate-500">{t.category}</div>}</div>
        <span className="flex shrink-0 gap-2 text-xs">
          <button onClick={() => { void navigator.clipboard?.writeText(t.kind === "email" && t.subject ? `${t.subject}\n\n${t.body}` : t.body); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="text-slate-500 hover:underline">{copied ? "Copied ✓" : "Copy"}</button>
          {canEdit && <button onClick={() => setEdit(true)} className="text-brand-700 hover:underline">Edit</button>}
          {canEdit && <button disabled={pending} onClick={() => confirm(`Delete "${t.name}"?`) && start(() => deleteTemplate(t.id))} className="text-slate-400 hover:text-red-600">Delete</button>}
        </span>
      </div>
      {t.subject && <div className="text-xs font-medium text-slate-700">Subject: {t.subject}</div>}
      <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-sm text-slate-600">{t.body}</p>
    </div>
  );
}

export function CollateralUpload() {
  const [state, action, pending] = useActionState(uploadDocuments, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]" data-testid="collateral-upload">
      <input name="files" type="file" multiple required className="input py-1 text-sm" aria-label="Files" />
      <select name="category" defaultValue="case_study" className="input py-1.5 text-sm" aria-label="Kind">{COLLATERAL_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <input name="description" placeholder="Description — e.g. 450 KLD ZLD, pharma, Dahej" className="input py-1.5 text-sm" aria-label="Description" />
      <button disabled={pending} className="btn-primary py-1.5 text-sm">{pending ? "Uploading…" : "Upload"}</button>
      {state?.error && <p className="text-xs text-red-600 sm:col-span-4">{state.error}</p>}
    </form>
  );
}

export function CollateralActions({ id, canDelete }: { id: number; canDelete: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="flex shrink-0 items-center gap-3 text-xs">
      <button disabled={pending} onClick={() => start(async () => { const l = await collateralLink(id); await navigator.clipboard?.writeText(l).catch(() => {}); setMsg("Link copied ✓ (valid 30 days)"); })} className="text-brand-700 hover:underline">{msg || "Copy share link"}</button>
      {canDelete && <button disabled={pending} onClick={() => confirm("Delete this file?") && start(() => deleteDocument(id))} className="text-slate-400 hover:text-red-600">Delete</button>}
    </span>
  );
}
