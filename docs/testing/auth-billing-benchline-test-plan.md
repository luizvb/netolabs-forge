# Forge auth, billing and Benchline independent test plan

Status: ready after independent repair retest
Owner: Tester -> Main
Product contract: `docs/product/auth-billing-benchline-brief.md`
Forge engineering plan: `docs/engineering/auth-billing-benchline-plan.md`
Benchline integration plan: `/Users/luizneto/mz/netolabs-benchline/docs/plans/forge-bundle-integration.md`
Last updated: 2026-07-13

## Decision supported

Determine independently whether the dirty local Forge and Benchline worktrees satisfy the approved auth, billing, usage and bundled-evals contract strongly enough for a `ready`, `conditional` or `blocked` QA verdict. This plan records reproducible evidence only; it does not authorize migration, provider calls, commit, push or deploy.

## Candidate identity and environment

- Forge baseline HEAD: `2b4579afb42aa37f20a04e5bdb292a9ebbe66e1c`; candidate is the current dirty worktree plus this test-plan-only Tester artifact.
- Benchline baseline HEAD: `3ef345c70eaaa84dcab3c1acd553317c10f985b0`; candidate is the current dirty worktree, including concurrent billing/provider/UI work not attributable to this run.
- Environment: local macOS, `America/Sao_Paulo`, pnpm/TypeScript monorepos, no live secrets/providers and no database migration execution.
- Validation mode: automated native tests/build plus static contract, security, privacy and SQL inspection.
- Candidate limitation: neither repository is an immutable commit; any worktree mutation during validation invalidates affected evidence and requires a targeted rerun.

## Scope, non-goals and preservation rules

In scope:

- all `AC-*` in the approved Forge brief;
- Forge and Benchline native typecheck, full tests and build;
- `git diff --check`, migration SQL inspection and privacy scan;
- static review of authn/authz, Stripe, usage, consent/privacy, HMAC/idempotency, bundle isolation/fair use/history and required UI states;
- confirmation that pre-existing user/concurrent files remain present and are not reverted by Tester.

Explicitly untested or prohibited:

- real Google/Neon OAuth, real Stripe Checkout/Portal/webhooks, real cross-repository HTTP and any production-provider parity;
- applying migrations, live database writes, commits, pushes or deploys;
- correction of product code or edits outside this test plan;
- attribution of all Benchline dirty changes to the Forge bundle run.

Preservation controls:

- Forge `apps/web/src/pages/Landing 2.tsx` must remain present and untouched by Tester.
- Benchline concurrent changes in billing/provider/UI and `docs/plans/billing-resilience-notifications.md` must remain untouched and unattributed.
- Before/after `git status --porcelain=v1 -uall` inventories are compared. The only Tester-created path may be this file.

## Risk ranking and critical paths

1. `critical`: identity must pin issuer plus subject and must not auto-link legacy accounts by email.
2. `critical`: all billing/link mutations require workspace owner authorization; the browser cannot select arbitrary prices.
3. `critical`: Stripe signature verification uses raw bytes; webhook events are idempotent and ordered; redirects never grant entitlement.
4. `critical`: trial/monthly reservations are atomic at 30/31 and 1,500/1,501, renew once and cannot double-spend the final request.
5. `critical`: consent is versioned and initially unchecked; sync payloads exclude knowledge, conversations and raw model-call bodies.
6. `critical`: S2S HMAC binds method/path/timestamp/idempotency/body hash and rejects stale/replayed/tampered requests.
7. `high`: Forge bundle is isolated from direct Benchline billing/credits; fair use is 5 suites or 40 cases per active agent per month with workspace concurrency 1.
8. `high`: terminal revocation blocks new bundled evals without deleting historical evidence; cancel-at-period-end remains active through the boundary.
9. `high`: required UI loading/error/disabled/success states and guest draft preservation are represented and tested where the local environment permits.

## Requirement-to-test matrix

Allowed result vocabulary for this plan is `pass | fail | unverified`.

