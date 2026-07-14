# Forge auth, billing and Benchline engineering plan

## Production incident follow-up — 2026-07-14

- `INC-AUTH-001` (`in_progress`): reproduce and isolate the production Google OAuth token rejection reported as `INVALID_NEON_SESSION` without logging credentials or raw tokens.
- `INC-AUTH-002` (`pending`): implement the smallest safe correction, add a regression test that distinguishes issuer/JWKS/audience/claim failures, and preserve fail-closed production auth.
- `INC-REL-001` (`pending`): run focused engineering checks, deploy through the existing GitHub/Vercel release path, and execute a real production login smoke.
- `INC-INT-001` (`pending`): independently reverify Stripe catalog/credentials/webhook/Checkout readiness and the signed Forge–Benchline provision/status/revoke path; report any residual production gate instead of treating partial wiring as complete.
- Rollback: revert only the incident commit and redeploy the previous known-good production deployment; do not re-enable legacy password auth.

Status: release in progress
Owner: Main
Product contract: `docs/product/auth-billing-benchline-brief.md`
Last updated: 2026-07-13

## Objective and outcome

Implement the smallest local vertical slice that lets a Forge guest preserve an agent draft through Google/Neon Auth, safely provision a Forge identity, subscribe to a server-owned Stripe package, consume trial/paid chat allowance under atomic hard limits, and explicitly link paid workspaces to Benchline through an authenticated S2S contract.

No live provider, database, deployment, commit or release mutation is authorized. Tester owns independent readiness.

## Observed architecture and constraints

- pnpm/TypeScript monorepo: Fastify API, React/Vite web, Drizzle/PostgreSQL package.
- Existing legacy email/password cookie sessions, guest draft persistence, workspace tenancy, agents, chat and evals must remain compatible.
- The API uses pooled `DATABASE_URL`; Drizzle migrations use `DIRECT_URL` when present.
- `jose` already exists; Stripe SDK/raw-body support must be added locally at the latest compatible release.
- Stripe redirects never grant entitlement. Only a verified, idempotently processed webhook updates the local snapshot.
- Neon email is display data. Provisioning keys identity by verified issuer + `sub`; automatic legacy email linking is deliberately forbidden in this slice.
- Benchline is a separate database, so linking is an idempotent state machine with retryable partial failure, not a distributed transaction.
- Preserve the unrelated user file `apps/web/src/pages/Landing 2.tsx`.

## Scope and non-goals

In scope: all requirements in the approved smallest vertical release slice, local migrations, API/UI/config/docs and implementation tests.

Non-goals: automatic overage/top-ups, silent SSO, live Stripe catalog or Neon setup, migration execution, direct Benchline pricing changes, destructive Benchline deletes, and automatic legacy-account linking by email.

## Minimal vertical slice

1. `completed` — schema/migration and provider-independent domain services for identity, plan snapshots, agent lineage usage, consent/link state and S2S signing.
2. `completed` — Neon bearer auth with legacy local cookie fallback and Google OAuth UI while preserving guest drafts.
3. `completed` — server catalog, Checkout, Portal and raw-body Stripe webhook.
4. `completed` — active/stored slots and atomic chat reservation/commit/release; excess Scale definitions are stored disabled.
5. `completed` — explicit consent, Benchline sync/status/revoke routes and Evals/Billing UI states.
6. `completed` — env/README, additive migration generation and engineering checks.

## Traceability map

