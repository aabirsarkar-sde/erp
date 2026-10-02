import { eq } from "drizzle-orm";
import { db, tickets } from "@/db";
import { PublicShell } from "@/components/ui/public-shell";
import { FeedbackForm } from "@/components/helpdesk/feedback-form";
import { ticketRef } from "@/lib/helpdesk/constants";
import { fmtTat } from "@/lib/core/format";

export const metadata = { title: "Rate our service" };

export default async function Feedback({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await db.query.tickets.findFirst({ where: eq(tickets.csatToken, token) });
  return (
    <PublicShell title="How did we do?">
      {!t ? <div className="card p-6 text-sm">This link is no longer valid.</div> : (
        <div className="card p-5">
          <p className="text-sm text-slate-600"><b className="font-mono">{ticketRef(t.id)}</b> · {t.subject}</p>
          <p className="mb-4 text-xs text-slate-500">Resolved in {fmtTat(t.tatMinutes)}</p>
          <FeedbackForm token={token} done={t.csatScore != null} />
        </div>
      )}
    </PublicShell>
  );
}
