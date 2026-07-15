# Release record: Agent Kits + Google Calendar

Run: `forge-google-calendar-2026-07-15`
Date: 2026-07-15
Phase ceiling: `GIT_PUBLISH`

## Candidate

- Repository: `git@github.com:luizvb/netolabs-forge.git`
- Branch: `main`
- Source commit: pending feature commit
- Deployment: not requested; production runtime and database remain unchanged
- Scope: existing multi-provider/public-agent work, Qualification + Scheduling Kit, product/GTM artifacts and Google Calendar adapter

## Release gates

- Typecheck: passed
- Tests: 81/81 passed
- Production build: passed
- Additive migrations: applied to isolated local PostgreSQL
- Browser QA: disconnected and reauthorization states passed at desktop and 390 px
- Privacy scan: 1,241 files, zero findings
- Dependency audit: conditional; npm registry legacy audit endpoint returned HTTP 410
- Live Google OAuth: conditional; requires owner credentials and environment authorization

## Configuration

Server-only names: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`, and existing `AUTH_SECRET`.

## Rollback

Revert the feature commit and disconnect any configured calendar before rollback. Migration `0008` is additive and can remain in place while the previous runtime ignores its table and nullable columns. No production migration or credential was changed in this run.
