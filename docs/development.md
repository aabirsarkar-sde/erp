# Development process

A lightweight software-development life cycle for a small team. The goal: `main` is always deployable,
and nothing reaches the client without passing checks and a preview test.

## 1. Requirement → issue

Every change starts as a GitHub issue: what the client asked for (quote the email), which product
(CRM / Helpdesk / both), and acceptance criteria ("zonal manager sees only their zone").

## 2. Branch

```bash
git switch -c feature/short-name      # or fix/short-name
```

Never commit straight to `main`; `main` deploys to the client.

## 3. Build

- Server data access goes through `src/lib/**`, writes through `src/app/actions/**`.
- **Every query must apply the access scopes** in `src/lib/core/access.ts` (`leadScope`, `ticketScope`, …),
  and every action must call the matching guard (`guardLead`, `guardTicket`). Detail pages return 404 when the
  user can't see the record.
- Product-specific screens: check `src/lib/core/edition.ts` and the route lists in `src/middleware.ts`.
- Dates: business time is IST. Use `src/lib/core/tz.ts`, never `new Date().setHours()` (servers run in UTC).
- Load page data in one `Promise.all` (one database round trip).
- ESLint shows React Compiler advisories as warnings (components defined inside render, `Date.now()` in render, …).
  Fix them in files you touch; new code shouldn't add any.
- Next.js gotchas: don't export plain helpers from `"use client"` files for server use; don't pass functions
  from server to client components; keep `userId`-taking helpers out of `"use server"` files (they become public).

## 4. Test

```bash
npm run check        # lint + typecheck + unit tests
npm run test:e2e     # browser tests against a running app (see tests/README.md)
```

Add a unit test for any pure logic you add (`tests/unit/*.test.ts`) and extend the e2e scripts for new flows.

## 5. Review & preview

Open a pull request. CI (`.github/workflows/ci.yml`) runs lint, type-check, unit tests and builds both products.
Vercel posts a preview link for each product — click through the change there.

## 6. Release

1. Merge the PR into `main` → both products deploy automatically.
2. If the schema changed, run `npm run db:push` against both production databases (see deployment.md).
3. Bump `version` in `package.json`, add an entry to `CHANGELOG.md`, and tag: `git tag v1.2.0 && git push --tags`.
4. Tell the client what changed.

## 7. Maintain

- Rollback: Vercel → project → Deployments → previous deployment → **Promote to Production**.
- Turso keeps point-in-time backups; restore from the Turso dashboard if data is damaged.
- Review `npm audit` and dependency updates monthly.
