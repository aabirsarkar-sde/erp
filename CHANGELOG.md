# Changelog

## 1.4.0 — 3 Oct 2026

Manager's "Salesforce" list:
- **Raybon structure:** customer plants/sites with applications, application + business line on opportunities, technical
  evaluation & trials, orders (Won records the PO), editable pipeline stages with the suggested Enquiry → Technical evaluation →
  Trial → Quotation → Negotiation flow.
- **Email capture:** BCC / forward to the sales mailbox files customer emails on the right opportunity (`[OPP-123]` to force);
  optional Outlook capture of mail and meetings with known customers via Microsoft Graph.
- **Playbooks:** automatic task chains on create / stage entry, matched by product words and business line.
- **Scoring** of opportunities and enquiries with reasons; pipeline and inbox sortable by score.
- **Forecast** by period (Indian FY quarters) and salesperson / geography / business line / product, with commit / best case /
  weighted and KRA targets. Forecast category on every opportunity.
- **CEO view** dashboard template (+ new measures: quotations pending, overdue follow-ups, new enquiries, forecast, orders).
- **Customer 360°** stats and unified timeline; **hand over** a person's work in one step.
- Odoo import also creates orders from confirmed sales orders.

## 1.3.0 — 3 Oct 2026

Manager's second round:
- **KPI & KRA:** daily / weekly / monthly targets per person, counted automatically from activities, opportunities, quotations and
  orders (or typed in by hand); team scoreboard; targets strip on the calendar day and dashboard.
- **Calendar colours:** planned blue, done green, overdue red, meetings violet, with a key — everywhere activities appear.
- **Saved dashboards:** personal boards with chosen measure / grouping / chart / period, shareable and copyable.
- **Notifications bell**, manager **reminders** ("please call this party"), and morning **AI follow-up suggestions** with one-tap
  call / WhatsApp / email.
- **Templates & collateral:** WhatsApp and email templates with placeholders, case-study / brochure library, expiring share links,
  **Send to customer** panel on every opportunity (logged automatically). New activity type: WhatsApp.
- **Enquiries inbox:** public website form (+ embed and API), email-to-CRM, WhatsApp paste with AI, Android share target;
  customer matching, routing and one-click convert / add to opportunity.
- **Microsoft 365 email** through Graph (send + receive, webhook + daily sweep) for both products — replaces SMTP.
- **Odoo API import** (`scripts/odoo-import.ts`) with history, activities, quotations, tickets and attachments; re-runnable; tested
  against a fake Odoo.

## 1.2.0 — 3 Oct 2026

Manager's CRM requests:
- Opportunity labels with groups and colours (geography, customer type, product, Hot/Warm/Cold, auto "OR FY…" on win).
- Contact details card with highlighted gaps and an automatic reminder until filled.
- Day counter on every opportunity; order turnaround (creation → won) on opportunities, lists and reports.
- Kanban grouping by stage / salesperson / product / geography / temperature; sort by value; quick add.
- Calendar Day view: planner, work done and diary with a short entry form linked to customer and opportunity.
- Daily report page and 7:30 pm email to managers.
- Tasks module (both products): assign, due dates, kanban, supervisor view, email notifications, on opportunity/ticket pages.
- Sales dashboards by salesperson, product, geography, temperature, stage, customer, source, label.
- Outlook feed shows timed activities at their time.

Platform: upgraded to Next.js 16 (fixes buttons occasionally staying on "Saving…" after a save), `middleware.ts` → `proxy.ts`,
ESLint flat config from Next 16, WAL mode for the local database.

## 1.1.0 — 2 Oct 2026

- **Faster:** every page now loads its data in a single database round trip, shows a loading skeleton
  instantly on click, and runs in Vercel's Mumbai region next to the database. Chat no longer writes to the
  database on every unread check.
- **Fixed:** "today", "this month" and follow-up times now always use India time (servers run in UTC, so
  late-night dates and the dashboard greeting could be off).
- **Housekeeping:** code grouped by product (`core`, `helpdesk`, `crm`, `workspace`, `ai`), dead code removed,
  ESLint, unit tests, end-to-end tests in the repo, CI on GitHub Actions, development and deployment docs.

## 1.0.0 — 1–2 Oct 2026

- Split into two products: **Raybon Sales CRM** and **Raybon O&M Helpdesk** (`APP_EDITION`), each with its
  own database, logins, branding and routes.
- Client requirements: department/zone access, leads → opportunities, proposals, calendar activities with
  visit/call reports and automatic follow-ups, sales & visit reports, helpdesk form (zone, site, plant serial,
  company, category, priority, tags, assignee) and stages New → In Process → Awaiting → Done.

## 0.x — Sep 2026

- Helpdesk (tickets, SLA, email in/out, TAT, transfers, dashboard, exports, customer portal, escalations),
  CRM (pipeline, activities, quotations), AI assistant, calendar, chat, documents, insights, Odoo import.
