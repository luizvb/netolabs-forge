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
- `pnpm audit --prod`: registry audit endpoint returned HTTP 410 because that endpoint is being retired; rerun with `--ignore-registry-errors` confirmed the infrastructure condition but produced no vulnerability result. This is recorded as an external tooling limitation, not a clean audit.

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
