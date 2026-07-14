# Forge auth, billing and Benchline bundle

Status: approved for local implementation
Owner: FDE -> Coder -> Tester -> Main
Run: `/Users/luizneto/Documents/Obsidian Vault/Memory/Runs-history/2026-07-13-1902-forge-auth-billing-benchline.md`
Last updated: 2026-07-13

## Decision supported

Define the smallest commercial and behavioral contract that lets a builder create an agent before paying, authenticate with Google through Neon Auth, subscribe through Stripe, consume a predictable request allowance, and explicitly link the workspace to Benchline for bundled evals.

Recommendation: **GO** with a fixed-price, hard-limit MVP. Do not add automatic overage or external usage billing until real request cost and conversion data justify it.

## Evidence and assumptions

- `E-001 observed`: Forge already has guest draft -> auth -> publish, workspace tenancy, agents, chat calls, evals and a `model_calls` ledger.
- `E-002 observed`: Forge currently uses first-party email/password sessions; Neon Auth is not wired.
- `E-003 observed`: Benchline already has workspaces, agents, Agent Twins, suites, findings, recommendations, API keys and its own direct-product billing plan.
- `E-004 user_stated`: plans must cover 1, 3 and unlimited agents, with 1,500 requests per included active agent and 30 free requests for testing.
- `E-005 user_stated`: a paid Forge workspace receives Benchline and free evals after explicit account-link consent.
- `E-006 source_grounded`: Neon Auth for React/Vite supports Google OAuth, exposes a JWT access token and stores auth state in the Neon database.
- `E-007 source_grounded`: Stripe subscriptions should use Checkout, signed webhooks as the entitlement source of truth and Customer Portal for self-service.
- `A-001 inferred`: one request means one accepted Forge chat execution against one agent. Prompt generation, knowledge ingestion, failed validation and Benchline evals do not consume this allowance.
- `A-002 inferred`: the 30 free requests are lifetime per agent and are consumed before paid monthly allowance.
- `A-003 unverified`: average production token cost per request. Prices are hypotheses until live cost distribution and conversion are measured.

## Product bet

- `BET-001`: For solo builders and small AI teams who need to build and prove an agent without stitching tools together, Forge will combine agent authoring, predictable monthly execution and one-click Benchline release evidence, reducing time from draft to evaluated agent.
- North-star: percentage of authenticated workspaces that publish an agent, use at least 10 trial requests and complete a Benchline eval within 14 days.
- Guardrails: gross margin by plan, request denial rate, link failure rate, eval cost per bundled workspace, webhook lag and involuntary churn.
- Falsification: change the package if fewer than 20% of workspaces that consume 10 trial requests start Checkout, or if P50 contribution margin falls below 70% for two monthly cohorts.

## Pricing hypothesis

| Plan | Monthly BRL | Monthly USD | Active agents included | Monthly requests | Benchline |
| --- | ---: | ---: | ---: | ---: | --- |
| Solo | R$149 | US$29 | 1 | 1,500 | bundled |
| Studio | R$349 | US$69 | 3 | 4,500 | bundled |
| Scale | R$899 | US$179 | 10 | 15,000 | bundled |

- Scale allows unlimited stored agent definitions, but only 10 active slots accrue 1,500 requests each. More active slots require sales contact. This avoids unbounded variable cost.
- No automatic overage in this release. At zero remaining requests, block new chat execution and offer upgrade or sales contact.
- Prices are tax-exclusive hypotheses. Stripe Tax configuration and legal/tax review are launch gates, not claims made by this implementation.
- Use Stripe Products/Prices for the three recurring packages. Stripe Entitlements may mirror coarse feature access, but Forge keeps the operational plan snapshot and counters locally for low-latency enforcement.

## Scope

### In scope

- Google sign-in with Neon Auth while preserving the guest draft path.
- Internal Forge user/workspace provisioning from a verified Neon identity.
- Fixed Stripe subscription Checkout, Customer Portal, signed/idempotent webhooks and plan snapshots.
- Agent-slot enforcement, lifetime 30-request trial and monthly per-agent counters.
- Explicit Benchline terms acceptance, link/unlink, initial sync and re-sync.
- Forge -> Benchline provisioning of workspace, agent and Agent Twin data.
- Benchline -> Forge status read for sync, latest eval summary, findings count and recommendations count.
- Revocation of the bundled entitlement after subscription termination.

### Non-goals

- Automatic overage, top-ups, prepaid credits or Metronome integration.
- Shared login or silent SSO between Forge and Benchline.
- Replacing Benchline direct-product pricing.
- Migrating historical Forge password accounts automatically without a verified identity match.
- Live Stripe catalog creation, live Neon Auth provisioning, production env changes, migrations, push or deploy.

## Functional requirements

