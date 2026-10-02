# Changelog

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
