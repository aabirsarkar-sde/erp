import { asc } from "drizzle-orm";
import { db, users, teams } from "@/db";
import { requireAdmin } from "@/lib/core/auth";
import { createTeam, toggleTeam, toggleMember, updateUser, updateSla } from "@/app/actions/admin";
import { getSla } from "@/lib/helpdesk/sla";
import { getCompany } from "@/lib/core/company";
import { updateCompany } from "@/app/actions/quotations";
import { Field } from "@/components/ui/ui";
import { PRIORITIES } from "@/lib/helpdesk/constants";
import { mailEnabled } from "@/lib/core/mail";
import { aiConfig, aiEnabled } from "@/lib/ai/client";
import { setAutoTriage, setHoEmails, saveCanned, deleteCanned } from "@/app/actions/admin";
import { getHoEmails } from "@/lib/helpdesk/notify";
import { cannedResponses } from "@/db";
import { db as _db, aiUsage, settings as settingsT } from "@/db";
import { eq, gte, sql } from "drizzle-orm";
import { PageHeader, Avatar } from "@/components/ui/ui";
import { NewUserForm } from "@/components/workspace/new-user-form";
import { editionHasCrm, editionHasHd } from "@/lib/core/edition";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireAdmin();
  const ai = aiConfig();
  const [[usage], triageRow] = await Promise.all([
    _db.select({ n: sql<number>`count(*)`, err: sql<number>`coalesce(sum(case when ${aiUsage.ok} then 0 else 1 end),0)`, tok: sql<number>`coalesce(sum(${aiUsage.promptTokens} + ${aiUsage.completionTokens}),0)` }).from(aiUsage).where(gte(aiUsage.createdAt, new Date(Date.now() - 7 * 864e5))),
    _db.query.settings.findFirst({ where: eq(settingsT.key, "ai_auto_triage") }),
  ]);
  const autoTriage = triageRow?.value !== "off";
  const [ho, canned] = await Promise.all([getHoEmails(), _db.select().from(cannedResponses)]);
  const [co, sla, us, ts] = await Promise.all([
    getCompany(),
    getSla(),
    db.query.users.findMany({ orderBy: asc(users.name), columns: { passwordHash: false } }),
    db.query.teams.findMany({ orderBy: asc(teams.id), with: { members: true } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title="Settings" subtitle={editionHasHd ? "Manage zones and who can sign in." : "Manage who can sign in."} actions={<a href="/settings/import" className="btn-secondary">Import from Odoo</a>} />

      <section className="card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Users</h2>
          <p className="text-xs text-slate-500">{editionHasCrm && <><b>Sales/CRM — own</b>: only opportunities they own, are assigned to, or follow. </>}{editionHasHd && <><b>Helpdesk — own zone(s)</b>: only tickets in the zones ticked under “Zones” below, plus tickets assigned to them or that they follow. </>}Admins can also change settings. There is no limit on the number of users.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {us.map((u) => (
            <li key={u.id} className="px-4 py-3">
              <form action={updateUser.bind(null, u.id)} className="flex flex-wrap items-center gap-3">
                <Avatar name={u.name} />
                <div className="min-w-0 flex-1 basis-40">
                  <div className={`text-sm font-medium ${u.active ? "" : "text-slate-400 line-through"}`}>{u.name}</div>
                  <div className="truncate text-xs text-slate-500">{u.email}</div>
                </div>
                <input name="title" defaultValue={u.title ?? ""} placeholder="Title, e.g. Zonal Manager" className="input w-44 py-1.5 text-xs" />
                {editionHasCrm && <label className="text-[11px] text-slate-500">Sales/CRM
                  <select name="crmAccess" defaultValue={u.crmAccess} disabled={u.id === me.id} className="input block w-auto py-1 text-xs">
                    <option value="none">No access</option><option value="own">Own + followed</option><option value="all">All opportunities</option>
                  </select>
                </label>}
                {editionHasHd && <label className="text-[11px] text-slate-500">Helpdesk/O&M
                  <select name="hdAccess" defaultValue={u.hdAccess} disabled={u.id === me.id} className="input block w-auto py-1 text-xs">
                    <option value="none">No access</option><option value="zone">Own zone(s)</option><option value="all">All zones</option>
                  </select>
                </label>}
                <label className="text-[11px] text-slate-500">Role
                  <select name="role" defaultValue={u.role} disabled={u.id === me.id} className="input block w-auto py-1 text-xs">
                    <option value="agent">User</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin (settings)</option>
                  </select>
                </label>
                <input name="password" placeholder="New password" className="input w-36 py-1.5" />
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" name="active" defaultChecked={u.active} disabled={u.id === me.id} className="accent-brand-600" /> Active
                </label>
                <button className="btn-secondary py-1.5">Save</button>
              </form>
            </li>
          ))}
        </ul>
        <NewUserForm crm={editionHasCrm} hd={editionHasHd} zones={ts.filter((t) => t.active).map((t) => ({ id: t.id, name: t.location ?? t.name }))} />
      </section>

      {editionHasHd && <>
      <section className="card p-4 text-sm">
        <h2 className="font-semibold">Rochem HO — copied on every complaint</h2>
        <p className="mb-2 text-xs text-slate-500">These addresses automatically follow every ticket: they get the new-complaint email, every reply in the chain, and the closure mail with TAT.</p>
        <form action={setHoEmails} className="flex gap-2">
          <input name="ho" defaultValue={ho.join(", ")} placeholder="service.head@rochem.com, ho@rochem.com" className="input" />
          <button className="btn-primary">Save</button>
        </form>
      </section>

      <section className="card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Canned replies</h2>
          <p className="text-xs text-slate-500">Ready-made answers engineers can insert into a reply. Use {"{name}"} and {"{plant}"} — they are filled in automatically.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {canned.map((c) => (
            <li key={c.id} className="p-4">
              <form action={saveCanned.bind(null, c.id)} className="space-y-2">
                <input name="title" defaultValue={c.title} className="input py-1.5 font-medium" />
                <textarea name="body" defaultValue={c.body} rows={3} className="input text-sm" />
                <div className="flex gap-2"><button className="btn-secondary py-1 text-xs">Save</button><button formAction={deleteCanned.bind(null, c.id)} className="btn-ghost py-1 text-xs text-red-600">Delete</button></div>
              </form>
            </li>
          ))}
        </ul>
        <form action={saveCanned.bind(null, null)} className="space-y-2 border-t border-slate-100 bg-brand-50/30 p-4">
          <input name="title" required placeholder="New reply title" className="input py-1.5" />
          <textarea name="body" required rows={3} placeholder="Dear {name}, …" className="input text-sm" />
          <button className="btn-primary py-1.5 text-xs">Add canned reply</button>
        </form>
      </section>

      <section className="card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Response targets (SLA)</h2>
          <p className="text-xs text-slate-500">Hours to first reply and to resolve, by priority. New tickets get a due date from the resolve target.</p>
        </div>
        <form action={updateSla} className="p-4">
          <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-2 text-sm sm:max-w-md">
            <span />
            <span className="label mb-0">First reply (h)</span>
            <span className="label mb-0">Resolve (h)</span>
            {PRIORITIES.map((p) => (
              <div key={p.value} className="contents">
                <span className={`font-medium ${p.cls}`}>{p.label}</span>
                <input name={`response_${p.value}`} type="number" min="0.5" step="0.5" defaultValue={sla.response[p.value]} className="input py-1.5" />
                <input name={`resolution_${p.value}`} type="number" min="1" step="1" defaultValue={sla.resolution[p.value]} className="input py-1.5" />
              </div>
            ))}
          </div>
          <button className="btn-primary mt-4">Save targets</button>
        </form>
      </section>

      </>}
      <section className="card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Company details</h2>
          <p className="text-xs text-slate-500">Printed on quotations.</p>
        </div>
        <form action={updateCompany} className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Company name" className="sm:col-span-2"><input name="name" defaultValue={co.name} className="input" /></Field>
          <Field label="Address" className="sm:col-span-2"><textarea name="address" rows={2} defaultValue={co.address} className="input" /></Field>
          <Field label="GSTIN"><input name="gstin" defaultValue={co.gstin} className="input" /></Field>
          <Field label="Phone"><input name="phone" defaultValue={co.phone} className="input" /></Field>
          <Field label="Email"><input name="email" defaultValue={co.email} className="input" /></Field>
          <Field label="Website"><input name="website" defaultValue={co.website} className="input" /></Field>
          <Field label="Bank details" className="sm:col-span-2"><textarea name="bank" rows={3} defaultValue={co.bank} className="input" placeholder="Bank, A/c no., IFSC, branch" /></Field>
          <div><button className="btn-primary">Save company details</button></div>
        </form>
      </section>

      <section className="card p-4 text-sm">
        <h2 className="font-semibold">AI</h2>
        {aiEnabled() ? (
          <div className="mt-1 space-y-2 text-slate-600">
            <p>{ai.mock ? "Running in demo mode (AI_PROVIDER=mock) — answers are canned." : <>Connected to <b className="font-medium text-slate-800">{new URL(ai.base).host}</b> using <b className="font-medium text-slate-800">{ai.model}</b>.</>}</p>
            <p>Last 7 days: {Number(usage!.n)} requests{Number(usage!.err) ? `, ${usage!.err} failed` : ""}{Number(usage!.tok) ? `, ~${Number(usage!.tok).toLocaleString("en-IN")} tokens` : ""}.</p>
            {editionHasHd && <form action={setAutoTriage.bind(null, !autoTriage)} className="flex items-center gap-3">
              <span>Auto-triage tickets that arrive by email: <b className="font-medium text-slate-800">{autoTriage ? "On" : "Off"}</b></span>
              <button className="btn-secondary py-1 text-xs">{autoTriage ? "Turn off" : "Turn on"}</button>
            </form>}
          </div>
        ) : (
          <p className="mt-1 text-slate-600">AI is off. Get a free key at aistudio.google.com/apikey and set AI_API_KEY in .env, then restart. (Free-tier prompts may be used by Google to improve its models — use a paid key if that matters.)</p>
        )}
      </section>

      <section className="card p-4 text-sm">
        <h2 className="font-semibold">Email</h2>
        <p className="mt-1 text-slate-600">
          {mailEnabled() ? "Outgoing email is configured. Replies and assignment alerts are being sent." : "Outgoing email is not configured yet. Replies and alerts are only logged. Add SMTP settings to .env (see README) to turn it on."}
        </p>
      </section>

      {editionHasHd && <section className="card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Zones (support teams)</h2>
          <p className="text-xs text-slate-500">One zone per region. Tap a person to give them that zone — zonal users only see tickets of their own zone(s).</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {ts.map((t) => {
            const ids = new Set(t.members.map((m) => m.userId));
            return (
              <li key={t.id} className={`px-4 py-3 ${t.active ? "" : "opacity-50"}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{t.location ?? t.name}</span>
                  <form action={toggleTeam.bind(null, t.id, !t.active)}><button className="text-xs text-slate-500 hover:text-slate-900">{t.active ? "Archive" : "Restore"}</button></form>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {us.filter((u) => u.active).map((u) => {
                    const on = ids.has(u.id);
                    return (
                      <form key={u.id} action={toggleMember.bind(null, t.id, u.id, !on)}>
                        <button className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${on ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-white text-slate-400 ring-slate-200 hover:text-slate-700"}`}>
                          {on ? "✓ " : "+ "}{u.name}
                        </button>
                      </form>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        <form action={createTeam} className="flex gap-2 border-t border-slate-100 p-4">
          <input name="location" required placeholder="New location, e.g. Bharuch" className="input" />
          <button className="btn-primary">Add team</button>
        </form>
      </section>}
    </div>
  );
}