- `FR-AUTH-001`: when Neon Auth is configured, the auth page offers Google sign-in and returns to the intended Forge route after success.
- `FR-AUTH-002`: the API accepts only verified Neon Auth JWTs from the configured issuer/JWKS and maps `sub` to one internal user.
- `FR-AUTH-003`: the first verified identity creates one Forge user, workspace and owner membership idempotently; an existing verified email may be linked only under the migration rule recorded by engineering.
- `FR-AUTH-004`: guest agent drafts survive the OAuth redirect and are published after authentication.
- `FR-PLAN-001`: Forge exposes Solo, Studio and Scale catalog metadata from server-controlled configuration. The browser never chooses arbitrary Stripe Price IDs.
- `FR-PLAN-002`: Checkout can start only for an authenticated workspace owner and one allowed plan key.
- `FR-PLAN-003`: Customer Portal can start only for a workspace with a stored Stripe customer.
- `FR-PLAN-004`: signed Stripe webhooks create or update the local subscription snapshot exactly once per event.
- `FR-AGENT-001`: trial and Solo can activate one agent, Studio three and Scale ten. Scale may store additional disabled agents.
- `FR-USAGE-001`: every new agent receives exactly 30 lifetime trial chat requests.
- `FR-USAGE-002`: an accepted chat reserves one request atomically before model execution. Success commits it. A failure before the provider is called releases it; provider-started work consumes it.
- `FR-USAGE-003`: paid allowance renews at the subscription billing period boundary and is capped at 1,500 requests per included active agent; unused allowance does not roll over.
- `FR-USAGE-004`: exhausted agents return `USAGE_EXHAUSTED` with trial, paid and renewal details; no provider call is made.
- `FR-USAGE-005`: concurrent requests cannot consume the same last request twice.
- `FR-BENCH-001`: only a workspace owner can open the link flow and accept the versioned Forge/Benchline data-sharing terms.
- `FR-BENCH-002`: consent records version, timestamp, actor, scopes and revocation state. A pre-checked box is forbidden.
- `FR-BENCH-003`: after consent, Forge idempotently provisions the Benchline workspace entitlement, agents and Agent Twins using stable Forge external IDs.
- `FR-BENCH-004`: agent create/update/delete events are re-synced. Delete disables the Benchline agent instead of destroying eval evidence.
- `FR-BENCH-005`: Forge can retrieve Benchline link health and latest eval summary/findings/recommendations for the mapped agent.
- `FR-BENCH-006`: an active paid Forge subscription grants `source=forge_bundle` entitlement in Benchline. Cancel-at-period-end remains active through `current_period_end`; terminal cancellation revokes new bundled eval execution without deleting evidence.
- `FR-BENCH-007`: bundled evals do not consume Forge chat allowance and do not consume Benchline direct-product credits.
- `FR-BENCH-008`: the initial fair-use policy is 5 suites or 40 cases per active agent per month, concurrency 1 per workspace, server configurable. The UI calls them included, not unlimited.

## Non-functional requirements

- `NFR-SEC-001`: Neon JWT validation pins issuer/JWKS/audience when available and rejects missing, expired or malformed tokens.
- `NFR-SEC-002`: Stripe secrets and Benchline integration secrets remain server-only. Prefer a restricted Stripe key with least privilege.
- `NFR-SEC-003`: Stripe webhooks verify the signature against the raw body before parsing.
- `NFR-SEC-004`: Forge/Benchline service calls use HMAC signing with timestamp, body hash and idempotency key; reject replays and stale timestamps.
- `NFR-AUTHZ-001`: billing, consent and link mutations require owner role; agent and usage reads remain workspace scoped.
- `NFR-IDEMP-001`: identity provisioning, webhook processing, period grants and agent sync have database uniqueness constraints.
- `NFR-PRIV-001`: default sync includes account email/name, workspace identity, agent name/description/model/instructions/guardrails/prompt version and consent metadata. Knowledge documents, conversations and raw model calls are excluded.
- `NFR-PRIV-002`: unlink stops future synchronization and new bundled evals. Existing evaluation evidence follows Benchline retention/deletion controls disclosed in the terms.
- `NFR-OBS-001`: logs use safe IDs, event type, attempt, latency and sanitized error code. Never log prompts, OAuth tokens, Stripe payload secrets or HMAC secrets.
- `NFR-A11Y-001`: Google sign-in, pricing actions, consent and integration states are keyboard operable, visibly focused and not color-only.
- `NFR-PERF-001`: plan and usage enforcement occurs locally and does not require a synchronous Stripe request.

## Acceptance criteria

