import { fmtSize } from "@/lib/core/format";

type A = { id: number; name: string; mime: string; size: number };

export function AttachmentList({ items }: { items: A[] }) {
  if (!items.length) return null;
  const imgs = items.filter((a) => a.mime.startsWith("image/"));
  const docs = items.filter((a) => !a.mime.startsWith("image/"));
  return (
    <div className="mt-3 space-y-2">
      {imgs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imgs.map((a) => (
            <a key={a.id} href={`/api/files/${a.id}`} target="_blank" className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50" title={a.name}>
              { }
              <img src={`/api/files/${a.id}`} alt={a.name} className="h-24 w-32 object-cover transition hover:opacity-90" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {docs.map((a) => (
        <a key={a.id} href={`/api/files/${a.id}?download`} className="flex max-w-sm items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{a.name.split(".").pop()}</span>
          <span className="min-w-0 flex-1 truncate">{a.name}</span>
          <span className="text-xs text-slate-400">{fmtSize(a.size)}</span>
        </a>
      ))}
    </div>
  );
}
