# Release record: Agent Kits + Google Calendar

Run: `forge-google-calendar-2026-07-15`
Date: 2026-07-15
Phase ceiling: `GIT_PUBLISH`

## Candidate

- Repository: `git@github.com:luizvb/netolabs-forge.git`
- Branch: `main`
- Feature commit: `80955c3f24aabb445956c48eaf3bbcedb73c4885`
- Audit-gate fix: `3be1734ac3faaef6ed69748db3b8b15b4c9dab8d`
- Verified code head on `origin/main`: `3be1734ac3faaef6ed69748db3b8b15b4c9dab8d`
- Deployment: not requested; production runtime and database remain unchanged
- Scope: existing multi-provider/public-agent work, Qualification + Scheduling Kit, product/GTM artifacts and Google Calendar adapter

## Release gates

- Typecheck: passed
- Tests: 81/81 passed
- Production build: passed
- Additive migrations: applied to isolated local PostgreSQL
- Browser QA: disconnected and reauthorization states passed at desktop and 390 px
- Privacy scan: 1,241 files, zero findings
- Dependency audit: passed with pnpm 11.13.0 against npm's supported bulk advisory endpoint; no known vulnerabilities found
- Live Google OAuth: conditional; requires owner credentials and environment authorization
- GitHub CI: passed — `https://github.com/luizvb/netolabs-forge/actions/runs/29439126364`

## Configuration

Server-only names: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`, and existing `AUTH_SECRET`.

## Rollback

Revert the feature commit and disconnect any configured calendar before rollback. Migration `0008` is additive and can remain in place while the previous runtime ignores its table and nullable columns. No production migration or credential was changed in this run.

---

# Release record: Premium trial billing

Run: `forge-premium-trial-2026-07-15`
Date: 2026-07-15
Phase ceiling: `GIT_PUBLISH`

## Candidate and authorization

- Repository: `git@github.com:luizvb/netolabs-forge.git`
- Account / owner / repository: `luizvb` / `luizvb` / `netolabs-forge`
- Visibility / branch: public / `main`
- Base commit: `aaf000a`
- Scope: 7-day payment-backed Premium trial, 50 workspace-shared runs, one-time trial persistence, legacy counter initialization, Billing disclosure and additive migration `0009`.
- Authorized: production migration, commit of the complete candidate and push to `origin/main`.
- Not authorized: Vercel deploy, environment changes, DNS or live Stripe test/customer mutation.

## Database release evidence

- Neon project / branch / database: `netolabs-forge-db` (`wispy-lab-44668375`) / `main` / `neondb`.
- Migration command completed at 2026-07-15T15:28:00-03:00 using the repository Drizzle migration path and a direct authenticated Neon connection.
- Verified columns: `workspace_subscriptions.trial_started_at` and `trial_ends_at`, nullable `timestamp with time zone`.
- Verified journal: 10 entries; latest timestamp matches migration `0009_glossy_mattie_franklin`.
- Rollback: application code can be reverted while leaving both nullable columns in place. Dropping columns is unnecessary and would require separate destructive authorization.

## Quality and release gates

- Typecheck: passed.
- Tests: 87/87 passed.
- Production build: passed.
- Desktop and 390 px Billing browser QA: passed with no horizontal overflow.
- Privacy scan: 1,245 files, zero findings.
- Diff check: passed.
- Dependency audit: conditional because npm's legacy audit endpoint returned HTTP 410.
- Provider smoke: deferred; no Stripe test-mode or production customer mutation was authorized.

## Git publication

- Feature commit: `396cf0e61c330521b6935ab3e41b26c270fb2cfe` (`Add payment-backed Premium trial`).
- Remote verification: `origin/main` matched the feature commit with zero divergence after push.
- GitHub CI: passed — `https://github.com/luizvb/netolabs-forge/actions/runs/29440853378`.
- Evidence-only follow-up uses `[skip ci]`; it changes no product code or database state.
