# Google Calendar adapter delta

Run: `forge-google-calendar-2026-07-15`
Request class: integration + Git publication
Phase ceiling: `GIT_PUBLISH`

## Product outcome

An authenticated operator can connect one writable Google Calendar to a Qualification + Scheduling agent. Public availability excludes both Forge bookings and Google FreeBusy intervals. A successful booking creates one deterministic Google Calendar event with Google Meet and exposes the meeting link to the qualified lead.

## Functional contract

- `FR-GCAL-001`: initiate Google OAuth only from a tenant-owned Qualification + Scheduling agent.
- `FR-GCAL-002`: request offline access with only calendar event, calendar-list read and free/busy scopes.
- `FR-GCAL-003`: encrypt the refresh token at rest and never return it to the browser, logs or model runtime.
- `FR-GCAL-004`: allow the operator to select any writable calendar returned by Google.
- `FR-GCAL-005`: remove partial and exact Google busy overlaps from public availability.
- `FR-GCAL-006`: create a deterministic event and Google Meet before confirming the Forge booking; recover a retried event create by its stable ID.
- `FR-GCAL-007`: mark expired credentials for reauthorization and close public availability until recovery.
- `FR-GCAL-008`: retain the internal calendar when no external provider is connected and after disconnection.

## Acceptance contract

- `AC-GCAL-001`: OAuth state is signed, expires in ten minutes and is tenant/agent/user bound.
- `AC-GCAL-002`: the server stores only an AES-256-GCM encrypted refresh token and refreshes short-lived access tokens on demand.
- `AC-GCAL-003`: only calendars with writer access are selectable.
- `AC-GCAL-004`: availability excludes every internal or Google interval that overlaps the offered slot.
- `AC-GCAL-005`: concurrent booking validation is serialized per agent and external event IDs are deterministic.
- `AC-GCAL-006`: a confirmed Google booking persists event, calendar and conference references without exposing the encrypted credential.
- `AC-GCAL-007`: disconnected agents remain backward compatible with the internal schedule.
- `AC-GCAL-008`: operator UI covers unconfigured, disconnected, connected, reauthorization, error and success states responsively.
- `AC-GCAL-009`: environment setup and exact callback requirements are documented without real credentials.
- `AC-GCAL-010`: automated tests, typecheck, build, migration review, audit, privacy scan and Git checks pass before publication.

## Security and recovery

- OAuth callback state is HMAC-signed with `AUTH_SECRET`; Google authorization codes are single-use and the state expires after ten minutes.
- Refresh tokens use a dedicated 32-byte secret, AES-256-GCM authenticated encryption and server-only persistence.
- Calendar API failures never fall back silently while a connection is active. Invalid grants move the connection to `reauth_required`.
- Disconnect performs a best-effort Google revocation and always removes the local credential.
- External event creation uses a stable, Google-safe ID derived from the tenant-owned qualification session. A retry reads the already-created event after a duplicate response.
- Rollback is additive: disconnect calendars, deploy the prior application revision and retain the new nullable columns/table until a planned cleanup migration.

## Verification boundary

The adapter is fully testable with mocked official API contracts and local PostgreSQL. A live OAuth consent, real FreeBusy read and real event/Meet creation require user-owned Google Cloud credentials and therefore remain a production/design-partner gate rather than being simulated as release evidence.
