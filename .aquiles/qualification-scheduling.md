# Qualification + Scheduling Kit contract

Status: `approved_for_local_build`
Owner sequence: PRODUCT -> FDE -> DESIGN -> CODER -> TESTER
Date: 2026-07-15

## Product decision

### Evidence and bet

- `E-QS-001` (`user_stated`): high-ticket service businesses are the approved initial segment.
- `E-QS-002` (`observed`): Forge already proves prompt, knowledge, evaluation, public-link and observability primitives.
- `E-QS-003` (`observed`): a complete lead journey still lacks persistent qualification, deterministic actions and scheduling.
- `BET-QS-001`: For operators of high-ticket services who lose leads during qualification and scheduling, build an installable agent that captures fit, offers valid availability and confirms a booking in one public journey, unlike a generic chatbot, because Forge couples a versioned operating contract with deterministic actions and eval evidence.

### ICP and exclusions

- Included: real estate, solar energy, insurance, consulting, technical assistance and B2B services that use a first meeting or diagnostic as the conversion event.
- Excluded from this release: healthcare diagnosis, regulated financial advice, autonomous contract acceptance, payment collection, restaurants and high-volume support desks.

### Value and measurement

- Primary outcome: `booking_confirmed` from a lead that completed the configured qualification contract.
- North-star: verified qualified bookings per active agent per week.
- Leading signals: started sessions, completed profiles, qualified profiles and available-slot views.
- Guardrails: zero cross-tenant access, zero duplicate bookings, zero PII sent to an LLM, explicit consent before collection and recoverable slot conflicts.
- Falsification after launch: change the bet if fewer than 3 of 5 design partners produce a verified booking within 7 days of configuration or if operators will not pay the initial service hypothesis.

### Scope ceiling and non-goals

- One canonical Kit (`qualification-scheduling`, version 1).
- One deterministic scorecard shared across supported service segments.
- One internal scheduling provider using `America/Sao_Paulo` availability.
- Public web channel plus authenticated operator panel.
- No external calendar, CRM, WhatsApp, payment, assignment routing, cancellation or rescheduling in this release.

## FDE contract

### Actors and states

- Operator: installs and configures the Kit, publishes the agent and inspects outcomes.
- Lead: consents, answers one question at a time, receives a fit result, selects an available slot and receives confirmation.
- Session states: `collecting -> qualified | disqualified -> booked`.
- Booking state: `confirmed`.

### Functional requirements

- `FR-QS-001`: expose a versioned catalog entry with outcome, intended segment, required capabilities and setup expectations.
- `FR-QS-002`: install the Kit as a tenant-owned Forge agent with validated configuration, prompt, guardrails and regression scenarios.
- `FR-QS-003`: start a public session only for an active, published Kit agent and only after consent.
- `FR-QS-004`: collect name, contact, company, need, service-area fit, decision role, timeline and investment readiness one field at a time.
- `FR-QS-005`: score only structured answers; require service-area fit and the configured minimum score.
- `FR-QS-006`: persist session answers and return an idempotent result for retried public requests.
- `FR-QS-007`: generate bookable slots from validated weekly availability, duration, interval and horizon while excluding existing confirmed bookings.
- `FR-QS-008`: confirm a booking only for a currently available slot and prevent two sessions from taking the same agent/start time.
- `FR-QS-009`: expose tenant-isolated metrics, recent leads and bookings in the operator panel.
- `FR-QS-010`: expose no private prompt, thresholds, other lead data or workspace identifiers through public endpoints.

### Acceptance criteria

- `AC-QS-001`: an authenticated operator can install the Kit and receives an agent tagged with template key/version and a complete configuration.
- `AC-QS-002`: installation creates the approved safety/behavior eval pack and respects existing plan capacity.
- `AC-QS-003`: an unpublished, disabled or non-Kit public ID cannot start a qualification session.
- `AC-QS-004`: the public journey resumes from server state and rejects an answer for a stale question.
- `AC-QS-005`: exact request retries return the stored response without advancing twice.
- `AC-QS-006`: out-of-area leads are disqualified regardless of score; in-area leads require the minimum score.
- `AC-QS-007`: qualified leads receive future slots in São Paulo time; occupied starts are absent.
- `AC-QS-008`: booking accepts only a returned valid slot; a racing duplicate receives a conflict and fresh availability.
- `AC-QS-009`: confirmed bookings update the session outcome and appear in tenant-owned operations metrics.
- `AC-QS-010`: the public UI supports loading, consent, question, validation error, qualified/slots, disqualified, conflict and booking-success states at 390 px and desktop widths.
- `AC-QS-011`: no qualification contact value is placed in a model call or public agent metadata.
- `AC-QS-012`: targeted tests, full tests, typecheck, build, diff check and privacy scan pass.

