import { personDay, salesTeam, dailyReportRecipients, reportText } from "@/lib/crm/daily";
import { sendMail, appUrl } from "@/lib/core/mail";
import { localDateKey } from "@/lib/core/tz";

// Vercel Cron, every evening (see vercel.json). Emails the team's daily report to the managers.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET || "dev-cron-secret"}`) return new Response("Unauthorized", { status: 401 });
  const day = localDateKey(new Date());
  const team = (await salesTeam()).filter((u) => u.role !== "admin");
  if (!team.length) return Response.json({ sent: 0 });
  const d = await personDay(team.map((u) => u.id), day, null);
  const text = `${reportText(day, team, d)}\nOpen in the CRM: ${appUrl()}/daily-report?date=${day}`;
  const to = await dailyReportRecipients();
  const missing = team.filter((u) => !d.done.some((a) => a.userId === u.id) && !d.diary.some((x) => x.userId === u.id)).length;
  for (const addr of to) await sendMail({ to: addr, subject: `Daily sales report — ${day}${missing ? ` (${missing} not filed)` : ""}`, text });
  return Response.json({ sent: to.length, people: team.length, missing });
}
