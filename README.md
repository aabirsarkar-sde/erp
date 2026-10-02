# Raybon ERP

Business software for Zero Discharge Systems Pvt. Ltd. (Raybon / Rochem), replacing the old Odoo system.
One codebase, deployed as **two separate products**:

| Product | `APP_EDITION` | For | Main modules |
|---|---|---|---|
| **Raybon Sales CRM** (blue) | `crm` | Sales & Marketing | Leads, opportunities (labels, day counter, kanban views), calendar planner / work done / diary, daily report, proposals, quotations, dashboards |
| **Raybon O&M Helpdesk** (teal) | `helpdesk` | Operations & Maintenance | Complaints/tickets by zone, plants, TAT, SLA, helpdesk dashboard, customer portal |

Both include Calendar, Tasks, Discuss (chat), Documents, Customers, Ask AI, Insights and Settings. Each product has its own
database and logins. Leave `APP_EDITION` empty locally to run both together.

**Stack (all free tiers):** Next.js 16 (App Router, server actions) · React 19 · Tailwind CSS 4 · Drizzle ORM ·
SQLite locally / Turso in production · Vercel hosting.

## Quick start

Needs Node 20+.

```bash
npm install
cp .env.example .env
npm run setup     # creates local.db with sample data
npm run dev       # http://localhost:3000
```

Sample logins: `admin@raybon.local` / `admin123`, everyone else `<firstname>@raybon.local` / `raybon123`
(e.g. `aarti@` sees everything, `gaurang@` is a salesperson, `rakesh@` is the Dahej zonal manager).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run check` | Lint + type-check + unit tests (run before every push) |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser end-to-end tests (see `tests/README.md`) |
| `npm run build` | Production build |
| `npm run db:push` | Apply schema changes in `src/db/` to the database |
| `npm run db:seed` | **Wipes** the database and loads sample data |
| `npm run db:studio` | Browse the database |

## Project structure

```
src/
  app/                    routes (Next.js App Router)
    (app)/                signed-in pages: dashboard, tickets, crm, calendar, …
    actions/              server actions (all writes go through these)
    api/                  route handlers: exports, files, inbound email, cron, calendar feed
    print/                printable A4 pages (save as PDF)
    complaint/, feedback/ public customer pages (helpdesk only)
  components/
    ui/                   layout, navigation, icons, charts, form controls
    helpdesk/             complaint form, ticket actions, …
    crm/                  lead/opportunity forms, activities, quotations
    workspace/            chat, calendar events, documents, importer, admin forms
  lib/
    core/                 auth, access control, editions, time zone, formatting, storage, mail, Excel
    helpdesk/             ticket queries, SLA, dashboard stats, notifications, inbound email
    crm/                  pipeline queries, sales reports, quotation maths
    workspace/            chat, calendar, ICS, navigation
    ai/                   AI client, Ask AI tools, AI features
  db/                     Drizzle schema (core, crm, workspace) and client
  proxy.ts                sign-in check and per-product route blocking (Next.js 16 "proxy", formerly middleware)
scripts/                  database seed scripts
tests/                    unit tests (node:test) and end-to-end scripts (Playwright)
docs/                     features, deployment, development process, integrations
```

## Documentation

- [Features](docs/features.md): workflows, access rules, AI, email, imports
- [Deployment](docs/deployment.md): Vercel + Turso setup for both products, environment variables, performance
- [Development process](docs/development.md): branches, reviews, testing, database changes, releases
- [Changelog](CHANGELOG.md)