| Contract IDs | Implementation files/surfaces | Migration/data constraints | Implementation evidence | Rollback/fallback |
| --- | --- | --- | --- | --- |
| FR-AUTH-001, FR-AUTH-004, AC-AUTH-002, EVT-AUTH-001 | `apps/web/src/pages/AuthPage.tsx`, `apps/web/src/auth.ts`, `apps/web/src/api.ts`, existing `agent-draft.ts` and tests | none | web auth/draft unit tests; web typecheck/build | omit Neon web env to retain legacy local form and cookie flow |
| FR-AUTH-002, FR-AUTH-003, NFR-SEC-001, AC-AUTH-001 | `apps/api/src/auth.ts`, `apps/api/src/identity.ts`, `apps/api/src/server.ts` | external identities unique on `(issuer, subject)`; provisioning transaction creates user/workspace/membership once; nullable password hash supports provider identity | JWT/JWKS and idempotent provisioning tests with local keys/fake DB boundary | omit Neon issuer/JWKS config; legacy cookie auth remains available outside production or when explicitly enabled |
| FR-PLAN-001..004, NFR-SEC-002..003, NFR-AUTHZ-001, NFR-IDEMP-001, NFR-PERF-001, AC-PLAN-001..002, EVT-BILL-001 | `apps/api/src/billing.ts`, `apps/api/src/server.ts`, `apps/web/src/pages/Billing.tsx`, `apps/web/src/api.ts` | unique workspace/customer/subscription snapshots; unique Stripe event id; provider update ordering timestamp | catalog/plan-key tests, webhook signature/idempotency tests, route tests | disable billing routes when config is absent; do not change existing entitlement; roll forward webhook snapshot |
| FR-AGENT-001, AC-AGENT-001 | `apps/api/src/entitlements.ts`, agent create/update routes, Agents/Billing UI | immutable agent lineage id; active-count checks in the same transaction/lock; Scale stores overflow disabled | plan matrix and activation-race tests | feature flag can return to existing behavior before migration rollout; migration is additive |
| FR-USAGE-001..005, AC-USAGE-001..003, EVT-USAGE-001 | `apps/api/src/entitlements.ts`, chat route, Chat/Agents/Billing usage UI | one usage row per lineage; unique reservation idempotency key; conditional atomic update for trial then paid bucket; period key unique per lineage; reservation states | 30/31, renewal, no-rollover, failure release/provider-start consume and concurrent-last-request tests | stop enforcement flag only before commercial release; reservation ledger remains auditable; additive tables can be left unused |
| FR-BENCH-001..008, NFR-SEC-004, NFR-AUTHZ-001, NFR-IDEMP-001, NFR-PRIV-001..002, AC-BENCH-001..005, AC-PRIV-001, EVT-BENCH-001 | `apps/api/src/benchline.ts`, `apps/api/src/s2s.ts`, API routes, `apps/web/src/pages/agent/Evals.tsx`, `apps/web/src/api.ts` | versioned consent with actor/scopes/revocation; unique workspace/agent mapping; link/sync state; stable external IDs | HMAC/replay tests, no-consent test, idempotent sync test, privacy allowlist contract test, terminal revocation test | omit Benchline URL/secret to show unavailable while Forge core continues; unlink/revoke stops sync and new bundled evals without deleting evidence |
| NFR-OBS-001 | safe structured event helper and route logs | optional append-only analytics rows only if existing logging cannot represent events | tests assert safe fields and absence of tokens/payload secrets | retain safe application logs; no prompt/token logging introduced |
| NFR-A11Y-001 and required UI states | Auth, Billing, Agents, Chat and Evals views using existing Forge tokens/components | none | typecheck/build plus manual browser matrix delegated to Tester | pages degrade to actionable unavailable/error states |

## Data and API contracts

- Auth: `Authorization: Bearer <Neon access JWT>` is verified against configured issuer/JWKS and audience. Legacy cookie session is consulted only when Neon is not configured, in non-production, or an explicit local fallback flag permits it.
- Catalog: browser sends only `solo | studio | scale`; server maps currency/price IDs. Solo=1 slot/1,500, Studio=3/4,500, Scale=10/15,000 and unlimited stored definitions.
- Subscription snapshot: plan, status, current-period bounds, cancel-at-period-end, grace boundary and provider ordering timestamp are local. Active/grace access derives locally; checkout return is informational.
- Usage: reserve before provider execution. Validation/pre-provider failure releases; provider-started failure commits. Trial is lifetime 30 per stable lineage, then 1,500 paid per active slot per Stripe billing period; no rollover or overage.
- S2S: signature covers method, path, timestamp, idempotency key and SHA-256 body hash. Requests outside configured skew or with replayed idempotency keys are rejected.
- Sync payload is an explicit allowlist of workspace/account/agent/twin/consent fields and cannot contain knowledge, conversations or model calls.

