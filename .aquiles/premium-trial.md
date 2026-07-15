# Automatic first-plan trial delta

Run: `forge-automatic-first-plan-trial-2026-07-15`
Request class: `feature`
Phase ceiling: `VERIFY`
Status: `coder_verified`

## Decision and evidence

- `E-TRIAL-001` (`user_stated`): every new user must automatically receive the first available plan for 7 days without a credit card; afterward they must subscribe and add a payment method.
- `E-TRIAL-002` (`observed`): Forge has two initial workspace paths: password registration and first verified Neon identity provisioning.
- `E-TRIAL-003` (`observed`): `publicCatalog()` defines the commercial order as Solo, Studio, Scale; `workspace_subscriptions` already persists plan, status and trial boundaries.
- `D-TRIAL-001`: use `publicCatalog()[0]` as the deterministic trial plan rather than hard-coding a Stripe object. It is currently Solo.
- `D-TRIAL-002`: create the entitlement in the same database transaction as the user's initial workspace. Do not backfill existing users or grant trials to later workspaces.
- `D-TRIAL-003`: compute the exclusive end boundary as start + `7 * 86_400_000` milliseconds. At the exact end instant, access is expired.
- `D-TRIAL-004`: no Stripe customer, subscription, Checkout session or payment method is created by trial provisioning. Checkout always collects payment and creates a paid subscription without an additional Stripe trial.
- `D-TRIAL-005`: the trial carries the first plan's complete entitlements and 1,500-request allowance, superseding the previous 50-run Checkout trial.

## Functional and acceptance contract

- `FR-TRIAL-001`: both account provisioning paths MUST atomically persist plan, `trialing` status, start and exact seven-day end.
- `FR-TRIAL-002`: replayed/concurrent identity provisioning MUST return the existing user/workspace and MUST NOT create a second trial.
- `FR-TRIAL-003`: active trial access MUST match the first public commercial plan, including agent capacity, execution allowance and Benchline inclusion.
- `FR-TRIAL-004`: at expiry, product writes and executions MUST return `402 SUBSCRIPTION_REQUIRED` until a verified paid subscription is active. Read-only history and safe disable, unpublish, delete and unlink actions remain available.
- `FR-TRIAL-005`: Billing MUST explain automatic no-card activation, the exact expiry state and the required paid Checkout. It MUST NOT promise automatic charging at trial end.
- `FR-TRIAL-006`: Checkout MUST collect a payment method and MUST NOT set Stripe trial parameters.

- `AC-TRIAL-001`: the persisted end is exactly 604,800,000 ms after start and the plan is the first `publicCatalog()` entry.
- `AC-TRIAL-002`: trial access is valid one millisecond before end and denied at the end boundary.
- `AC-TRIAL-003`: the first 1,500 Solo reservations are admitted atomically across the workspace and the next is denied before a provider call.
- `AC-TRIAL-004`: expired creation, activation, publication, prompt/knowledge/eval execution, qualification/calendar writes and Benchline sync are server-denied; historical reads and risk-reducing deletes remain available.
- `AC-TRIAL-005`: Checkout options contain payment collection but no `trial_period_days` or trial settings.
- `AC-TRIAL-006`: existing users/workspaces receive no mutation from this release.

## Security, migration and rollback

- Registration and external identity provisioning serialize on advisory locks; identity replay is checked after lock acquisition, and normalized email ownership is separately serialized.
- Authorization and expiry are enforced at the API/database boundary; browser state is informational only.
- Payment details remain Stripe-hosted. Trial provisioning stores no payment/provider identifier.
- No schema migration is required because migration `0009` already introduced nullable trial timestamps and the subscription row supports the local entitlement.
- Rollback is code-only. Existing automatic-trial rows remain compatible with the previous schema; reverting runtime behavior would require an explicit product decision because deleting trial rows would remove user entitlement data.

## Verification gate

Required evidence: targeted plan/entitlement/billing/UI tests, full typecheck, full test suite, production build, diff check, privacy scan and independent TESTER review. No provider, production database, Git or deployment mutation is authorized by this run.

## Coder evidence

- `V-TRIAL-001`: `pnpm typecheck` passed for database, web and API workspaces.
- `V-TRIAL-002`: `pnpm test` passed 90/90 tests (64 API, 26 web).
- `V-TRIAL-003`: `pnpm build` passed all production builds.
- `V-TRIAL-004`: isolated PGlite/PostgreSQL migration application and HTTP registration proved a persisted Solo `trialing` row, exact 604,800,000 ms duration, 1,500 allowance, and null Stripe customer/subscription fields.
- `V-TRIAL-005`: the same isolated HTTP path, after moving the end to the exact boundary, returned `trial_expired`, denied prompt and agent writes with `402 SUBSCRIPTION_REQUIRED`, preserved agent history and allowed safe deactivation.
- `V-TRIAL-006`: `pnpm audit:prod` reported no known production vulnerabilities.
- `V-TRIAL-007`: Aquiles privacy scan checked 1,245 files with zero findings.
- `V-TRIAL-008`: `git diff --check` passed.

Coder status is `success`; this is not independent QA. Next owner: `TESTER`.
