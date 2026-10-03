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
import { setAutoTriage, setHoEmails, saveCanned, deleteCanned, setDailyReportTo, setNudgeRules, runNudgesNow, setEnquiryAssign, checkMailboxNow, setCaptureUsers } from "@/app/actions/admin";
import { nudgeSettings } from "@/lib/crm/nudges";
import { graphConfigured, graphInboxes, graphSender, mailboxStatus } from "@/lib/core/graph";
import { RunButton } from "@/components/workspace/run-button";
import { saveStage, moveStage, deleteStage, addRaybonStages } from "@/app/actions/structure";
import { getStages } from "@/lib/crm/queries";
import { RAYBON_STAGES, stageColor } from "@/lib/crm/meta";
import { leads as leadsT } from "@/db";
import { appUrl } from "@/lib/core/mail";
import { getHoEmails } from "@/lib/helpdesk/notify";
import { cannedResponses } from "@/db";
import { db as _db, aiUsage, settings as settingsT } from "@/db";
import { eq, gte, sql } from "drizzle-orm";
import { PageHeader, Avatar } from "@/components/ui/ui";
import { NewUserForm } from "@/components/workspace/new-user-form";
import { editionHasCrm, editionHasHd } from "@/lib/core/edition";
import { getTagDefs } from "@/lib/crm/tags";
import { saveTagDef, deleteTagDef } from "@/app/actions/crm";
import { TAG_GROUP_LIST, TAG_COLORS, tagCls } from "@/lib/crm/meta";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireAdmin();
  const ai = aiConfig();
  const [[usage], triageRow] = await Promise.all([
    _db.select({ n: sql<number>`count(*)`, err: sql<number>`coalesce(sum(case when ${aiUsage.ok} then 0 else 1 end),0)`, tok: sql<number>`coalesce(sum(${aiUsage.promptTokens} + ${aiUsage.completionTokens}),0)` }).from(aiUsage).where(gte(aiUsage.createdAt, new Date(Date.now() - 7 * 864e5))),
    _db.query.settings.findFirst({ where: eq(settingsT.key, "ai_auto_triage") }),
  ]);
  const autoTriage = triageRow?.value !== "off";
  const [ho, canned, reportToRow] = await Promise.all([getHoEmails(), _db.select().from(cannedResponses), _db.query.settings.findFirst({ where: eq(settingsT.key, "daily_report_to") })]);
  const reportTo = reportToRow?.value ?? "";
  const [nudgeCfg, enqRow, mbx, capRow] = await Promise.all([nudgeSettings(), _db.query.settings.findFirst({ where: eq(settingsT.key, "enquiry_assign_to") }), mailboxStatus(), _db.query.settings.findFirst({ where: eq(settingsT.key, "capture_users") })]);
  const capSet = new Set((capRow?.value ?? "").split(",").map(Number).filter(Boolean));
  const [stagesAll, stageCounts] = editionHasCrm ? await Promise.all([getStages(), _db.select({ s: leadsT.stageId, n: sql<number>`count(*)` }).from(leadsT).groupBy(leadsT.stageId)]) : [[], []];
  const enqTo = new Set((enqRow?.value ?? "").split(",").map(Number).filter(Boolean));
  const [co, sla, us, ts, labelDefs] = await Promise.all([
    getCompany(),
    getSla(),
    db.query.users.findMany({ orderBy: asc(users.name), columns: { passwordHash: false } }),
    db.query.teams.findMany({ orderBy: asc(teams.id), with: { members: true } }),
    editionHasCrm ? getTagDefs() : Promise.resolve([]),
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
                  {u.id !== me.id && <a href={`/settings/handover?from=${u.id}`} className="text-[11px] text-brand-700 hover:underline">Hand over their work →</a>}
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
      {editionHasCrm && (
        <section className="card p-4 text-sm" data-testid="stages">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Pipeline stages</h2>
            {RAYBON_STAGES.some((r) => !stagesAll.some((x) => x.name.toLowerCase() === r.name.toLowerCase())) && <form action={addRaybonStages}><button className="btn-secondary py-1 text-xs">Add the suggested stages: {RAYBON_STAGES.map((r) => r.name).join(" → ")}</button></form>}
          </div>
          <p className="mb-3 mt-1 text-xs text-slate-500">Rename, reorder or remove stages. The % is the default probability when a deal enters the stage. Won / Lost are outcomes, not stages.</p>
          <ul className="divide-y divide-slate-100">
            {stagesAll.map((st, i) => {
              const n = Number(stageCounts.find((x) => x.s === st.id)?.n ?? 0);
              return (
                <li key={st.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className={`size-2.5 rounded-full ${stageColor(st.color).dot}`} />
                  <form action={saveStage.bind(null, st.id)} className="flex flex-1 flex-wrap items-center gap-2">
                    <input name="name" defaultValue={st.name} className="input w-56 py-1 text-sm" aria-label="Stage name" />
                    <input name="probability" type="number" min={0} max={100} defaultValue={st.probability} className="input w-20 py-1 text-sm" aria-label="Probability" />
                    <select name="color" defaultValue={st.color} className="input w-28 py-1 text-sm" aria-label="Colour">{["sky", "indigo", "violet", "amber", "red", "emerald", "slate"].map((c) => <option key={c}>{c}</option>)}</select>
                    <button className="btn-secondary py-1 text-xs">Save</button>
                  </form>
                  <span className="text-xs text-slate-400">{n} deal{n === 1 ? "" : "s"}</span>
                  <form action={moveStage.bind(null, st.id, -1)}><button disabled={i === 0} className="px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" title="Move up">↑</button></form>
                  <form action={moveStage.bind(null, st.id, 1)}><button disabled={i === stagesAll.length - 1} className="px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" title="Move down">↓</button></form>
                  <details className="relative"><summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-red-600">Remove</summary>
                    <form action={deleteStage.bind(null, st.id)} className="card absolute right-0 z-10 mt-1 w-60 space-y-2 p-3 shadow-lg">
                      {n > 0 && <select name="moveTo" required className="input py-1 text-sm" aria-label="Move deals to"><option value="">Move its {n} deal(s) to…</option>{stagesAll.filter((x) => x.id !== st.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
                      <button className="btn-primary w-full py-1 text-xs">Remove stage</button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
          <form action={saveStage.bind(null, null)} className="mt-2 flex flex-wrap gap-2">
            <input name="name" required placeholder="New stage" className="input w-56 py-1 text-sm" />
            <input name="probability" type="number" min={0} max={100} defaultValue={20} className="input w-20 py-1 text-sm" />
            <input type="hidden" name="color" value="slate" />
            <button className="btn-primary py-1 text-xs">Add stage</button>
          </form>
        </section>
      )}

      {editionHasCrm && (
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">AI follow-up suggestions</h2>
          <p className="mb-2 text-xs text-slate-500">Every morning each salesperson gets a few suggestions in their bell (🔔) — e.g. &quot;it&apos;s been 9 days since the quotation to X, call today&quot; — with one-tap Call / WhatsApp / Email. Needs CRON_SECRET; wording uses the AI key when set.</p>
          <form action={setNudgeRules} className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600">Days after a quotation / jar test<input name="quoteDays" type="number" min={1} max={90} defaultValue={nudgeCfg.quoteDays} className="input mt-1 w-28" /></label>
            <label className="text-xs text-slate-600">Days with no contact at all<input name="silenceDays" type="number" min={1} max={180} defaultValue={nudgeCfg.silenceDays} className="input mt-1 w-28" /></label>
            <label className="text-xs text-slate-600">Max suggestions per person per day<input name="perPerson" type="number" min={1} max={20} defaultValue={nudgeCfg.perPerson} className="input mt-1 w-28" /></label>
            <button className="btn-primary">Save</button>
          </form>
          <div className="mt-3"><RunButton action={runNudgesNow} label="Send today's suggestions now" format="nudges" /></div>
        </section>
      )}

      {editionHasCrm && (
        <section className="card p-4 text-sm" data-testid="capture-settings">
          <h2 className="font-semibold">Email capture — customer emails into the CRM automatically</h2>
          <p className="mt-1 text-xs text-slate-500">Emails exchanged with <b>known customers</b> are added to that customer&apos;s opportunity (subject + first 1,500 characters). Internal mail and mail with unknown addresses is never stored.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
            <li><b>BCC / forward (works for everyone):</b> BCC {graphInboxes()[0] ?? "the sales mailbox"} on an email to a customer, or forward a customer&apos;s email to it. Put <code>[OPP-123]</code> in the subject to file it on a specific opportunity.</li>
            <li><b>Outlook capture (automatic):</b> tick the people below. Their sent and received mail and their meetings with customers are logged within minutes{graphConfigured() ? "" : " — switches on once Microsoft 365 is connected (needs Mail.ReadWrite and Calendars.Read)"}.</li>
          </ul>
          <form action={setCaptureUsers} className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {us.filter((u) => u.active && u.crmAccess !== "none").map((u) => <label key={u.id} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="userIds" value={u.id} defaultChecked={capSet.has(u.id)} />{u.name}</label>)}
            <button className="btn-primary ml-auto">Save</button>
          </form>
        </section>
      )}

      {editionHasCrm && (
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">New enquiries go to</h2>
          <p className="mb-2 text-xs text-slate-500">Website, email and WhatsApp enquiries land in Enquiries. If the sender is an existing customer with an open opportunity, its owner is alerted; otherwise these people are (none ticked = all sales managers).</p>
          <form action={setEnquiryAssign} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {us.filter((u) => u.active && u.crmAccess !== "none").map((u) => <label key={u.id} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="userIds" value={u.id} defaultChecked={enqTo.has(u.id)} />{u.name}</label>)}
            <button className="btn-primary ml-auto">Save</button>
          </form>
        </section>
      )}

      {editionHasCrm && (
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">Daily sales report</h2>
          <p className="mb-2 text-xs text-slate-500">Every evening at 7:30 pm the team&apos;s planner, work done and diary are emailed to these addresses (blank = all admins). Needs email (SMTP) and CRON_SECRET set up.</p>
          <form action={setDailyReportTo} className="flex gap-2">
            <input name="to" defaultValue={reportTo} placeholder="chandan@raybonchemicals.com" className="input" />
            <button className="btn-primary">Save</button>
          </form>
        </section>
      )}

      {editionHasCrm && (
        <section className="card">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold">Opportunity labels</h2>
            <p className="text-xs text-slate-500">Salespeople can create labels on the fly; here you give them a group (used for “Group by geography / temperature” and dashboards) and a colour. “OR FY…” is added automatically when an opportunity is won.</p>
          </div>
          <div className="space-y-3 p-4">
            {TAG_GROUP_LIST.map((g) => {
              const xs = labelDefs.filter((d) => d.group === g);
              return (
                <div key={g} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-24 text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</span>
                  {xs.length === 0 && <span className="text-xs text-slate-400">—</span>}
                  {xs.map((d) => (
                    <form key={d.name} action={deleteTagDef.bind(null, d.name)} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tagCls(d.name, labelDefs)}`}>
                      {d.name}<button className="opacity-40 hover:opacity-100" title="Remove label definition">×</button>
                    </form>
                  ))}
                </div>
              );
            })}
            <form action={saveTagDef} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <input name="name" required placeholder="Label, e.g. Bharuch or Big ticket" className="input w-56 py-1.5" />
              <select name="group" className="input w-36 py-1.5">{TAG_GROUP_LIST.map((g) => <option key={g}>{g}</option>)}</select>
              <select name="color" className="input w-32 py-1.5" defaultValue=""><option value="">Group colour</option>{Object.keys(TAG_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <button className="btn-secondary py-1.5">Save label</button>
            </form>
          </div>
        </section>
      )}

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
        <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-slate-600 sm:grid-cols-[9rem_1fr]">
          <dt className="font-medium text-slate-800">Sending</dt>
          <dd>{graphSender() ? <>Through Microsoft 365 as <b>{graphSender()}</b></> : mailEnabled() ? "Through SMTP" : "Not set up — emails are only logged. Set MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET / MS_SEND_FROM (recommended for raybonchemicals.com) or SMTP_*."}</dd>
          <dt className="font-medium text-slate-800">Email in</dt>
          <dd>{graphConfigured() && graphInboxes().length ? <>Reading <b>{graphInboxes().join(", ")}</b> — {editionHasCrm && !editionHasHd ? "new mail becomes an enquiry" : editionHasHd && !editionHasCrm ? "new mail becomes a ticket (replies thread onto it)" : "sales@ → enquiry, others → ticket"}.</> : <>Not connected. With Microsoft 365 set up, add MS_INBOX (e.g. {editionHasHd && !editionHasCrm ? "support" : "sales"}@raybonchemicals.com). Any other mail service can also POST to <code className="text-xs">{appUrl()}/api/inbound-email</code>.</>}</dd>
          {mbx && <><dt className="font-medium text-slate-800">Last check</dt><dd className={mbx.ok ? "" : "text-red-600"}>{new Date(mbx.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} — {mbx.detail}</dd></>}
        </dl>
        {graphConfigured() && <div className="mt-3"><RunButton action={checkMailboxNow} label="Check mailbox now" format="mailbox" /></div>}
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
