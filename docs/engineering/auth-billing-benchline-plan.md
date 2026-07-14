# Forge auth, billing and Benchline engineering plan

Status: auth incident candidate complete; pending independent QA
Owner: Coder
Product contract: `docs/product/auth-billing-benchline-brief.md`
Last updated: 2026-07-14

## Objective and outcome

Implement the smallest local vertical slice that lets a Forge guest preserve an agent draft through Google/Neon Auth, safely provision a Forge identity, subscribe to a server-owned Stripe package, consume trial/paid chat allowance under atomic hard limits, and explicitly link paid workspaces to Benchline through an authenticated S2S contract.

No live provider, database, deployment, commit or release mutation is authorized. Tester owns independent readiness.

## OAuth callback incident — 2026-07-14

Production returns `INVALID_NEON_SESSION` after Google redirects to `/auth` because the dependency-free browser client calls `/token` without first consuming the callback's `neon_auth_session_verifier`. The official Neon Auth flow exchanges that verifier through `/get-session`, then obtains the access token. Reintroducing `@neondatabase/auth@0.4.2-beta` is out of scope because its locked `better-auth@1.4.18` dependency has a critical advisory.

### Incident acceptance and invariants

- `AC-AUTH-005`: when the callback URL contains one non-empty `neon_auth_session_verifier`, the client calls `/get-session?neon_auth_session_verifier=...` exactly once before `/token`.
- `AC-AUTH-006`: the verifier is removed from the current URL with `history.replaceState`, preserving all other query parameters and the hash, only after a successful exchange and without navigation.
- `AC-AUTH-007`: a failed exchange does not call `/token`, does not remove the verifier, does not populate the token cache and does not authenticate the Forge API request.
- `AC-AUTH-008`: an absent verifier keeps the normal existing-session `/token` flow; an invalid or absent token payload remains unauthenticated.
- `AC-AUTH-009`: sign-out clears both access-token cache and callback-exchange state before contacting Neon; a subsequent callback can be exchanged normally.

### Minimal incident slice

1. `completed` — add a dependency-free, single-flight callback exchange in `apps/web/src/auth-client.ts` before token retrieval.
2. `completed` — add focused regressions for ordering, exactly-once behavior, URL preservation/cleanup, failure semantics, invalid token payload and sign-out/cache reset.
3. `completed` — run targeted web tests, full typecheck/test/build, production dependency audit, diff check and secret scan.
4. `completed` — prepare the isolated candidate for a local commit and immutable-SHA handoff to Tester; no push/deploy/provider mutation.

### Incident decisions and rollback

- D-024: preserve the small HTTP client and add no dependency; use the already configured Neon Auth origin with `credentials: include`.
- D-025: serialize concurrent token callers behind one callback exchange promise so the one-time verifier cannot be raced or replayed.
- D-026: retain the verifier after a failed exchange for diagnostics, but cache the rejection so the one-time verifier is not replayed within the same page lifecycle; a reload or new sign-in starts a fresh exchange.
- Rollback: revert the isolated local commit. No schema, environment, Stripe, Benchline, Neon or deployment state changes are part of this slice.

### Incident engineering evidence

- Focused web run: `pnpm --filter @forge/web test -- src/auth-client.test.ts src/auth-flow.test.ts` passed 4 files / 16 tests, including 4 new callback/cache regressions.
- `pnpm typecheck` passed for DB, web and API.
- The first clean-clone `pnpm test` exposed the repository prerequisite that API tests resolve built `@forge/db`; after `pnpm --filter @forge/db build`, the unchanged full command passed 12 API files / 37 tests and 4 web files / 16 tests.
- `pnpm build` passed for DB, web and API; the Vite production bundle completed successfully.
- `pnpm audit --prod` returned `No known vulnerabilities found`; no Neon Auth SDK or other dependency was added and the lockfile was unchanged.
- `git diff --check` passed. A focused secret scan over the changed files found no private keys, Stripe secrets/webhook secrets or credential-bearing PostgreSQL URLs.
- Residual risk: provider-backed Google/Neon OAuth was not exercised from this local candidate because deploy and remote provider mutation are outside authorization. Tester owns independent validation; a later authorized preview/production smoke must confirm the live cookie/CORS exchange.

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

## Exit criterion and next owner

Coder exits after implementation-level tests/typecheck/build are recorded here with residual risks. Tester then maps every AC to independent evidence and owns `ready | conditional | blocked`.

## Evidence log

- `packages/db/drizzle/0004_normal_misty_knight.sql` and `0005_cultured_quentin_quire.sql` were generated and inspected; both are additive and were not applied.
- `pnpm typecheck`: passed across Forge db/web/api.
- `pnpm test`: passed after the final revocation-redelivery repair: 33 API tests and 11 web tests.
- Targeted policy evidence covers the exact 30/31 boundary, paid 1,500 boundary including reservations, plan matrix, Scale inactive overflow, Neon claim requirements, Stripe server-owned keys/snapshots, HMAC tamper/stale rejection and Benchline payload privacy allowlist.
- `pnpm build`: passed across Forge db/web/api after the final repair; `git diff --check` also passed.
- Aquiles privacy scan passed across 108 Forge files with no findings.
- Provider-backed OAuth, Stripe test-mode webhooks/Portal and cross-repository HTTP were not executed because no provider configuration or remote mutation was authorized.