## Dependencies

- Add current Stripe Node SDK and Fastify raw-body support only to the API.
- Reuse `jose`, Fastify, Drizzle, zod and the existing web design system.
- Do not change the database driver or add queues/caches; PostgreSQL transactions/conditional updates are sufficient for the observed invariants.

## Security, privacy and observability

- Keep issuer/JWKS/audience, Stripe key/webhook secret/price IDs and Benchline HMAC secret server-side. Recommend a least-privilege restricted Stripe key.
- Verify Stripe against raw bytes before parsing. Reject arbitrary price IDs, stale S2S timestamps, mismatched body hashes and replayed idempotency keys.
- Never log bearer/cookie tokens, signed payloads, secrets, prompts, knowledge, conversations or raw model calls.
- Consent checkbox starts unchecked; owner role is required for billing/link mutations.
- Legal/retention wording remains an explicit production gate.

## Migration and rollout

- Generate additive Drizzle migrations; do not apply them. New columns/tables are nullable/defaulted for old application compatibility.
- Deployment order when later authorized: migrate on isolated Neon branch -> deploy API with provider config disabled -> configure Neon/Stripe/Benchline secrets -> enable features -> deploy web -> run reconciliation/smoke.
- Stop triggers: duplicate identity/snapshot rows, webhook verification failures, reservation imbalance, over-limit activation or S2S replay acceptance.
- Rollback: disable provider configs/routes and return to legacy local auth; keep additive audit/usage tables for roll-forward. Never roll back by deleting paid/consent/eval evidence.

## Production release — 2026-07-14

1. `in_progress` — release preflight: reconcile dirty state, accounts, Git remotes, Vercel targets, provider configuration names and rollback candidate.
2. `pending` — rehearse Forge and Benchline migrations on isolated Neon branches, then apply the exact migration chain to production with schema verification.
3. `pending` — configure Neon Auth/Google, Stripe live catalog/Portal/webhook and shared Forge–Benchline HMAC variables without exposing values.
4. `pending` — stage only intended artifacts, commit, push and verify GitHub CI/SHA.
5. `pending` — deploy Benchline API/web and Forge API/web in dependency order; verify deployment identities and production domains.
6. `pending` — run HTTP, auth redirect, billing catalog/webhook reachability and signed partner smoke tests; Tester owns final production verdict.

Rollback target: current production Git SHAs and Vercel deployments observed during preflight. Stop on migration failure, auth lockout, webhook signature failure, S2S mismatch or critical smoke regression.

## Verification strategy