- `AC-AUTH-001`: with a valid Neon JWT, first sign-in creates one internal user/workspace; replaying sign-in creates no duplicate. Invalid issuer/signature receives 401.
- `AC-AUTH-002`: a guest draft remains available after Google callback and can be published.
- `AC-PLAN-001`: Checkout accepts only `solo|studio|scale`, uses the server-mapped Price ID and grants nothing until a verified webhook activates the subscription.
- `AC-PLAN-002`: replaying a signed subscription event changes entitlement once; an unsigned event changes nothing.
- `AC-AGENT-001`: Solo rejects activation of a second agent, Studio accepts three and rejects the fourth, Scale stores an eleventh as disabled and offers contact.
- `AC-USAGE-001`: a new agent completes 30 chat requests without payment; request 31 is blocked before provider execution.
- `AC-USAGE-002`: a paid Solo agent receives up to 1,500 requests in the billing period after trial, does not roll unused requests forward and renews exactly once.
- `AC-USAGE-003`: two concurrent attempts against one remaining request produce one reservation and one controlled denial.
- `AC-BENCH-001`: without checked consent, no Benchline request or consent record is created.
- `AC-BENCH-002`: accepting terms provisions each current agent/twin once and returns mapped Benchline IDs; retry is idempotent.
- `AC-BENCH-003`: Forge displays connected, syncing, error, revoked and unavailable states plus a safe retry.
- `AC-BENCH-004`: latest Benchline eval summary/findings/recommendations appear in Forge without exposing Benchline credentials to the browser.
- `AC-BENCH-005`: cancel-at-period-end preserves access until the boundary; terminal cancellation blocks new bundled evals and keeps historical evidence readable.
- `AC-PRIV-001`: an integration contract test proves knowledge, conversations and model-call bodies are absent from the sync payload.

## Analytics and observability

- `EVT-AUTH-001`: `auth_google_started`, `auth_google_succeeded`, `auth_google_failed` with provider/error class only.
- `EVT-BILL-001`: `checkout_started`, `checkout_returned`, `subscription_activated`, `subscription_changed`, `subscription_ended`.
- `EVT-USAGE-001`: `trial_request_consumed`, `paid_request_consumed`, `usage_exhausted` with plan and remaining buckets.
- `EVT-BENCH-001`: `benchline_consent_accepted`, `benchline_linked`, `benchline_sync_failed`, `benchline_unlinked`, `benchline_eval_opened`.

## Primary journeys and states

1. Guest drafts an agent -> chooses publish -> Google OAuth -> Forge provisions identity/workspace -> draft publishes -> 30-request trial begins.
2. Owner opens Billing -> selects a plan -> Stripe Checkout -> webhook activates plan -> local counters and active slots update.
3. Paid owner opens Evals -> reviews terms/scopes -> checks consent -> links Benchline -> agents sync -> status and latest evidence appear -> deep link opens Benchline for execution/details.
4. Subscription ends -> webhook updates local state -> Forge sends/reconciles revocation -> new bundled evals stop, history remains readable.

Required UI states: loading, unauthenticated, trial active, trial exhausted, checkout pending, active, past due/grace, canceled at period end, canceled, consent required, linking, connected, partial sync, retryable error, revoked and integration unavailable.

## Edge rules

- A past-due subscription receives a configurable 3-day grace period; no new monthly grant occurs until paid. After grace, paid requests and new bundled evals stop.
- Upgrade applies when the verified Stripe subscription update is received. Downgrade applies at the next period. Excess active agents become disabled oldest-last-used first only after owner confirmation; the MVP may instead block downgrade in Portal and require in-app remediation.
- Trial cannot be reset by deleting/recreating an agent with the same stable lineage. Engineering must persist a non-reusable agent entitlement identity.
- Email is display/contact data, not the primary identity key. Neon `sub` is the external identity key.
- Benchline remains unavailable without server configuration; Forge core authoring and chat continue normally.

## Smallest vertical release slice

1. Neon Google sign-in and internal identity provisioning with legacy local fallback for tests/dev.
2. Server catalog, Checkout/Portal endpoints, signed webhooks and local subscription snapshot.
3. Agent limits plus atomic trial/paid usage enforcement on chat only.
4. Explicit Benchline consent, HMAC provision/status contract and Forge Evals integration panel.
5. Benchline partner endpoints for idempotent workspace/agent/twin upsert, bundled entitlement and status summary.

## Risks and open decisions

- `R-001 commercial`: pricing is unvalidated. Owner: Product. Mitigation: instrument conversion and contribution margin, review after 20 paid workspaces or 30 days.
- `R-002 cost`: Scale still has variable model and eval cost. Owner: Product/Engineering. Mitigation: active slots, hard request cap, eval fair use and no overage.
- `R-003 auth`: Neon Auth is beta and production configuration is external. Owner: Engineering. Mitigation: verified JWT boundary, environment fallback and branch-based auth testing.
- `R-004 identity`: matching legacy users by email can enable takeover if handled incorrectly. Owner: Engineering. Mitigation: require verified Neon email and explicit migration/link policy; never rely on unverified email.
- `R-005 integration`: two databases cannot share a transaction. Owner: Engineering. Mitigation: idempotent state machine, retries, reconciliation status and no destructive remote delete.
- `R-006 legal/privacy`: terms, retention and bundled-eval wording need owner/legal review before production. Owner: Luiz/Product.

## Exit criterion and next owner

Coder may start when this document is the implementation source of truth. Coder must create `docs/engineering/auth-billing-benchline-plan.md`, map slices to the IDs above, preserve unrelated dirty files and implement no live provider mutation.
