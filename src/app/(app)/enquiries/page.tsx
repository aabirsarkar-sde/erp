import Link from "next/link";
import { and, asc, desc, eq, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, enquiries, customers, users, leads } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { leadScope, requireDept } from "@/lib/core/access";
import { enquiryCounts } from "@/lib/crm/enquiries";
import { convertEnquiry, attachEnquiry, assignEnquiry, setEnquiryStatus } from "@/app/actions/enquiries";
import { aiEnabled } from "@/lib/ai/client";
import { PageHeader, Avatar } from "@/components/ui/ui";
import { EnquiryPaste } from "@/components/crm/enquiry-paste";
import { CopyField } from "@/components/ui/copy-field";
import { appUrl } from "@/lib/core/mail";
import { graphConfigured, graphInboxes } from "@/lib/core/graph";
import { timeAgo } from "@/lib/core/format";
import { scoreEnquiry } from "@/lib/crm/score-rules";
import { ScoreBadge } from "@/components/crm/score-badge";

export const metadata = { title: "Enquiries" };

const SRC: Record<string, { icon: string; label: string; cls: string }> = {
  website: { icon: "🌐", label: "Website", cls: "bg-sky-50 text-sky-800" },
  email: { icon: "✉️", label: "Email", cls: "bg-violet-50 text-violet-800" },
  whatsapp: { icon: "💬", label: "WhatsApp", cls: "bg-emerald-50 text-emerald-800" },
  phone: { icon: "📞", label: "Phone", cls: "bg-amber-50 text-amber-800" },
  other: { icon: "•", label: "Other", cls: "bg-slate-100 text-slate-700" },
};

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ s?: string; open?: string; src?: string; sort?: string }> }) {
  const me = await requireUser();
  requireDept(me, "crm");
  const sp = await searchParams;
  const status = sp.s === "done" ? "done" : sp.s === "dismissed" ? "dismissed" : sp.s === "all" ? "all" : "new";
  const c: SQL[] = [];
  if (status === "new") c.push(eq(enquiries.status, "new"));
  else if (status === "dismissed") c.push(eq(enquiries.status, "dismissed"));
  else if (status === "done") c.push(ne(enquiries.status, "new"), ne(enquiries.status, "dismissed"));
  if (sp.src && SRC[sp.src]) c.push(eq(enquiries.source, sp.src as "website"));
  const assignee = alias(users, "assignee");
  const [rows0, counts, team, openLeads] = await Promise.all([
    db.select({ e: enquiries, customer: customers.name, assignee: assignee.name, lead: leads.title })
      .from(enquiries).leftJoin(customers, eq(customers.id, enquiries.customerId)).leftJoin(assignee, eq(assignee.id, enquiries.assignedToId)).leftJoin(leads, eq(leads.id, enquiries.leadId))
      .where(c.length ? and(...c) : undefined).orderBy(desc(enquiries.createdAt)).limit(200),
    enquiryCounts(),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.active, true), ne(users.crmAccess, "none"))).orderBy(asc(users.name)),
    db.select({ id: leads.id, title: leads.title, customerId: leads.customerId }).from(leads).where(and(eq(leads.status, "open"), leadScope(me))).orderBy(asc(leads.title)),
  ]);
  const n = (s: string) => Number(counts.find((x) => x.status === s)?.n ?? 0);
  const rows = rows0.map((r) => ({ ...r, score: scoreEnquiry(r.e) }));
  if (sp.sort === "score") rows.sort((a, b) => b.score.score - a.score.score);
  const tabs = [["new", `New (${n("new")})`], ["done", `Handled (${n("converted") + n("added")})`], ["dismissed", `Dismissed (${n("dismissed")})`], ["all", "All"]] as const;
  const open = Number(sp.open) || null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Enquiries" subtitle="Everything that comes in — website form, emails to sales, WhatsApp — in one place. Turn each into a lead or add it to an opportunity." />

      <section className="card mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold">💬 Add a WhatsApp or phone enquiry</h2>
        <EnquiryPaste ai={aiEnabled()} />
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-slate-200">
        {tabs.map(([k, l]) => <Link key={k} href={`/enquiries?s=${k}${sp.src ? `&src=${sp.src}` : ""}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${status === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</Link>)}
        <span className="ml-auto flex gap-1 pb-1">
          <Link href={`/enquiries?s=${status}${sp.src ? `&src=${sp.src}` : ""}${sp.sort === "score" ? "" : "&sort=score"}`} className={`rounded-full px-2 py-0.5 text-xs ${sp.sort === "score" ? "bg-slate-800 font-semibold text-white" : "text-slate-500 hover:bg-slate-100"}`}>Best first</Link>
          {Object.entries(SRC).filter(([k]) => k !== "other").map(([k, m]) => <Link key={k} href={`/enquiries?s=${status}${sp.src === k ? "" : `&src=${k}`}`} className={`rounded-full px-2 py-0.5 text-xs ${sp.src === k ? m.cls + " font-semibold" : "text-slate-500 hover:bg-slate-100"}`}>{m.icon} {m.label}</Link>)}
        </span>
      </div>

      {rows.length === 0 ? <p className="card py-10 text-center text-sm text-slate-500">{status === "new" ? "No new enquiries. 🎉" : "Nothing here."}</p> : (
        <ul className="space-y-3" data-testid="enquiries">
          {rows.map(({ e, customer, assignee: asg, lead, score }) => {
            const m = SRC[e.source] ?? SRC.other!;
            const leadsOfCustomer = e.customerId ? openLeads.filter((l) => l.customerId === e.customerId) : [];
            return (
              <li key={e.id} id={`e${e.id}`} className={`card p-4 ${open === e.id ? "ring-2 ring-brand-300" : ""}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="flex flex-col items-start gap-1"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.icon} {m.label}</span>{e.status === "new" && <ScoreBadge s={score} />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{e.company ?? e.name ?? e.email ?? e.phone ?? "Unknown"}{e.company && e.name && <span className="font-normal text-slate-500"> · {e.name}</span>}</div>
                    <div className="text-xs text-slate-500">{[e.phone, e.email, e.city, e.product].filter(Boolean).join(" · ")}</div>
                    {customer && <div className="mt-0.5 text-xs text-emerald-700">✓ Existing customer: {customer}</div>}
                  </div>
                  <div className="text-right text-xs text-slate-400"><span suppressHydrationWarning>{timeAgo(e.createdAt)}</span>{asg && <div className="mt-1 flex items-center justify-end gap-1 text-slate-600"><Avatar name={asg} size="sm" />{asg}</div>}</div>
                </div>
                {e.subject && <p className="mt-2 text-sm font-medium">{e.subject}</p>}
                {e.message && <details className="mt-1" open={open === e.id || (e.message.length < 240)}><summary className="cursor-pointer text-xs text-slate-500">Message</summary><p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{e.message}</p></details>}

                {e.status === "new" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <form action={convertEnquiry.bind(null, e.id)} className="flex gap-1">
                      <select name="ownerId" defaultValue={e.assignedToId ?? me.id} className="input w-40 py-1 text-sm" aria-label="Owner">{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                      <button className="btn-primary py-1 text-sm">Create lead</button>
                    </form>
                    {(leadsOfCustomer.length > 0 || openLeads.length > 0) && (
                      <form action={attachEnquiry.bind(null, e.id)} className="flex gap-1">
                        <select name="leadId" defaultValue={leadsOfCustomer[0]?.id ?? ""} className="input w-56 py-1 text-sm" aria-label="Opportunity">
                          <option value="">Add to opportunity…</option>
                          {leadsOfCustomer.length > 0 && <optgroup label="This customer">{leadsOfCustomer.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</optgroup>}
                          <optgroup label="All open">{openLeads.filter((l) => !leadsOfCustomer.includes(l)).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</optgroup>
                        </select>
                        <button className="btn-secondary py-1 text-sm">Add</button>
                      </form>
                    )}
                    <form action={assignEnquiry.bind(null, e.id)} className="flex gap-1">
                      <select name="userId" defaultValue={e.assignedToId ?? ""} className="input w-36 py-1 text-sm" aria-label="Pass to"><option value="">Pass to…</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                      <button className="btn-secondary py-1 text-sm">Assign</button>
                    </form>
                    <form action={setEnquiryStatus.bind(null, e.id, "dismissed")} className="ml-auto"><button className="text-xs text-slate-400 hover:text-red-600">Dismiss (spam / not relevant)</button></form>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    {e.status === "dismissed" ? "Dismissed" : e.status === "converted" ? "Turned into a lead:" : "Added to:"}
                    {e.leadId && <Link href={`/crm/${e.leadId}`} className="font-medium text-brand-700 hover:underline">{lead}</Link>}
                    {e.status === "dismissed" && <form action={setEnquiryStatus.bind(null, e.id, "new")}><button className="text-brand-700 hover:underline">Restore</button></form>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="card mt-6 p-4 text-sm">
        <summary className="cursor-pointer font-medium">How enquiries get here</summary>
        <div className="mt-3 space-y-3 text-slate-600">
          <div><b>Website:</b> link or embed the enquiry form on raybonchemicals.com —
            <div className="mt-1"><CopyField value={`${appUrl()}/enquiry`} /></div>
            <div className="mt-1"><CopyField value={`<iframe src="${appUrl()}/enquiry?embed=1" style="width:100%;height:720px;border:0" title="Enquiry"></iframe>`} /></div>
          </div>
          <div><b>Email:</b> {graphConfigured() && graphInboxes().length ? <>mail to <b>{graphInboxes().join(", ")}</b> (or forwarded there) is imported automatically.</> : "connects once Microsoft 365 is set up (Settings → Email in). Until then, paste important emails above."}</div>
          <div><b>WhatsApp:</b> paste the chat above. On an Android phone with the CRM installed (Add to Home screen), use WhatsApp&apos;s <i>Share</i> → <i>{"Raybon Sales CRM"}</i> to send a message straight here.</div>
        </div>
      </details>
    </div>
  );
}