- Targeted: API tests for auth, billing webhook/catalog, usage concurrency, S2S signature/privacy and Benchline orchestration; web tests for OAuth draft and UI state mapping.
- Repository: `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Database: inspect generated SQL only; no `db:migrate`.
- Browser/state/responsive/accessibility checks are engineering evidence only; Tester performs independent QA.

## Decisions, risks and deferred complexity

- D-001: do not automatically match a Neon identity to an existing password user by email. A future verified, reauthenticated account-link flow owns migration.
- D-002: hard limits use local PostgreSQL atomic state; no external usage meter or automatic overage.
- D-003: MVP downgrade is blocked/remediated rather than automatically disabling agents without owner confirmation.
- D-004: S2S is synchronous with persistent retryable state because cross-database idempotency is required but present volume does not justify a queue. Stripe redelivery retries a stable, persisted Benchline revocation until the remote side confirms it.
- Risk: provider configuration and real webhook/OAuth behavior remain unverified until authorized sandbox/live testing.
- Deferred: Stripe Tax/legal review, reconciliation job, automatic retry worker, advanced dunning UI and additional active-slot sales workflow.

## NetoLabs lifecycle hardening delta - 2026-07-14

Status: `in_progress_local`
Contract: `/Users/luizneto/Documents/Obsidian Vault/Repositories/netolabs/docs/product/netolabs-saas-billing-standard.md`

Implementation plan:

1. `pending` - reconcile `invoice.paid` and `invoice.payment_failed` through the canonical Stripe subscription, using the existing event receipt and provider-ordering fields so replay and stale delivery cannot duplicate or regress state.
2. `pending` - replace the cancel-only Portal session with the configured generic account Portal, while preserving owner authorization, stored Customer reuse and the Forge return URL.
3. `pending` - guard Checkout against an existing active/trialing/past-due/cancel-scheduled subscription and against concurrent/repeated creation attempts; browser input remains a plan key only.
4. `pending` - complete Billing UI states for pending, active renewal, scheduled cancellation, past-due recovery and canceled/resubscribe, preserving Forge tokens and IA.
5. `pending` - extend focused API/web tests, typecheck/build, scoped diff and secret scan.

Traceability: `AC-001..013`; provider readback `AC-014` remains a Tester/release gate.

Frontend contract: preserve Forge's operational design system with `variance 3`, `motion 2`, `density 6`; add semantic live status, keyboard-visible actions, responsive wrapping and no new visual dependency.

Migration/rollback: prefer the existing subscription snapshot/event receipt schema. If inspection proves a missing uniqueness invariant, use an additive generated migration but do not apply it. Rollback disables billing configuration and reverts scoped route/UI behavior without deleting snapshots or receipts.

## Exit criterion and next owner

Coder exits after implementation-level tests/typecheck/build are recorded here with residual risks. Tester then maps every AC to independent evidence and owns `ready | conditional | blocked`.

## Independent QA P1 billing ordering recovery - 2026-07-14

Status: `implemented_local_verification_partial`

1. `completed_local` - remove invoice-event-type status forcing so delayed `invoice.payment_failed` cannot replace a canonical active Stripe subscription with `past_due`, including when event timestamps share the same second.
2. `completed_local` - add deterministic paid/failed out-of-order and same-second regression coverage around the canonical snapshot boundary and serialize the existing subscription row before applying the tie-break.
3. `partial_timeout` - run bounded focused tests/typecheck plus scoped diff and credential-pattern scans; no provider, deploy, migration or Git remote operation.

Recovery evidence: the focused Vitest command timed out after 50 seconds with no test diagnostic. The fallback Forge esbuild check was unavailable because this workspace does not expose an esbuild binary. The scoped credential/`payment_method_types` scan completed without a finding; one Git diff invocation emitted a filesystem `mmap` timeout and is not counted as clean diff evidence.

P2 follow-up: webhook reconciliation now acquires the same workspace advisory lock used by Checkout from canonical subscription metadata before attempting the subscription-id row lock/upsert. This serializes the first webhook even when no indexed subscription row exists yet.

Rollback: revert only the scoped canonical snapshot and regression-test changes. Existing event receipts and subscription snapshots remain intact.

## Evidence log

- `packages/db/drizzle/0004_normal_misty_knight.sql` and `0005_cultured_quentin_quire.sql` were generated and inspected; both are additive and were not applied.
- `pnpm typecheck`: passed across Forge db/web/api.
- `pnpm test`: passed after the final revocation-redelivery repair: 33 API tests and 11 web tests.
- Targeted policy evidence covers the exact 30/31 boundary, paid 1,500 boundary including reservations, plan matrix, Scale inactive overflow, Neon claim requirements, Stripe server-owned keys/snapshots, HMAC tamper/stale rejection and Benchline payload privacy allowlist.
- `pnpm build`: passed across Forge db/web/api after the final repair; `git diff --check` also passed.
- Aquiles privacy scan passed across 108 Forge files with no findings.
- Provider-backed OAuth, Stripe test-mode webhooks/Portal and cross-repository HTTP were not executed because no provider configuration or remote mutation was authorized.
