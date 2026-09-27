# Raybon ERP

Helpdesk and CRM for Zero Discharge Systems Pvt. Ltd., replacing the old Odoo system. The mobile app and AI come next.

**Stack (all free):** Next.js 15 · React 19 · Tailwind v4 · Drizzle ORM · SQLite locally / Turso in production.

## Run it locally

Needs Node 20 or newer.

```bash
npm install
npm run setup   # creates local.db and loads sample data
npm run dev     # open http://localhost:3000
```

Sample logins:
- `admin@raybon.local` / `admin123` (admin)
- `aarti@raybon.local` / `raybon123` (manager)

## Email (optional, free)

Without email settings the app still works; outgoing emails are printed in the terminal instead.

- **Sending** (customer replies, "assigned to you" alerts, receipt of new tickets): fill `SMTP_*` and `MAIL_FROM` in `.env`. Any free SMTP account works, such as Brevo (300 emails/day) or a Gmail app password.
- **Receiving** (email-to-ticket): route a support address to `POST /api/inbound-email` with the header `x-inbound-secret: $INBOUND_EMAIL_SECRET`. `docs/cloudflare-email-worker.js` does this for free with Cloudflare Email Routing.
  - A subject containing `TKT-0012` is added to that ticket as a customer reply, and reopens it if it was waiting or resolved.
  - Any other email creates a new ticket. The sender is matched to a customer by contact email or company domain, and gets an acknowledgement.

## AI (free)

The AI features use any OpenAI-compatible API. The default is Google Gemini, which has a free tier that needs no card:

1. Get a key at https://aistudio.google.com/apikey.
2. In `.env`, set `AI_API_KEY="..."` and restart. `AI_MODEL` defaults to `gemini-flash-latest`; change it to any model your key supports.
3. To use a different provider, set `AI_BASE_URL` and `AI_MODEL` for it:
   - Groq: `https://api.groq.com/openai/v1/`
   - OpenRouter: `https://openrouter.ai/api/v1/`
   - A local Ollama: `http://localhost:11434/v1/`

With `AI_PROVIDER="mock"` and no key, the app shows canned demo answers so you can try the screens. A key always takes precedence. Each person is limited to 12 AI requests a minute to protect the free quota (`AI_RATE_PER_MIN`), and usage is shown in Settings.

⚠️ Google may use free-tier Gemini prompts to improve its models. If the client's data must stay private, use a paid key or another provider.

What's included:
- **Tickets:**
  - Suggest category, priority, team and tags on a new ticket.
  - Automatic triage of tickets that arrive by email (can be switched off in Settings).
  - Summarise a ticket thread with next steps and customer mood.
  - Draft a customer reply (you can type a hint first).
- **Opportunities:**
  - A deal brief: health, risks, next step, and a one-click "Schedule" for the suggested follow-up.
  - Draft a follow-up email (copy it, or open it in your mail app).
  - **Quick log:** paste or dictate rough notes (Hinglish is fine). It becomes a clean activity log plus the next follow-up, and can update the deal's value and probability.
- **Quotations:** describe the scope and AI writes the line items. Prices stay blank for you to fill in.
- **Ask AI** (`/ask`, plus the box on the dashboard): questions in plain English about tickets, deals, follow-ups or customers. It answers from live data with links, using read-only lookups only.

## Attachments

Photos are shrunk in the browser before upload, to roughly 100–300 KB each. Files are stored in `./uploads` locally. In production they go to Vercel Blob if `BLOB_READ_WRITE_TOKEN` is set (free tier). Downloads require being logged in.

## Helpdesk workflow (client spec, Sep 2026)

1. **Log the complaint.** Open the Calendar and click **+ Complaint** (or "+ complaint" on a day), or use Tickets → New complaint. On the standard form, fill in:
   - The date.
   - The **plant number**, which fills in the customer, zone and city.
   - The **type**: Electrical, Mechanical, Feed water quality, Instrumentation, Membrane, Manpower or Other.
   - The narration.
   - Who complained.
2. **See it.** The ticket appears on the calendar on that date and in the ticket list. Rochem HO (Settings → HO emails) and the complainant follow it automatically.
3. **Work it.**
   - Replies, canned replies and internal notes.
   - **Transfer** to another person with a reason; both people are emailed.
   - **Email ticket**: send the full details and conversation to anyone.
   - Email replies to `[TKT-xxxx]` come back into the ticket. **Email thread** shows only the mail chain.