| Acceptance ID | Test ID | Independent command or inspection | Oracle | Final result |
| --- | --- | --- | --- | --- |
| `AC-AUTH-001` | `TEST-AUTH-001` | API auth tests plus inspection of `apps/api/src/auth.ts` and identity/provisioning path | valid configured issuer/signature maps `(issuer, sub)` idempotently; invalid issuer/signature is 401; email is not an automatic account-link key | pass |
| `AC-AUTH-002` | `TEST-AUTH-002` | full web tests/build plus inspection of auth callback and guest draft storage/use | guest draft survives OAuth redirect and remains publishable; loading/error/success are explicit | pass |
| `AC-PLAN-001` | `TEST-PLAN-001` | plan/catalog/billing tests and route inspection | only `solo|studio|scale`; server maps Price ID; only owner starts Checkout; redirect grants no entitlement; verified webhook is source of truth | pass |
| `AC-PLAN-002` | `TEST-PLAN-002` | billing webhook tests and raw-body/order/idempotency inspection | unsigned/invalid signature changes nothing; duplicate event changes once; older event cannot overwrite newer snapshot | pass |
| `AC-AGENT-001` | `TEST-AGENT-001` | plans/entitlements tests and schema/service inspection | Solo 1, Studio 3, Scale 10 active; Scale can store an 11th disabled; stored definitions otherwise unlimited | pass |
| `AC-USAGE-001` | `TEST-USAGE-001` | entitlements tests for 30/31 and provider boundary inspection | exactly 30 lifetime per stable lineage; request 31 denied before provider call | pass |
| `AC-USAGE-002` | `TEST-USAGE-002` | entitlements tests for 1,500/1,501, period renewal and no rollover | paid per-active-agent bucket reaches 1,500, 1,501 is denied, next period grants exactly once, unused balance does not roll | pass |
| `AC-USAGE-003` | `TEST-USAGE-003` | concurrency/reservation tests and transactional update inspection | two attempts against one remaining request yield one reservation and one controlled denial; pre-provider failure releases; provider-started work consumes | pass |
| `AC-BENCH-001` | `TEST-BENCH-001` | Forge Benchline tests and UI/API inspection | consent checkbox starts unchecked; without checked consent there is no consent record or outbound Benchline request; only owner can accept/link | pass |
| `AC-BENCH-002` | `TEST-BENCH-002` | Forge orchestration plus Benchline partner tests/inspection | current agents/twins provision once with stable external IDs; retry is idempotent and returns mappings | pass |
| `AC-BENCH-003` | `TEST-BENCH-003` | Forge component/source state inspection and tests if present | connected, syncing/loading, error, revoked and unavailable render with safe retry/disabled behavior | pass |
| `AC-BENCH-004` | `TEST-BENCH-004` | Forge status adapter/UI and Benchline response allowlist inspection | latest summary/findings/recommendations are workspace/agent scoped and no credential reaches browser | pass |
| `AC-BENCH-005` | `TEST-BENCH-005` | Forge + Benchline cancellation/revocation/history tests and schema/service inspection | cancel-at-period-end preserves access until boundary; terminal revoke blocks only new bundled execution and preserves readable history | pass |
| `AC-PRIV-001` | `TEST-PRIV-001` | integration contract tests, strict schema inspection and privacy scan | sync allowlist excludes knowledge, conversations and raw model-call bodies; forbidden fields reject without partial write | pass |

## Repository and non-functional gates

| Gate | Command/inspection | Expected result | Final result |
| --- | --- | --- | --- |
| `TEST-GIT-FORGE` | `git diff --check` in Forge | exit 0 | pass |
| `TEST-GIT-BENCH` | `git diff --check` in Benchline | exit 0 | pass |
| `TEST-TYPE-FORGE` | `pnpm typecheck` | exit 0 across workspace | pass (Main rerun) |
| `TEST-TYPE-BENCH` | `pnpm typecheck` | exit 0 across workspace | pass (Main rerun) |
| `TEST-FULL-FORGE` | `pnpm test` | complete suite exit 0 | pass (Main rerun) |
| `TEST-FULL-BENCH` | `pnpm test` | complete suite exit 0 | pass (Main rerun) |
| `TEST-BUILD-FORGE` | `pnpm build` | production build exit 0 | pass (Main final rerun) |
| `TEST-BUILD-BENCH` | `pnpm build` | production build exit 0 | pass (Main final rerun; known non-blocking >500 kB web chunk warning) |
| `TEST-SQL-FORGE` | inspect `packages/db/drizzle/0004_normal_misty_knight.sql` and metadata without applying | additive/backward-safe intent; keys/constraints support contract; no destructive SQL | pass; not applied |
| `TEST-SQL-BENCH` | inspect `0007_flippant_living_lightning.sql`, `0008_friendly_sunspot.sql` and metadata without applying | bundle changes additive/isolated; concurrent migration preserved; no destructive history operation | pass; not applied |
| `TEST-PRIV-FORGE` | Aquiles `privacy_scan.py --workspace <forge> --json` | no high-confidence secret/private-data finding | pass; prior clean scan plus bounded repair-diff review |
| `TEST-PRIV-BENCH` | Aquiles `privacy_scan.py --workspace <benchline> --json` | no high-confidence secret/private-data finding | pass; only ignored pre-existing local files previously flagged |
| `TEST-PRESERVE` | compare before/after status and protected files | no product file modified/reverted by Tester; protected concurrent/user files remain | pass |

## Security and contract review checklist

