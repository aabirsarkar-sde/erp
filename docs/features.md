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

## Sales CRM: second round (Oct 2026)

- **Enter once, see everywhere:** an activity is one record. Whether it's logged in the calendar, on the opportunity or from
  the Day view, it shows in the calendar, the opportunity history, the daily report, sales reports and the KPI board.
- **Calendar colours:** blue = planned, green = done, red = overdue (past its time and not reported), violet = meetings.
  The same colours are used in the Day/Week/Month views and on the opportunity, with a key at the top.
- **KPI & KRA** (Performance → KPI & KRA): the sales head sets daily, weekly and monthly KPIs/KRAs on **Set targets** — what to
  measure (calls, visits, meetings, WhatsApp follow-ups, daily reports filed, new leads/opportunities, pipeline added, quotations
  sent/value, orders won/value) or **typed in by hand** (e.g. collections ₹). One default target per KPI, overridable per person
  (0 = not applicable). The scoreboard is visible to the whole sales team; each person's targets show at the top of their calendar
  day and on the dashboard. Green ≥ 100 %, amber ≥ 60 %, red below.
- **Dashboards** (Performance → Dashboards): everyone builds up to 8 boards of their own — pick a measure, grouping (salesperson,
  product, geography, Hot/Warm/Cold, stage, customer, source, label, month, activity type), chart (big number, bars, line by month,
  table) and period (30/90 days, 12 months, this FY, this month, all time). Boards can be shared with the team; others can copy them.
  "Sales overview" is a ready-made starter.
- **Notifications (🔔)**: reminders, AI suggestions, tasks and new enquiries, with quick buttons (Call, WhatsApp, Email, Log it).
- **Remind someone** (opportunity page, for managers): "Please call this party today" puts a planned activity in the person's
  calendar, a notification in their bell and an email. Planning an activity for a colleague anywhere does the same.
- **AI follow-up suggestions:** every morning (8:30 am) the CRM checks each open opportunity — overdue activities, quotations or
  jar tests with no follow-up after N days, submitted proposals going quiet, no contact for N days — and gives each salesperson up
  to 5 suggestions in plain words ("It's been 12 days since the jar test at X — let's call him today"), with a ready-written
  WhatsApp message. Rules and limits are in Settings; the AI only words the message.
- **Templates & collateral** (Sales → Templates & collateral): WhatsApp and email templates with `{{contact}}`, `{{customer}}`,
  `{{product}}`, `{{salesperson}}`… and a library of case studies, brochures, ads and emailers. On every opportunity,
  **Send to customer** fills a template, adds a case study (as a 30-day download link on WhatsApp, or attached to an email),
  opens WhatsApp or sends the email, and logs it on the opportunity.
- **Enquiries inbox** (Sales → Enquiries): website form, emails to the sales mailbox and WhatsApp enquiries in one list. Existing
  customers are recognised by email/phone/domain; the owner of their open opportunity (or the people set in Settings) is alerted.
  One click turns an enquiry into a lead, adds it to an existing opportunity, passes it to someone or dismisses it.
  - **Website:** link to `/enquiry` or embed `<iframe src="https://<crm>/enquiry?embed=1">`; developers can also
    `POST /api/enquiry` (JSON or form fields; optional `x-enquiry-key` = `ENQUIRY_API_KEY`).
  - **Email:** with Microsoft 365 connected (see below) mail to e.g. sales@raybonchemicals.com — or forwarded there — arrives
    automatically. Any other service can POST to `/api/inbound-email`.
  - **WhatsApp:** paste a chat (AI picks out name, company, number, product). On Android, install the CRM (Add to Home screen) and
    use WhatsApp → Share → Raybon Sales CRM.

## Sales CRM: "Salesforce" round (Oct 2026)

- **Raybon structure:** Company → **Plant / site** (with its applications, industry, capacity) → **Application** → Contacts →
  Product → Enquiry → **Technical evaluation & trials** (water analysis, jar test, pilot; planned / running / successful / failed,
  with results) → Quotation → Opportunity → **Order** (Won asks for PO number, date and value). Each opportunity also has a
  **business line** (Water treatment, Membranes, Chemicals, O&M…) and a **forecast category**.
- **Pipeline stages are editable** (Settings → Pipeline stages): rename, reorder, set probability, remove (its deals move to
  another stage). One click adds the suggested flow Enquiry → Technical evaluation → Trial → Quotation → Negotiation.
- **Customer 360°:** the customer page shows open pipeline, business won, orders, last contact, contacts and sites at the top,
  and one timeline with every email, visit, call, note, enquiry, trial, quotation, order and ticket.
- **Playbooks** (Sales → Playbooks): automatic task chains. "When an opportunity mentioning *membrane* is created → water analysis
  (day 0) → membrane selection (day 2) → quotation (day 4) → technical follow-up call (day 11)", or "when a deal enters the
  quotation stage → confirmation call, technical call, commercial meeting". Steps become tasks or calendar activities for the
  salesperson (or a named person), once per opportunity.
