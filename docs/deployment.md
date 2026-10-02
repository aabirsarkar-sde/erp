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
| `CRON_SECRET` | helpdesk | Protects the daily escalation email |
| `INBOUND_EMAIL_SECRET` | helpdesk, optional | For email-to-ticket ([worker](integrations/cloudflare-email-worker.js)) |

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
