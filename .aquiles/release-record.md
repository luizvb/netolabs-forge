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