### Data and privacy

- Contact fields are operational PII (`name`, `contact`, `company`) and remain tenant-isolated server data.
- Public session identifiers are random UUIDs and do not reveal tenant or sequence.
- The deterministic engine does not call a model provider.
- Public answers are bounded to 2,000 characters; a session cannot advance beyond the fixed question set.
- Deletion/retention controls are required before claiming a full LGPD lifecycle; this release implements minimization and isolation, not a legal compliance claim.

### Analytics contract

- `qualification_session_started`
- `qualification_profile_completed`
- `qualification_result` with `qualified|disqualified`
- `availability_presented`
- `booking_confirmed`
- `booking_conflict`

## Design contract

### Design read

Product UI for B2B operators and prospective high-ticket leads, using Forge's existing restrained, trust-first visual language. `DESIGN_VARIANCE=4`, `MOTION_INTENSITY=2`, `VISUAL_DENSITY=6`.

### Information architecture and screens

- Authenticated `/kits`: catalog, one available Kit, later Kits labeled as roadmap rather than available product.
- Authenticated `/kits/qualification-scheduling`: configuration form with outcome explanation and scheduling preview.
- Agent detail `Operação` tab: conversion metrics, setup summary, recent leads and confirmed bookings.
- Public `/a/:publicId`: consent and qualification conversation; choice controls; slot picker; confirmation or safe terminal state.

### State matrix

- Catalog: loading, available, install action, capacity error.
- Setup: pristine, validation error, submitting, capacity/billing error, success navigation.
- Operations: loading, zero sessions, active sessions, bookings, error.
- Public: loading, unavailable, consent, starting, asking, invalid answer, qualified, disqualified, slot conflict, booked, general error.

### Accessibility and responsive behavior

- Existing Manrope/Phosphor/Forge palette and radius system remain canonical.
- Every input has a visible label; choices are native buttons with visible focus; status is communicated in text, not color alone.
- Public flow uses a single-column reading order under 768 px; operator metrics and setup columns collapse without horizontal overflow.
- No decorative motion. State changes announce through visible text and preserve keyboard focus near the next action.
- Target WCAG 2.2 AA contrast and 44 px primary touch targets.

## Engineering plan

### Architecture decisions

- `D-QS-001`: template definition lives in versioned application code; installation identity/config live on the agent row. This avoids a mutable global seed while the first catalog entry is proven.
- `D-QS-002`: `qualificationSessions`, `qualificationEvents` and `scheduledBookings` provide tenant-owned state, idempotency and outcome evidence.
- `D-QS-003`: pure domain functions own questions, scoring and slot generation; HTTP handlers own authorization, persistence and concurrency.
- `D-QS-004`: a unique `(agent_id, start_at)` booking index is the final concurrency guard.
- `D-QS-005`: internal scheduling is the first adapter for the provider-neutral `listAvailability/createBooking` contract.

### Implementation slices

1. `AC-QS-001..009`: schema, template domain, qualification state machine, slot calculation and tests.
2. `AC-QS-001..009`: authenticated catalog/install/operations and public session/booking APIs.
3. `AC-QS-010`: Kit catalog, setup, operations tab and public lead experience.
4. `AC-QS-011..012`: privacy review, regression suite, browser/responsive QA and verification artifacts.

### Migration and rollback

- Add nullable template fields to `agents` so existing agents remain compatible.
- Add new tables/indexes only; no existing data rewrite.
- Code rollback can ignore additive fields/tables. Database rollback is optional after code rollback because additive objects do not change legacy behavior.

### Verification

- Pure unit tests for scoring, question progression, slot boundaries and occupied-slot filtering.
- API typecheck plus existing entitlement/public-agent regressions.
- Web unit tests for install payload helpers and public state helpers where useful.
- Full `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`, Aquiles privacy scan.
- Local database/API/browser critical path at desktop and 390 px when the local PostgreSQL harness is available.
