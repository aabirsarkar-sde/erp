# Tests

## Unit tests

```bash
npm test
```

Pure logic (time zone, formatting, quotation maths, CSV import, SLA, activity colours, KPI periods, follow-up rules, templates, WhatsApp parsing, Odoo field mapping, scoring, playbook matching, email-capture addresses). Uses Node's built-in test runner via `tsx`.

## End-to-end tests

Real browser scripts (Playwright) that click through the app. They change data, so run them against a
**freshly seeded local database**, never production.

```bash
npx playwright install chromium          # once
npm run setup                            # fresh sample data (combined app)
npm run build && npm start               # in one terminal (port 3000)
npm run test:e2e                         # in another
```

| Script | Build | Covers |
|---|---|---|
| `crm-and-access.e2e.mjs` | combined (`APP_EDITION` unset) | access rules, helpdesk form/stages, leads → opportunities, proposals, visit reports, sales reports |
| `helpdesk.e2e.mjs` | combined or helpdesk | complaint flow, transfer, email chain, signature + TAT, dashboard, exports, public portal, cron |
| `crm-workflow.e2e.mjs` | combined or CRM | labels, contact reminders, day counter / TAT, kanban grouping & value sort, quick add, calendar planner / work done / diary, daily report + cron, tasks, dashboards |
| `crm-engage.e2e.mjs` | combined or CRM | calendar colours, KPI/KRA targets + scoreboard, saved dashboards, reminders, AI nudges + cron, templates & collateral, send WhatsApp/email, enquiries (web form, API, email-in, WhatsApp paste, convert / add to opportunity) |
| `crm-structure.e2e.mjs` | combined or CRM | stage editor, sites, trials, won → order, playbooks, scoring, forecast, CEO view, customer 360 timeline, email capture (BCC / forward / internal), handover |
| `editions.e2e.mjs <crm\|helpdesk>` | that edition, its own seeded DB | product separation, branding, blocked routes |

Reseed between runs (`npm run db:seed`). Screenshots go to `tests/e2e/.out/`.
Options: `BASE_URL`, `CHROMIUM_PATH`, `INBOUND_EMAIL_SECRET`, `CRON_SECRET`.

## Odoo import test

```bash
npm run test:odoo     # needs a seeded local.db (npm run setup)
```

Runs `scripts/odoo-import.ts` against a fake Odoo (`tests/integration/odoo-mock.mjs`) and a scratch copy of the database:
dry run, CRM import, re-run without duplicates, helpdesk tickets.
