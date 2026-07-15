# Qualification + Scheduling Kit test report

Run: `forge-qualification-scheduling-2026-07-15`
Date: 2026-07-15
Environment: local PGlite/PostgreSQL socket, Fastify API, Vite web
Result: `passed`

## Automated verification

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed for web, database and API workspaces |
| `pnpm test` | 75/75 passed: 24 web and 51 API tests |
| Qualification domain suite | 5/5 passed: high-fit score, area exclusion, stale/invalid choices, structured scoring and occupied-slot filtering |
| `pnpm build` | Production builds passed for web, database and API |
| `git diff --check` | Passed |
| Aquiles privacy scan | 1,229 files scanned, zero high-confidence findings |
| Migration review | `0007_green_marten_broadcloak.sql` is additive; local application passed |

## Database-backed critical path

- Registered a tenant, installed the Kit and verified five seeded eval scenarios.
- Confirmed public metadata exposes only the safe template summary and omits private configuration.
- Proved the generic public chat cannot bypass the deterministic Kit flow (`409`).
- Completed two in-area, high-fit sessions; both produced operator-visible score `7`.
- Replayed the same qualification request ID and received the stored response without advancing twice.
- Confirmed the first booking and replayed its request ID safely (`reused: true`).
- Verified the occupied start disappeared from the second session's availability.
- Attempted the occupied start from the second session and received `409`.
- Verified operator metrics: 2 sessions, 2 completed, 2 qualified and 1 booking.
- Verified qualification start returns `404` for unpublished, disabled and non-Kit agents.

## Browser and responsive QA

- Catalog, Kit setup, public consent/conversation and operator operation screens rendered successfully.
- Installed a Kit through the web interface and landed on its default `Operação` tab.
- Public layout passed at 1280 px and 390 x 844 px with no document-level horizontal overflow.
- Kit setup and operation screens passed at 390 px after fixing hidden-checkbox and tab-strip overflow.
- Corrected primary-button contrast in the public dark theme and verified the action icon is visible.
- Loading, empty, consent, collecting and persisted-resume states were observed; qualified, conflict and booked states were proven through the database-backed API path.

## Residual release gates

- Production migration, provider credentials, commit, push and deployment were not authorized and were not performed.
- External calendar/CRM/WhatsApp adapters, cancellation, rescheduling and LGPD retention/deletion controls remain explicit roadmap work.

---

# QA report: Google Calendar adapter

Run: `forge-google-calendar-2026-07-15`
Status: `conditional_pass`

## Automated evidence

- `pnpm typecheck`: passed across web, database and API.
- `pnpm test`: 81/81 passed across 19 test files.
- Google adapter suite: 5/5 passed for signed/expiring OAuth state, offline/scoped authorization URL, AES-256-GCM token encryption, invalid-grant recovery, FreeBusy overlap filtering and deterministic event retry.
- Qualification suite: 6/6 passed, including partial-overlap removal for internal bookings.
- `pnpm build`: production web, database and API builds passed.
- `git diff --check`: passed.
- Aquiles privacy scan: 1,241 files, zero findings.
- The original `pnpm audit --prod` gate exposed a retired npm endpoint (HTTP 410). The repository and CI were updated to run pnpm 11.13.0 against npm's supported bulk advisory API; `pnpm audit:prod` then passed with no known vulnerabilities.

## Migration and integration evidence

- Drizzle migration `0008_glorious_carlie_cooper.sql` is additive: one tenant-owned connection table and nullable external event fields plus a defaulted sync-status field.
- Migrations `0006..0008` applied successfully to isolated local PGlite/PostgreSQL.
- An authenticated local workspace installed the Kit and loaded the calendar connection contract through the real HTTP routes.
- The disconnected state rendered a unique “Conectar Google Calendar” action without exposing credentials.
- A local `reauth_required` fixture rendered the reconnection recovery state.
- At 390 × 844 the connection card collapsed to one column with no horizontal overflow (`scrollWidth = 390`).
- No browser console errors were observed in the operator flow.

## Residual live-provider gate

Live Google consent, calendar discovery, FreeBusy and event/Meet creation were not executed because no user-owned OAuth client or refresh token was provided and production environment mutation was not authorized. The implementation is ready for that design-partner gate after the documented environment values and exact callback URI are configured.

---

# QA report: Premium trial billing

Run: `forge-premium-trial-2026-07-15`
Status: `conditional`
Environment: isolated local PGlite/PostgreSQL, Fastify API, Vite web, Stripe boundary mocked by pure contract tests

## Acceptance evidence

- `AC-TRIAL-001`: passed. Checkout policy tests prove payment collection is always required, the first eligible Checkout sends a 7-day trial, and a workspace with a persisted trial start receives no second trial.
- `AC-TRIAL-002`: passed at policy/transaction review. Aggregate tests reach 49 consumed plus 1 reserved across two agents and reject the next run; the reservation path uses the existing workspace advisory lock.
- `AC-TRIAL-003`: passed. A `trialing` workspace cannot use the paid bucket, while an `active` subscription goes directly to the monthly bucket without carrying unused trial runs.
- `AC-TRIAL-004`: passed. Subscription snapshots preserve `trial_started_at` and `trial_ends_at` when a later subscription omits trial fields.
- `AC-TRIAL-005`: passed. Billing status exposes aggregate trial usage and dates; the rendered free/eligible screen discloses 7 days, 50 shared runs, mandatory payment method and automatic first charge unless canceled.
- `AC-TRIAL-006`: passed. Legacy free usage resets only on the first verified `trialing` snapshot; retries and later subscriptions cannot reset it again.

## Verification ledger

- `pnpm typecheck`: passed across web, database and API.
- `pnpm test`: passed, 87/87 tests across 19 test files.
- `pnpm build`: passed for production web, database and API builds.
- Migration `0009_glossy_mattie_franklin.sql`: reviewed as two nullable additive timestamp columns and applied successfully to an isolated local database.
- Browser QA: authenticated Billing screen passed at default desktop and 390 × 844; all three plan actions disclosed the 7-day trial and document width remained exactly 390 px with no horizontal overflow.
- `git diff --check`: passed.
- Aquiles privacy scan: 1,245 files, zero findings.
- `pnpm audit --prod`: inconclusive because the npm legacy audit endpoint returned HTTP 410; this is an external tooling limitation, not a clean vulnerability result.

## Conditional provider gate

Stripe test-mode Checkout, signed `trialing -> active` webhook delivery and the actual first invoice charge were not executed because no provider mutation or live/test billing credentials were authorized. Local code is ready; release remains conditional on applying migration `0009`, deploying the API/web candidate and completing a Stripe test-clock or sandbox smoke.

## GitHub publication

- Feature commit: `80955c3f24aabb445956c48eaf3bbcedb73c4885`.
- Audit-gate fix: `3be1734ac3faaef6ed69748db3b8b15b4c9dab8d`.
- GitHub CI run `29439126364`: passed typecheck, database runtime build, 81 tests, production build and production dependency audit.
