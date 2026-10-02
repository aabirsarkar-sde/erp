# Features

What each product does and how people use it.

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

## Sales & marketing flow

Lead → convert to Opportunity → activities / visits from the calendar → proposal upload (status tracked) → follow-ups → Won / Lost.

- **Leads** (`/crm/leads`) and **Opportunities** (`/crm`) are separate lists; one click converts.
- Opportunity holds company, contact, product/service offered, inquiry details, proposal status + uploaded proposals, followers/assignees, full history.
- **Calendar = activity platform**: click an hour slot (or "+ Activity / visit") to plan a call/meeting/visit linked to client, contact and opportunity.
  Open it later to write the **visit / call report** (discussion points, outcome, next action). A next action with a date schedules the follow-up automatically.
  Reports appear in the opportunity history, the client's activity timeline and the visit report.
- **Sales reports** (`/sales-reports`): pipeline by stage, by salesperson, lead sources, proposal status, lost reasons, won/lost and the visit report — Excel and PDF.

## Sales CRM: day-to-day (Oct 2026 requests)

- **Labels (Google Keep style):** click **+ Label** on an opportunity to add Geography, Customer (e.g. Big ticket customer),
  Product, Temperature (Hot / Warm / Cold) or any new label on the fly. Groups and colours are set in Settings → Opportunity labels.
  Winning an opportunity adds **OR FY26-27** (order received in that financial year) automatically.
- **Contact details** card on every opportunity: contact person, phone, email, address. Anything missing is highlighted, and a
  "Complete contact details" reminder is put on the salesperson's planner until it's filled in.
- **Day counter:** every open opportunity shows how many days since it was created (amber after 45, red after 90).
  Won opportunities show their **turnaround** (days from creation to order); reports show average order TAT.
- **Kanban views:** group the board by stage, salesperson (drag to reassign), product, geography or Hot/Warm/Cold.
  Column totals show count and ₹ value; sort by value (highest first) or age. **Quick add** creates an opportunity from five fields.
- **Calendar = planner + work done + diary:** the Day view (default for salespeople) has a short form for planned work and for
  work done (customer, type, one line, outcome). Picking a customer with one open opportunity links the entry to it, so it shows
  in that opportunity's history. The diary is free notes for the day.
- **Daily report:** compiled from each person's day (Sales → Daily report), flags anyone who didn't file, and is emailed every
  evening at 7:30 pm to the addresses in Settings (default: admins).
- **Dashboards:** Sales reports → Dashboards shows the pipeline by salesperson, product, geography, temperature, stage, customer,
  source or any label: open value, weighted, average age, won value, order TAT. Click a row to open those opportunities.
- **Outlook:** each person subscribes to their private calendar link (Calendar → Sync with Outlook). Planned activities appear
  at their time; Outlook refreshes subscribed calendars every few hours.

## Tasks (both products)

Assign a task to anyone with a due date and priority, optionally linked to an opportunity or ticket. **Tasks** is a kanban
(To do / In progress / Done): drag between columns or tick the box. The assignee is emailed; the person who assigned it is
emailed when it's done. Supervisors (admins, managers, "all" access) can see everyone's tasks. Tasks due today appear in the
calendar planner and on the dashboard.

## Departments & access (client spec, Oct 2026)

Every user has three switches in **Settings → Users**:

| Setting | Values | Meaning |
|---|---|---|
| Sales / CRM access | none · own · all | *own* = opportunities they own, are assigned to or follow; *all* = everything (Chandan, Aarti) |
| Helpdesk access | none · zone · all | *zone* = tickets in their zones + tickets assigned to them or that they follow; *all* = every zone |
| Zones | checkboxes | which zones a zonal manager belongs to |

Menus, dashboards, reports, search, AI answers, exports and direct URLs all respect these (a hidden record returns 404).

Sample-data logins (password `raybon123`, admin is `admin123`): admin@ (Chandan), aarti@, gaurang@, priyank@ (sales, own),
haridutt@, hina@, rehan@ (O&M, all zones), rakesh@ / nilesh@ / priya@ (zonal managers).

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

## Email (optional, free)

Without email settings the app still works; outgoing emails are printed in the terminal instead.

- **Sending** (customer replies, "assigned to you" alerts, receipt of new tickets): fill `SMTP_*` and `MAIL_FROM` in `.env`. Any free SMTP account works, such as Brevo (300 emails/day) or a Gmail app password.
- **Receiving** (email-to-ticket): route a support address to `POST /api/inbound-email` with the header `x-inbound-secret: $INBOUND_EMAIL_SECRET`. `docs/integrations/cloudflare-email-worker.js` does this for free with Cloudflare Email Routing.
  - A subject containing `TKT-0012` is added to that ticket as a customer reply, and reopens it if it was waiting or resolved.
  - Any other email creates a new ticket. The sender is matched to a customer by contact email or company domain, and gets an acknowledgement.

## Attachments

Photos are shrunk in the browser before upload, to roughly 100–300 KB each. Files are stored in `./uploads` locally. In production they go to Vercel Blob if `BLOB_READ_WRITE_TOKEN` is set (free tier). Downloads require being logged in.

## Calendar sync

On the Calendar page, open "Sync with Outlook, Google or Apple Calendar" and copy your private link. The link only works once the app is online (not localhost). Set `APP_URL` in `.env` to the public address.

## Moving data over from Odoo

Log in as admin and go to Settings → Import from Odoo. Import **contacts first**, then opportunities, then tickets. On each screen, the Odoo list view's Export button gives a CSV. The import page says which columns to tick for each.
