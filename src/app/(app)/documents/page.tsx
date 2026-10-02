import Link from "next/link";
import { and, asc, desc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, documents, docFolders, customers, users } from "@/db";
import { requireUser } from "@/lib/core/auth";
import { documentScope } from "@/lib/core/access";
import { lookups } from "@/lib/core/lookups";
import { createFolder, deleteDocument, updateDocument } from "@/app/actions/documents";
import { PageHeader, Empty } from "@/components/ui/ui";
import { SearchBox } from "@/components/ui/url-filters";
import { DocUpload } from "@/components/workspace/doc-upload";
import { fmtDate, fmtSize } from "@/lib/core/format";

export const metadata = { title: "Documents" };

const ext = (n: string) => (n.split(".").pop() ?? "").slice(0, 4).toUpperCase();
const EXT_CLS: Record<string, string> = { PDF: "bg-red-50 text-red-600", DOC: "bg-blue-50 text-blue-600", DOCX: "bg-blue-50 text-blue-600", XLS: "bg-emerald-50 text-emerald-700", XLSX: "bg-emerald-50 text-emerald-700", CSV: "bg-emerald-50 text-emerald-700", DWG: "bg-amber-50 text-amber-700", ZIP: "bg-slate-100 text-slate-600" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const up = alias(users, "up");
  const folderSel = sp.folder === "none" ? "none" : sp.folder ? Number(sp.folder) : null;
  const c: SQL[] = [];
  const ds = documentScope(me);
  if (ds) c.push(ds);
  if (folderSel === "none") c.push(isNull(documents.folderId));
  else if (folderSel) c.push(eq(documents.folderId, folderSel));
  if (sp.q) { const p = `%${sp.q}%`; c.push(or(like(documents.name, p), like(documents.description, p), like(customers.name, p))!); }
  const [rows, folders, counts, lk] = await Promise.all([
    db.select({ id: documents.id, name: documents.name, mime: documents.mime, size: documents.size, description: documents.description, createdAt: documents.createdAt, folderId: documents.folderId, customerId: documents.customerId, customerName: customers.name, uploader: up.name, uploaderId: documents.uploadedById })
      .from(documents).leftJoin(customers, eq(customers.id, documents.customerId)).leftJoin(up, eq(up.id, documents.uploadedById))
      .where(c.length ? and(...c) : undefined).orderBy(desc(documents.createdAt)).limit(500),
    db.select().from(docFolders).orderBy(asc(docFolders.name)),
    db.select({ f: documents.folderId, n: sql<number>`count(*)` }).from(documents).groupBy(documents.folderId),
    lookups(),
  ]);
  const count = (f: number | null) => Number(counts.find((x) => x.f === f)?.n ?? 0);
  const total = counts.reduce((a, x) => a + Number(x.n), 0);
  const F = ({ href, label, n, active }: { href: string; label: string; n: number; active: boolean }) => (
    <Link href={href} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}><span className="truncate">📁 {label}</span><span className="text-xs text-slate-400">{n}</span></Link>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Documents" subtitle="Company library — brochures, drawings, reports and manuals" />
      <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
        <aside className="space-y-3">
          <nav className="card space-y-0.5 p-2">
            <F href="/documents" label="All documents" n={total} active={folderSel === null} />
            {folders.map((f) => <F key={f.id} href={`/documents?folder=${f.id}`} label={f.name} n={count(f.id)} active={folderSel === f.id} />)}
            <F href="/documents?folder=none" label="Unfiled" n={count(null)} active={folderSel === "none"} />
          </nav>
          <form action={createFolder} className="flex gap-2"><input name="name" required placeholder="New folder" className="input py-1.5" /><button className="btn-secondary py-1.5">Add</button></form>
        </aside>
        <div className="min-w-0 space-y-4">
          <DocUpload folders={folders} customers={lk.customers} folderId={typeof folderSel === "number" ? folderSel : null} />
          <SearchBox placeholder="Search documents or customer…" />
          {rows.length === 0 ? <Empty title="No documents here yet" /> : (
            <ul className="card divide-y divide-slate-100">
              {rows.map((d) => {
                const e = ext(d.name);
                return (
                  <li key={d.id} className="group px-4 py-3">
                    <div className="flex items-center gap-3">
                      {d.mime.startsWith("image/") ? (
                         
                        <img src={`/api/docs/${d.id}?view`} alt="" className="size-10 shrink-0 rounded object-cover" loading="lazy" />
                      ) : <span className={`flex size-10 shrink-0 items-center justify-center rounded text-[10px] font-bold ${EXT_CLS[e] ?? "bg-slate-100 text-slate-600"}`}>{e || "FILE"}</span>}
                      <div className="min-w-0 flex-1">
                        <a href={`/api/docs/${d.id}?view`} target="_blank" className="block truncate text-sm font-medium hover:text-brand-700">{d.name}</a>
                        <div className="truncate text-xs text-slate-500">
                          {fmtSize(d.size)} · {fmtDate(d.createdAt)} · {d.uploader ?? "—"}
                          {d.customerName && <> · <Link href={`/customers/${d.customerId}`} className="text-brand-700 hover:underline">{d.customerName}</Link></>}
                          {d.description && ` · ${d.description}`}
                        </div>
                      </div>
                      <a href={`/api/docs/${d.id}`} className="btn-ghost px-2 py-1 text-xs">Download</a>
                    </div>
                    <details className="mt-1 pl-13">
                      <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-slate-700">Edit</summary>
                      <form action={updateDocument.bind(null, d.id)} className="mt-2 grid gap-2 sm:grid-cols-4">
                        <input name="name" defaultValue={d.name} className="input py-1 text-xs sm:col-span-2" />
                        <select name="folderId" defaultValue={d.folderId ?? ""} className="input py-1 text-xs"><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        <select name="customerId" defaultValue={d.customerId ?? ""} className="input py-1 text-xs"><option value="">No customer</option>{lk.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <input name="description" defaultValue={d.description ?? ""} placeholder="Description" className="input py-1 text-xs sm:col-span-3" />
                        <div className="flex gap-2">
                          <button className="btn-secondary flex-1 py-1 text-xs">Save</button>
                          {(d.uploaderId === me.id || me.role === "admin") && <button formAction={deleteDocument.bind(null, d.id)} className="btn-ghost py-1 text-xs text-red-600">Delete</button>}
                        </div>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
