"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { transferTicket, emailTicketAction, resolveTicket } from "@/app/actions/tickets";

type Opt = { id: number; name: string };

function Popover({ label, children, primary, open, setOpen }: { label: string; children: React.ReactNode; primary?: boolean; open: boolean; setOpen: (b: boolean) => void }) {
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={primary ? "btn-primary" : "btn-secondary"}>{label}</button>
      {open && <div className="card absolute left-0 z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] p-3 shadow-xl">{children}</div>}
    </div>
  );
}

export function TransferButton({ ticketId, users, currentId }: { ticketId: number; users: Opt[]; currentId: number | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(transferTicket.bind(null, ticketId), undefined);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  return (
    <Popover label="Transfer" open={open} setOpen={setOpen}>
      <form action={action} className="space-y-2">
        <div className="text-sm font-semibold">Transfer ticket to</div>
        <select name="toUserId" required defaultValue="" className="input">
          <option value="" disabled>Choose a person…</option>
          {users.filter((u) => u.id !== currentId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <textarea name="reason" rows={2} className="input" placeholder="Reason / handover note (optional)" />
        {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
        <button disabled={pending} className="btn-primary w-full">{pending ? "Transferring…" : "Transfer & notify"}</button>
      </form>
    </Popover>
  );
}

export function EmailTicketButton({ ticketId, suggestions }: { ticketId: number; suggestions: string[] }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [state, action, pending] = useActionState(emailTicketAction.bind(null, ticketId), undefined);
  useEffect(() => { if (state?.ok) { setTo(""); setTimeout(() => setOpen(false), 1200); } }, [state]);
  return (
    <Popover label="Email ticket" open={open} setOpen={setOpen}>
      <form action={action} className="space-y-2">
        <div className="text-sm font-semibold">Email this ticket (full details + conversation)</div>
        <input name="to" value={to} onChange={(e) => setTo(e.target.value)} required className="input" placeholder="emails, comma separated" />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestions.slice(0, 8).map((s) => <button key={s} type="button" onClick={() => setTo((v) => (v.includes(s) ? v : [v, s].filter(Boolean).join(", ")))} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200">+ {s}</button>)}
          </div>
        )}
        <textarea name="note" rows={2} className="input" placeholder="Message on top (optional)" />
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="follow" defaultChecked className="accent-brand-600" /> Keep them updated on this ticket (add as followers)</label>
        {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state?.info && <p className="text-xs text-emerald-700">{state.info}</p>}
        <button disabled={pending} className="btn-primary w-full">{pending ? "Sending…" : "Send"}</button>
      </form>
    </Popover>
  );
}

export function ResolveButton({ ticketId, complainant }: { ticketId: number; complainant: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(resolveTicket.bind(null, ticketId), undefined);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sigInput = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);

  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (canvas.current!.width / r.width), (e.clientY - r.top) * (canvas.current!.height / r.height)] as const; };
  const down = (e: React.PointerEvent) => { drawing.current = true; const ctx = canvas.current!.getContext("2d")!; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a"; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); canvas.current!.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = canvas.current!.getContext("2d")!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setSigned(true); };
  const up = () => { drawing.current = false; if (signed && sigInput.current) sigInput.current.value = canvas.current!.toDataURL("image/png"); };
  const clear = () => { canvas.current!.getContext("2d")!.clearRect(0, 0, 600, 200); setSigned(false); if (sigInput.current) sigInput.current.value = ""; };

  return (
    <Popover label="Mark done" primary open={open} setOpen={setOpen}>
      <form action={action} className="space-y-2">
        <div className="text-sm font-semibold">Mark done — TAT will be stamped</div>
        <textarea name="note" rows={2} className="input" placeholder="What was done to resolve it? (recommended)" />
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500"><span>Customer sign-off (optional — draw with finger/mouse)</span>{signed && <button type="button" onClick={clear} className="underline">Clear</button>}</div>
          <canvas ref={canvas} width={600} height={200} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="h-28 w-full touch-none rounded-lg border border-dashed border-slate-300 bg-slate-50" />
          <input ref={sigInput} type="hidden" name="signature" />
          <input name="signedBy" defaultValue={complainant ?? ""} placeholder="Signed by (name)" className="input mt-1.5 py-1.5 text-sm" />
        </div>
        {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
        <button disabled={pending} className="btn-primary w-full">{pending ? "Saving…" : "Done & stamp TAT"}</button>
      </form>
    </Popover>
  );
}