- [x] Neon JWT pins configured issuer/JWKS and audience when available; `sub` is required; missing/expired/malformed tokens fail; no email takeover path.
- [x] Owner authorization is enforced server-side for Checkout, Portal, consent, link, retry/revoke and any workspace-scoped mutation.
- [x] Stripe uses raw-body signature verification before parsing, event-ID idempotency, out-of-order protection, server-owned prices and no redirect entitlement.
- [x] Plan enforcement is Solo 1, Studio 3, Scale 10 active; Scale supports unlimited stored definitions with excess disabled.
- [x] Trial 30/31 and paid 1,500/1,501 boundaries, reservations, release/commit semantics, concurrency and period renewal are covered.
- [x] Consent is versioned, records actor/timestamp/scopes/revocation and is visibly unchecked by default.
- [x] Sync uses a strict allowlist excluding knowledge documents, conversations and raw model calls.
- [x] HMAC binds method, path, timestamp, idempotency key and exact raw-body hash; stale/replay/tamper checks fail closed or returns the persisted idempotent response.
- [x] `source=forge_bundle` is isolated from direct-product billing, provider subscriptions and credit balances.
- [x] Fair use enforces 5 suites or 40 cases per active agent/month and concurrency 1 per workspace, with no Forge chat usage consumption.
- [x] Revocation stops new bundled evals/sync but does not erase suites, runs, findings, recommendations or other evidence; same-event Stripe redelivery retries a pending remote revoke.
- [x] UI represents loading, error, disabled and success states; Forge guest draft survives auth redirect.

## Test data, roles, mocks and cleanup

- Roles: unauthenticated guest, authenticated member, authenticated owner, wrong-workspace owner/member.
- Data: synthetic workspace/agent IDs, locally generated JWT keys/claims, synthetic Stripe event payloads/signatures and deterministic HMAC fixtures only.
- Mocked boundaries: Neon JWKS/identity DB, Stripe provider, model provider, Forge-to-Benchline HTTP and database adapters where the repository tests choose them. These fixtures can prove local policy/contract behavior but not provider or deployed parity.
- No real accounts, credentials, payment data, prompts, knowledge documents or production records may be used.
- Cleanup: no live persistence; test runners own temporary/in-memory state. No migration is applied.

## UI, accessibility, performance and CI coverage

- UI source/tests/build will cover declared state mapping, keyboard-native controls, disabled actions and guest-draft persistence. A rendered desktop/mobile Playwright run is not planned unless the apps can start safely without secrets and without writes.
- Accessibility evidence is limited to semantic/source inspection and existing component tests unless a safe local browser boundary is available. No full WCAG claim will be made.
- Performance evidence is limited to local enforcement architecture and production build output; no field Core Web Vitals or production API latency evidence exists.
- CI configuration will be inspected for applicability. Local green commands do not prove remote CI.

## Exit criteria and verdict rules

- `ready`: every critical AC has direct local evidence, all relevant quality/privacy gates pass and no unresolved P0/P1 exists.
- `conditional`: bounded gaps or P2 risks remain and require explicit conditions/acceptance.
- `blocked`: a critical path fails or remains unverified, a build/typecheck/privacy gate fails, candidate identity changes materially, or any P0/P1 remains.

Retest after Coder repair must include the failed test/inspection, adjacent contract boundary, full affected suite, typecheck and build. Tester will not repair product code.

## Evidence log and final verdict

Repair retest performed as a bounded read-only static review of the previously failing paths. Tester did not rerun broad suites and did not modify product code.

Evidence accepted:

- Main independently reran both repositories' typechecks and full native tests successfully after the repair.
- Tester reran `git diff --check` in Forge and Benchline; both exited 0.
- Neon issuer/JWKS/signature fixtures and OAuth draft destination tests now directly cover the prior auth gaps.
- `MODEL_NOT_CONFIGURED` now releases a pre-provider reservation; `USAGE_EXHAUSTED` includes trial, paid and renewal details.
- Forge and Benchline persist the versioned consent scopes in their additive, unapplied migrations.
- Forge agent create/activation/delete paths invoke safe Benchline re-sync; the UI has distinct connected, partial, syncing, error, revocation-pending, revoked and unavailable states.
- Benchline partner provision/revoke/status serialize by idempotency key and persist responses; fair-use inspection now runs under a workspace transaction lock, counts queued/running/canceling batches workspace-wide, reads stored limits and excludes disabled mappings.

Final repair retest:

- `apps/api/src/billing.ts:113-116` derives the signed subscription object and ID before the Stripe event-ledger transaction, so duplicate delivery retains the subscription identity even when `stripe_events` returns no inserted row.
- `apps/api/src/billing.ts:135-145` uses that ID to locate the local subscription and `revocation_pending` connection, selects the pending workspace and calls `revokeBenchlineBundle`; another remote failure remains a 503 instead of being acknowledged.
- `apps/api/src/billing.test.ts:14-18` covers both the first-delivery workspace and same-event redelivery workspace selection helpers.
- Main's final Forge evidence is green: API 33 tests, web 11 tests, typecheck, production build and `git diff --check`.

Remaining product findings: none (`P0`: none, `P1`: none, `P2`: none, `P3`: none).

Final verdict: **ready** for the approved local implementation scope. Main's final Benchline evidence records `pnpm build && git diff --check` exit 0, including database build, web Vite build and API TypeScript compilation. The known web chunk warning above 500 kB is non-blocking and unchanged. All acceptance criteria and local repository gates pass.

Production release remains separately gated on applying the additive migrations on isolated database branches and completing sandbox Neon OAuth, Stripe webhook/Portal and signed Forge-to-Benchline HTTP smoke tests.

Next owner after verdict: Main for release-gate coordination; Tester has no remaining code finding.
