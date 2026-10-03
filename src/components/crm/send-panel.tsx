"use client";
import { useActionState, useState, useTransition } from "react";
import { collateralLink, logWhatsApp, sendTemplateEmail } from "@/app/actions/templates";
import { aiFollowUp } from "@/app/actions/ai";
import { sendReminder } from "@/app/actions/notifications";
import { fillTemplate, type TemplateVars } from "@/lib/crm/templates-meta";
import { waLink } from "@/lib/core/links";

type Tpl = { id: number; kind: "whatsapp" | "email"; name: string; category: string | null; subject: string | null; body: string };
type Doc = { id: number; name: string; category: string | null };

/** Send a WhatsApp or email to the customer from a template, with case studies / brochures. Logged on the opportunity. */
export function SendPanel({ leadId, vars, phone, email, templates, collateral, ai, initialTab = "whatsapp" }: { leadId: number; vars: TemplateVars; phone: string | null; email: string | null; templates: Tpl[]; collateral: Doc[]; ai: boolean; initialTab?: "whatsapp" | "email" }) {
  const [tab, setTab] = useState<"whatsapp" | "email">(initialTab);
  return (
    <section className="card" id="send">
      <div className="flex items-center gap-1 border-b border-slate-100 px-2 pt-2">
        <h2 className="px-2 pb-2 text-sm font-semibold">Send to customer</h2>
        {(["whatsapp", "email"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 pb-2 text-sm font-medium ${tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`}>{t === "whatsapp" ? "💬 WhatsApp" : "✉️ Email"}</button>
        ))}
      </div>
      <div className="p-4">
        {tab === "whatsapp"
          ? <WhatsAppForm leadId={leadId} vars={vars} phone={phone} templates={templates.filter((t) => t.kind === "whatsapp")} collateral={collateral} />
          : <EmailForm leadId={leadId} vars={vars} email={email} templates={templates.filter((t) => t.kind === "email")} collateral={collateral} ai={ai} />}
      </div>
    </section>
  );
}

function WhatsAppForm({ leadId, vars, phone, templates, collateral }: { leadId: number; vars: TemplateVars; phone: string | null; templates: Tpl[]; collateral: Doc[] }) {
  const [text, setText] = useState("");
  const [to, setTo] = useState(phone ?? "");
  const [doc, setDoc] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const apply = (id: string, link?: string) => { const t = templates.find((x) => String(x.id) === id); if (t) setText(fillTemplate(t.body, { ...vars, link: link ?? null })); };
  const attach = (id: string) => start(async () => {
    setDoc(id);
    if (!id) return;
    const link = await collateralLink(Number(id));
    const name = collateral.find((d) => String(d.id) === id)?.name ?? "document";
    setText((t) => (t.includes("[link]") ? t.replace("[link]", link) : `${t}${t ? "\n\n" : ""}${name}: ${link}`));
  });
  const open = () => {
    window.open(waLink(to, text), "_blank", "noopener");
    start(async () => { await logWhatsApp(leadId, text); setMsg("Logged on the opportunity ✓"); });
  };
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <select onChange={(e) => apply(e.target.value)} defaultValue="" className="input py-1.5 text-sm" aria-label="WhatsApp template">
          <option value="">{templates.length ? "Choose a template…" : "No WhatsApp templates yet"}</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.category ? `${t.category} · ` : ""}{t.name}</option>)}
        </select>
        <select value={doc} onChange={(e) => attach(e.target.value)} className="input py-1.5 text-sm" aria-label="Attach case study or brochure">
          <option value="">Add a case study / brochure link…</option>
          {collateral.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Mobile number" className="input py-1.5 text-sm" aria-label="WhatsApp number" />
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Message" className="input text-sm" aria-label="WhatsApp message" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!text.trim() || pending} onClick={open} className="btn bg-emerald-600 text-white hover:bg-emerald-700">Open in WhatsApp</button>
        <button type="button" disabled={!text.trim()} onClick={() => { void navigator.clipboard?.writeText(text); setMsg("Copied"); }} className="btn-secondary">Copy</button>
        {msg && <span className="text-xs text-emerald-700">{msg}</span>}
        {!to && <span className="text-xs text-slate-500">No number — WhatsApp will ask you to pick the chat.</span>}
      </div>
    </div>
  );
}

function EmailForm({ leadId, vars, email, templates, collateral, ai }: { leadId: number; vars: TemplateVars; email: string | null; templates: Tpl[]; collateral: Doc[]; ai: boolean }) {
  const [state, action, pending] = useActionState(sendTemplateEmail.bind(null, leadId), undefined);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState(email ?? "");
  const [busy, start] = useTransition();
  const [err, setErr] = useState("");
  const apply = (id: string) => { const t = templates.find((x) => String(x.id) === id); if (t) { setSubject(fillTemplate(t.subject ?? "", vars)); setBody(fillTemplate(t.body, vars)); } };
  const draft = () => start(async () => { setErr(""); const r = await aiFollowUp(leadId); if (r.ok) { setSubject(r.data.subject); setBody(r.data.body); } else setErr(r.error); });
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <form action={action} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <select onChange={(e) => apply(e.target.value)} defaultValue="" className="input py-1.5 text-sm" aria-label="Email template">
          <option value="">{templates.length ? "Choose a template…" : "No email templates yet"}</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.category ? `${t.category} · ` : ""}{t.name}</option>)}
        </select>
        <input name="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Customer email" className="input py-1.5 text-sm" aria-label="To" />
      </div>
      <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="input py-1.5 text-sm" aria-label="Subject" />
      <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="Message" className="input text-sm" aria-label="Email body" />
      {collateral.length > 0 && (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <legend className="mb-1 text-xs font-medium text-slate-500">Attach</legend>
          {collateral.map((d) => <label key={d.id} className="flex items-center gap-1.5"><input type="checkbox" name="attach" value={d.id} />{d.name}</label>)}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending || !body.trim()} className="btn-primary">{pending ? "Sending…" : "Send from CRM"}</button>
        <a href={mailto} className="btn-secondary">Open in Outlook</a>
        {ai && <button type="button" onClick={draft} disabled={busy} className="btn-secondary">{busy ? "Drafting…" : "✨ AI draft"}</button>}
        {(state?.ok || state?.error || err) && <span className={`text-xs ${state?.error || err ? "text-red-600" : "text-emerald-700"}`}>{state?.ok ?? state?.error ?? err}</span>}
      </div>
    </form>
  );
}

/** "Please call this party" — supervisors nudge a salesperson; it lands in their calendar and bell */
export function ReminderForm({ leadId, users, defaultUserId, customer }: { leadId: number; users: { id: number; name: string }[]; defaultUserId: number | null; customer: string }) {
  const [state, action, pending] = useActionState(sendReminder.bind(null, leadId), undefined);
  return (
    <form action={action} className="space-y-2" data-testid="reminder-form">
      <div className="grid grid-cols-2 gap-2">
        <select name="userId" defaultValue={defaultUserId ?? ""} className="input col-span-2 py-1.5 text-sm" aria-label="Remind">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select name="type" defaultValue="call" className="input py-1.5 text-sm" aria-label="Type"><option value="call">Call</option><option value="visit">Visit</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="meeting">Meeting</option></select>
        <input name="date" type="date" className="input py-1.5 text-sm" aria-label="When" />
      </div>
      <div className="flex flex-col gap-2">
        <input name="message" required defaultValue={`Please call ${customer} today`} className="input py-1.5 text-sm" aria-label="Reminder" />
        <button disabled={pending} className="btn-primary py-1.5 text-sm">{pending ? "Sending…" : "Remind"}</button>
      </div>
      {(state?.ok || state?.error) && <p className={`text-xs ${state.error ? "text-red-600" : "text-emerald-700"}`}>{state.ok ?? state.error}</p>}
    </form>
  );
}
