# Deployment

Each product is its own Vercel project and its own Turso database, built from the same GitHub repo.

| | CRM | Helpdesk |
|---|---|---|
| Vercel project | `raybon-crm` | `raybon-helpdesk` |
| Turso database | `raybon-crm` | `raybon-helpdesk` |
| `APP_EDITION` | `crm` | `helpdesk` |

Every push to `main` redeploys both. Pushes to other branches create **preview** deployments (use them to test before merging).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `APP_EDITION` | yes | `crm` or `helpdesk` |
| `DATABASE_URL` | yes | `libsql://…turso.io` for that product's database |
| `DATABASE_AUTH_TOKEN` | yes | Turso token (Read & Write, no expiry). Never share or screenshot it |
| `AUTH_SECRET` | yes | `openssl rand -base64 32`; different per project. Changing it signs everyone out |
| `APP_URL` | yes | The project's public URL (used in emails and calendar links) |
| `BLOB_READ_WRITE_TOKEN` | for uploads | Vercel Blob (Storage tab → connect). Without it uploads fail on Vercel |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | for email | Without them emails are only logged |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | optional | See [features](features.md#ai-free) |
| `CRON_SECRET` | both | Protects the scheduled jobs (below) and the Microsoft 365 webhook |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | for Microsoft 365 | App registration — see [below](#microsoft-365-email). Replaces SMTP |
| `MS_SEND_FROM` | for Microsoft 365 | Mailbox the app sends from, e.g. `crm@raybonchemicals.com` |
| `MS_INBOX` | for email in | Mailbox(es) this project reads: `sales@…` (CRM → enquiries + BCC capture) or `support@…` (helpdesk → tickets) |
| `MS_INTERNAL_DOMAINS` | optional | Extra company domains to treat as internal for email capture (raybonchemicals.com and staff domains are automatic) |
| `MS_CAPTURE` | optional | `off` disables Outlook mailbox capture even if people are ticked in Settings |
| `INBOUND_EMAIL_SECRET` | optional | For other email services posting to `/api/inbound-email` |
| `ENQUIRY_API_KEY` | optional (CRM) | If set, `POST /api/enquiry` needs header `x-enquiry-key` |
| `SALES_INBOX` | combined dev only | Which `to:` address counts as sales (default `sales@`) |

## Scheduled jobs (`vercel.json`, Hobby = once a day each)

| Path | When (IST) | Project |
|---|---|---|
| `/api/cron/mailbox` | 6:00 am | both — renews the Microsoft 365 new-mail subscription, imports anything unread |
| `/api/cron/escalate` | 8:00 am | helpdesk — overdue complaint escalation |
| `/api/cron/nudges` | 8:30 am | CRM — AI follow-up suggestions |
| `/api/cron/daily-report` | 7:30 pm | CRM — daily sales report email |

Each project also receives the other product's jobs; those answer 404 and do nothing.

## Microsoft 365 email

Done once by Raybon's Microsoft 365 admin (Entra admin centre → App registrations → New registration, "Raybon CRM", single tenant):

1. **Certificates & secrets** → New client secret (24 months). Copy the value → `MS_CLIENT_SECRET`. Overview gives
   `MS_TENANT_ID` (Directory ID) and `MS_CLIENT_ID` (Application ID).
2. **API permissions** → Microsoft Graph → *Application permissions*: `Mail.ReadWrite`, `Mail.Send`, `Calendars.Read`
   (meetings for email capture), `User.Read.All` (and later, for Phase 2 two-way calendar sync, `Calendars.ReadWrite`) →
   **Grant admin consent**.
3. Recommended: limit the app to the shared mailboxes **plus the sales team's mailboxes** (only those are captured) with an
   Exchange application access policy / RBAC for Applications.
4. Set the variables in both Vercel projects (`MS_INBOX=sales@…` in CRM, `support@…` in helpdesk), redeploy, then
   Settings → Email → **Check mailbox now**. Renew the client secret before it expires.

## Database changes

The schema lives in `src/db/`. After a change is merged, apply it to **both** production databases
(from the project folder, with that database's values):

```bash
APP_EDITION=crm DATABASE_URL="libsql://…" DATABASE_AUTH_TOKEN="…" npm run db:push
```

Only use `npm run db:seed` on an empty or demo database — it deletes everything.

## Performance

- `vercel.json` pins functions to **Mumbai (`bom1`)**. The Turso databases must be in **Mumbai (AWS ap-south-1)** too:
  every click makes one or two database round trips, and a US↔India round trip adds ~250 ms each.
- Pages load all their data in one round trip (`Promise.all`); keep it that way when adding queries.
- `src/app/(app)/loading.tsx` shows a skeleton immediately on every click.