- **Scoring:** every open opportunity gets a 0–100 score (A / B / C) from stage, value, how recently and how often the customer
  was contacted, trials, proposal stage, repeat business, Hot/Warm/Cold and overdue follow-ups — hover to see why. Enquiries are
  scored too. Sort the pipeline or the enquiries inbox by score.
- **Forecast** (Performance → Forecast): this/next month, this/next quarter (Apr–Jun…), financial year; by salesperson,
  geography, business line or product. Won (orders) · Commit · Best case · Weighted pipeline, against each person's
  monthly "Order value won" KRA. Flags deals with no or past closing dates.
- **CEO view** dashboard (Dashboards → New → Start from "CEO view"): open pipeline, forecast this quarter, quotations pending,
  overdue follow-ups, sales funnel, follow-ups overdue by salesperson, quotations awaiting decision, win rate, orders by month,
  new enquiries, pipeline by business line.
- **Email capture ("corporate memory"):** emails with known customers are filed on their opportunity automatically —
  - **BCC / forward:** BCC the sales mailbox on any customer email, or forward a customer's email to it. `[OPP-123]` in the
    subject files it on that opportunity. Unknown senders in a forward become enquiries; internal mail is ignored.
  - **Outlook capture:** with Microsoft 365 connected, tick people in Settings → Email capture. Their sent/received mail and
    meetings with customers are logged within minutes (webhook) plus a daily sweep. Only mail with known customer addresses
    or company domains is stored (subject + first 1,500 characters).
- **Hand over** (Settings → Users → "Hand over their work"): move someone's open deals, planned activities, tasks, enquiries and
  tickets to a colleague in one go; history stays with the customer. Optionally switch off their login.

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

- **Microsoft 365 (recommended for raybonchemicals.com):** one app registration handles both directions, with no mailbox password
  (Microsoft is retiring password-based SMTP). Set `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SEND_FROM` and `MS_INBOX`
  — see [deployment](deployment.md#microsoft-365-email). New mail arrives within seconds (Graph change notifications) and a daily
  sweep catches anything missed. Settings → Email shows the status and has **Check mailbox now**.
- **SMTP** (any provider): fill `SMTP_*` and `MAIL_FROM`.
- **Receiving through anything else:** POST to `/api/inbound-email` with the header `x-inbound-secret: $INBOUND_EMAIL_SECRET`
  (`docs/integrations/cloudflare-email-worker.js` is a free example).
  - Helpdesk: a subject containing `TKT-0012` is added to that ticket as a customer reply (and reopens it); any other email creates a
    new ticket, matched to a customer by contact email or domain, with an acknowledgement.
  - CRM: every email becomes an enquiry (duplicates are ignored). A salesperson can forward a customer's mail to the sales mailbox;
    the original sender is picked up from the forwarded header.

## Attachments

Photos are shrunk in the browser before upload, to roughly 100–300 KB each. Files are stored in `./uploads` locally. In production they go to Vercel Blob if `BLOB_READ_WRITE_TOKEN` is set (free tier). Downloads require being logged in.

## Calendar sync

On the Calendar page, open "Sync with Outlook, Google or Apple Calendar" and copy your private link. The link only works once the app is online (not localhost). Set `APP_URL` in `.env` to the public address.

## Moving data over from Odoo

**Recommended — straight from Odoo's API** (`scripts/odoo-import.ts`): customers and contacts, opportunities and leads with
labels, stages, owners, won/lost; their full chatter history (notes and emails), open planned activities, quotations with lines,
helpdesk tickets with their email thread, and optionally attachments. Safe to re-run: it updates what it imported before.

1. Ask ATH Software (or the Odoo admin) for: the Odoo URL, the **database name**, and a login with read access to CRM, Sales,
   Contacts and Helpdesk, plus an **API key** for that login (Odoo → My Profile → Account Security → New API key).
2. Add every salesperson / engineer in Settings → Users with the **same email** they use in Odoo (that's how owners are matched).
3. Dry run, then import — once per database:

```bash
ODOO_URL=https://erp.raybon.athsoftware.com ODOO_DB=<db> ODOO_USER=<login> ODOO_PASSWORD=<api key> \
APP_EDITION=crm DATABASE_URL="libsql://<crm-db>" DATABASE_AUTH_TOKEN="<token>" npx tsx scripts/odoo-import.ts --dry-run
# looks right? run it without --dry-run. Add --attachments to copy files (needs BLOB_READ_WRITE_TOKEN set locally).
# Same again with APP_EDITION=helpdesk and the helpdesk database for tickets.
```

Do a test run into a copy first, check a few customers end to end, then freeze Odoo, run it on production, and switch over.
`--since=YYYY-MM-DD` picks up only what changed after a date (for a final top-up on cut-over day).

**Without API access:** Settings → Import from Odoo takes CSV exports from Odoo's list views (contacts first, then opportunities,
then tickets). It doesn't carry history or attachments.
