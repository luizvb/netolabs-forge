# Premium trial billing delta

Run: `forge-premium-trial-2026-07-15`
Request class: `feature`
Phase ceiling: `VERIFY`
Status: `verified_local`

## Decision and evidence

- `E-TRIAL-001` (`user_stated`): every customer should receive 7 days of “premium” with 50 runs and then be charged.
- `E-TRIAL-002` (`observed`): Forge already uses Stripe Checkout, verified subscription webhooks, paid-plan entitlements and atomic request reservations.
- `D-TRIAL-001`: automatic charging requires a payment method, so the trial begins only after the owner selects Solo, Studio or Scale and completes Checkout.
- `D-TRIAL-002`: the 50 runs are shared across the workspace, not multiplied per agent. During `trialing`, monthly paid allowance is not consumed.
- `D-TRIAL-003`: the Premium trial is granted once per workspace. A later resubscription is charged without another trial.
- `D-TRIAL-004`: legacy free-run counters are reset once when the first verified Stripe trial begins so existing customers receive the full 50-run promise; the persisted trial marker prevents later resets.

## Functional and acceptance contract

- `FR-TRIAL-001`: Checkout MUST collect a payment method and create an eligible subscription with a 7-day trial.
- `FR-TRIAL-002`: a verified `trialing` subscription MUST unlock the selected plan's feature and agent limits.
- `FR-TRIAL-003`: trial usage MUST stop atomically at 50 committed or reserved runs aggregated across all workspace agent lineages.
- `FR-TRIAL-004`: while `trialing`, Forge MUST NOT consume the selected plan's monthly allowance after the 50th run.
- `FR-TRIAL-005`: Forge MUST persist Stripe trial dates and MUST NOT grant a second trial after cancellation or resubscription.
- `FR-TRIAL-006`: the billing UI MUST disclose the 7-day duration, 50-run cap, payment-method requirement, selected plan price and automatic charge unless canceled.

- `AC-TRIAL-001`: first eligible Checkout sends `payment_method_collection=always`, `trial_period_days=7` and cancel-on-missing-payment behavior.
- `AC-TRIAL-002`: a workspace can reserve runs 1 through 50 across any agents; run 51 is rejected before a provider call while the subscription is `trialing`.
- `AC-TRIAL-003`: after Stripe changes the subscription to `active`, new runs use the monthly paid bucket.
- `AC-TRIAL-004`: a workspace with a persisted `trial_started_at` receives no trial parameters on a later Checkout.
- `AC-TRIAL-005`: billing status and UI expose the aggregate trial use and trial end date without exposing payment details.
- `AC-TRIAL-006`: a workspace with legacy free usage starts its first Stripe trial at 0/50, while webhook retries and later subscriptions preserve its accumulated trial usage.

## Security, migration and rollback

- Payment details remain hosted and stored by Stripe; Forge persists only customer/subscription identifiers and trial timestamps.
- Trial entitlement still changes only from signed, idempotent Stripe webhooks; the Checkout redirect grants no access.
- Migration is additive: `trial_started_at` and `trial_ends_at` are nullable. Existing subscriptions remain compatible.
- Rollback is code-first: revert the feature code while leaving the nullable columns in place. Existing Stripe subscriptions continue under their provider-side billing schedule.

## Verification gate

Required evidence: targeted plan/entitlement/billing/UI tests, full typecheck, full test suite, build, migration review, diff check and Aquiles privacy scan. Provider-backed automatic charging remains a Stripe test-mode/production smoke gate and is not inferred from mocks.

Local result: 87 tests, typecheck, production build, isolated migration application, desktop/390 px Billing QA, diff check and privacy scan passed. QA remains `conditional` until a Stripe test-mode trial transitions to `active` and produces the expected first invoice without a second trial.
