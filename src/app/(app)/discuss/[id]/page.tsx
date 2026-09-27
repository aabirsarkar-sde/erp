import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { listChannels, isMember, messagesSince } from "@/lib/chat";
import { openDm, createChannel } from "@/app/actions/chat";
import { ChatRoom } from "@/components/chat-room";
import { Avatar } from "@/components/ui";

export const metadata = { title: "Discuss" };
export const dynamic = "force-dynamic";

export default async function DiscussPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  const [cs, people] = await Promise.all([listChannels(me.id), db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true))]);
  const cur = cs.find((c) => c.id === id);
  if (!cur || !(await isMember(id, me.id))) notFound();
  const initial = await messagesSince(id, 0, 150);
  const pubs = cs.filter((c) => c.kind === "channel").sort((a, b) => a.name.localeCompare(b.name));
  const dms = cs.filter((c) => c.kind === "dm").sort((a, b) => Number(b.lastAt ?? 0) - Number(a.lastAt ?? 0));
  const dmWith = new Set(dms.map((d) => d.otherId));

  const Item = ({ c }: { c: (typeof cs)[number] }) => (
    <Link href={`/discuss/${c.id}`} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${c.id === id ? "bg-brand-50 font-semibold text-brand-800" : c.unread ? "font-semibold text-slate-900 hover:bg-slate-100" : "text-slate-600 hover:bg-slate-100"}`}>
      {c.kind === "dm" ? <Avatar name={c.title} size="sm" /> : <span className="w-6 text-center text-slate-400">#</span>}
      <span className="min-w-0 flex-1 truncate">{c.kind === "dm" ? c.title : c.name}</span>
      {c.unread > 0 && c.id !== id && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}
    </Link>
  );

  return (
    <div className="-mx-4 -mt-5 flex border-slate-200 bg-white sm:-mx-6 md:mx-0 md:mt-0 md:rounded-xl md:border lg:-mx-2">
      <aside className="hidden w-60 shrink-0 space-y-4 overflow-y-auto border-r border-slate-200 p-3 md:block">
        <div>
          <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Channels</div>
          {pubs.map((c) => <Item key={c.id} c={c} />)}
          {me.role !== "agent" && (
            <details className="px-2.5 pt-1">
              <summary className="cursor-pointer text-xs text-slate-500">+ New channel</summary>
              <form action={createChannel} className="mt-2 space-y-1.5"><input name="name" required placeholder="name" className="input py-1 text-xs" /><button className="btn-secondary w-full py-1 text-xs">Create</button></form>
            </details>
          )}
        </div>
        <div>
          <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Direct messages</div>
          {dms.map((c) => <Item key={c.id} c={c} />)}
          {people.filter((p) => p.id !== me.id && !dmWith.has(p.id)).map((p) => (
            <form key={p.id} action={openDm.bind(null, p.id)}>
              <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100"><Avatar name={p.name} size="sm" /><span className="truncate">{p.name}</span></button>
            </form>
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {/* mobile channel switcher */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-200 px-3 py-2 md:hidden">
          {[...pubs, ...dms].map((c) => (
            <Link key={c.id} href={`/discuss/${c.id}`} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${c.id === id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {c.kind === "dm" ? c.title.split(" ")[0] : `#${c.name}`}{c.unread > 0 && c.id !== id ? ` • ${c.unread}` : ""}
            </Link>
          ))}
        </div>
        <ChatRoom key={id} channelId={id} initial={initial} meId={me.id} meName={me.name} title={cur.kind === "dm" ? cur.title : `# ${cur.name}${cur.description ? ` — ${cur.description}` : ""}`} placeholder={cur.kind === "dm" ? `Message ${cur.title}` : `Message #${cur.name} — use @Name to mention, TKT-0012 to link a ticket`} />
      </div>
    </div>
  );
}
