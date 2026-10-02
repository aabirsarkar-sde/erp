# Changelog

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