4. **Close it.** Add a resolution note and an optional customer signature. The **TAT (turn-around time)** is stamped, and followers get a closure mail with a 1-click rating link.
5. **Dashboard** (Helpdesk → Helpdesk dashboard):
   - Average TAT, and totals per complaint type.
   - Views by type, zone, geography, employee (tickets solved) and plant.
   - **Excel** and **PDF** export.
6. **Extras:**
   - Customer complaint portal at `/complaint`, with status check at `/complaint/status`.
   - Daily escalation email for overdue or unassigned tickets (Vercel Cron; set `CRON_SECRET`).
   - Plants master (`/plants`), importable from CSV.

## Moving data over from Odoo

Log in as admin and go to Settings → Import from Odoo. Import **contacts first**, then opportunities, then tickets. On each screen, the Odoo list view's Export button gives a CSV. The import page says which columns to tick for each.

## Calendar sync

On the Calendar page, open "Sync with Outlook, Google or Apple Calendar" and copy your private link. The link only works once the app is online (not localhost). Set `APP_URL` in `.env` to the public address.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server |
| `npm run db:push` | Applies changes from `src/db/schema.ts` to the database |
| `npm run db:seed` | **Wipes** the database and reloads the sample data |
| `npm run db:studio` | Opens a database browser |
| `npm run build` | Production build |

## Deploy for free

1. Create a database on [Turso](https://turso.tech) (free tier). Then run `turso db show <name> --url` and `turso db tokens create <name>`.
2. Push this repo to GitHub and import it on [Vercel](https://vercel.com) (free tier).
3. Set these environment variables on Vercel: `DATABASE_URL` (the libsql:// URL), `DATABASE_AUTH_TOKEN`, and `AUTH_SECRET` (a long random string).
4. Create the tables in Turso from your machine: `DATABASE_URL=... DATABASE_AUTH_TOKEN=... npm run db:push`. Then either run `npm run db:seed` the same way for sample data, or add real users in Settings.

## Code layout

```
src/db/schema.ts          tables: users, teams, team_members, customers, contacts, tickets, messages
src/lib/queries.ts        ticket filters, dashboard stats
src/app/actions/*.ts      server actions (auth, tickets, customers, admin)
src/app/(app)/...         pages: dashboard, tickets, customers, settings
src/components/           UI pieces
scripts/seed.ts           sample data
```

## Roadmap

- **P0 Helpdesk:** done. Covers teams per location, tickets (list and board views), filters, replies and internal notes, the activity log, customers and contacts, users and roles, photo and file attachments, emailed replies and alerts, email-to-ticket, SLA targets, reports, and a mobile/PWA version.
- **P1 CRM:** done.
  - Pipeline board with drag-and-drop between stages, ₹ totals per column, a forecast strip, and a list view.
  - Opportunities with won/lost reasons, star priority, tags, and a history of notes and changes.
  - Activities (call, meeting, site visit, email, to-do) with due dates, a to-do list, and a call report.
  - Quotations numbered S00xxx, with revisions (R1, R2…), a product catalogue, line items, discount, GST split into CGST+SGST or IGST, and amount in words.
  - Printable A4 quotation that can be saved as PDF, using company details from Settings.
- **P2 Mobile app:** Expo app on the same backend. The web app is already mobile-friendly and installable.
- **P3 AI:** done. See the AI section above.
- **P4 The rest:** done.
  - **Calendar:**
    - Week view, month view, and a phone agenda. Meetings have team attendees and outside guests.
    - Emailed invites (.ics) that show accept/decline in Outlook and Gmail.
    - Follow-ups appear alongside meetings.
    - A private link to subscribe from Outlook, Google or Apple Calendar.
  - **Discuss:** #general, #sales and #service channels plus direct messages. Unread badges; `TKT-0012` becomes a link and `@Name` highlights the person.
  - **Documents:** folders, drag-and-drop upload, linking to customers, search.
  - **Insights:** management charts (tickets trend, open tickets by team, pipeline by stage, won revenue by month, activity per person).
  - **Import from Odoo:** Settings → Import. Takes the CSV exports for contacts, opportunities and tickets, maps the columns automatically, and is safe to re-run.
