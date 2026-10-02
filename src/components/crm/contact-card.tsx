"use client";
import { useTransition } from "react";
import { updateLead } from "@/app/actions/crm";
import { missingContact } from "@/lib/crm/meta";

type C = { id: number; contactName: string | null; phone: string | null; email: string | null; address: string | null; city: string | null };

function F({ name, label, type = "text", value, link, optional, onSave }: { name: keyof C; label: string; type?: string; value: string | null; link?: string; optional?: boolean; onSave: (e: React.FocusEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 flex items-center justify-between text-[11px] font-medium text-slate-500">{label}{value && link && <a href={link} className="font-normal text-brand-700 hover:underline">{type === "tel" ? "Call" : "Email"}</a>}</span>
      <input name={name} type={type} defaultValue={value ?? ""} onBlur={onSave} placeholder={`Add ${label.toLowerCase()}`} className={`input py-1.5 text-sm ${value?.trim() || optional ? "" : "border-amber-300 bg-amber-50/50 placeholder:text-amber-700/60"}`} />
    </label>
  );
}

/** Contact details at the top of an opportunity. Empty fields are highlighted and edited in place. */
export function ContactCard({ l }: { l: C }) {
  const [pending, start] = useTransition();
  const missing = missingContact(l);
  const save = (e: React.FocusEvent<HTMLInputElement>) => { if (e.target.value !== e.target.defaultValue) { const fd = new FormData(); fd.set(e.target.name, e.target.value); start(() => updateLead(l.id, fd)); } };
  return (
    <section key={JSON.stringify(l)} className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Contact details</h2>
        <span className={`text-xs ${pending ? "text-slate-400" : missing.length ? "font-medium text-amber-700" : "text-emerald-700"}`}>
          {pending ? "Saving…" : missing.length ? `Missing: ${missing.join(", ")} — reminder added` : "✓ Complete"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <F onSave={save} name="contactName" label="Contact person" value={l.contactName} />
        <F onSave={save} name="phone" label="Phone" type="tel" value={l.phone} link={l.phone ? `tel:${l.phone}` : undefined} />
        <F onSave={save} name="email" label="Email" type="email" value={l.email} link={l.email ? `mailto:${l.email}` : undefined} />
        <F onSave={save} name="city" label="City" value={l.city} optional />
        <div className="sm:col-span-2"><F onSave={save} name="address" label="Address" value={l.address} /></div>
      </div>
    </section>
  );
}
