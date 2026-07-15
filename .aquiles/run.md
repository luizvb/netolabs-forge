# Aquiles run: Forge multi-provider agents

## Control metadata

| Field | Value |
| --- | --- |
| Run ID | `forge-model-runtime-2026-07-15` |
| Request class | `feature` |
| Started | 2026-07-15T13:30:00-03:00 |
| Last updated | 2026-07-15T13:47:25-03:00 |
| Status | `complete` |
| Phase ceiling | `VERIFY` |
| Current gate | `VERIFY_PASSED` |
| Workspace | `/Users/luizneto/aquiles/netolabs-forge` |
| Repository / branch | `luizvb/netolabs-forge` / `main` |
| Source commit | `e887f51959a1bbf85714346dbe7094bae1be8acf` plus local feature diff |

## Outcome and boundaries

- User-visible outcome: create Gemini or GPT agents through OpenRouter, select reasoning effort, and publish/revoke a public test URL.
- Deliverable: local implementation, additive database migration, tests, build, rendered-browser QA, and configuration documentation.
- Explicit exclusions: no commit, push, Vercel deploy, database migration application, environment mutation, DNS, or production verification without explicit authorization.
- Privacy boundary: public endpoints expose only public ID, name, description, model label, reasoning label, and the chat response. Prompts, knowledge, workspace identity, and credentials remain server-side.

## Success contract

| ID | Observable proof | Status |
| --- | --- | --- |
| AC-001 | `OPENROUTER_API_KEY` is accepted for qualified Gemini/GPT models and legacy Gemini slugs when Google is absent | `passed` |
| AC-002 | Agent creation persists model and `none/minimal/low/medium/high` reasoning effort | `passed` |
| AC-003 | Prompt supervisor, chat, eval candidate, judge, and prompt review share the multi-provider runtime | `passed` |
| AC-004 | Owner can publish/revoke a non-enumerable `/a/<uuid>` URL; disabling the agent also revokes it | `passed` |
| AC-005 | Public chat consumes the agent allowance and does not expose private agent fields | `passed` |
| AC-006 | Desktop and 390 px mobile layouts have no horizontal overflow | `passed` |

## Authorization and access

| Capability | State | Evidence |
| --- | --- | --- |
| Local edits | `authorized` | User requested product changes; all mutations remain in the target workspace |
| Commit / push | `not_authorized` | Not requested |
| GitHub access | `available` | Preflight observed authenticated account `luizvb` and origin remote |
| Preview / production deploy | `not_authorized` | User asked for product capability, not an immediate deployment |
| Vercel access | `available_unlinked` | Preflight observed account `luizvb`; workspace has no local project link |
| Environment / database mutation | `not_authorized` | No production credentials or migration were changed/applied |

## Evidence and decisions

| ID | Class | Claim / decision | Source |
| --- | --- | --- | --- |
| E-001 | `observed` | Existing runtime rejected all calls before Google ADK execution when Google credentials were absent | `apps/api/src/adk.ts` before this diff |
| E-002 | `source_grounded` | OpenRouter supports Chat Completions-compatible requests and unified `reasoning.effort` including `none`, `low`, `medium`, and `high` | OpenRouter official API and reasoning documentation, accessed 2026-07-15 |
| D-001 | `decision` | Keep direct Google ADK for unqualified legacy models when Google credentials exist; use OpenRouter for qualified slugs and as fallback for legacy Gemini | `apps/api/src/adk.ts` |
| D-002 | `decision` | Public links are UUID-based, off by default, reversible, and automatically revoked on disable | `packages/db/src/schema.ts`, `apps/api/src/server.ts` |
| R-001 | `accepted_risk` | A shared public link can be abused to consume the agent allowance | Mitigated by non-enumerable IDs, 4,000-character input limit, idempotency keys, existing server-owned quota, and immediate revocation |
| R-002 | `open` | Provider-backed inference was not exercised locally because no credential value was inspected or transmitted during QA | Requires preview smoke after environment configuration |

## Verification ledger

| ID | Method | Result |
| --- | --- | --- |
| V-001 | `pnpm typecheck` | passed for web, db, and API |
| V-002 | `pnpm --filter @forge/db build && pnpm test` | 70/70 tests passed; 5 web files and 12 API files |
| V-003 | `pnpm build` | production builds passed for web, db, and API |
| V-004 | Browser QA at 1280 px | GPT-5.4 and high reasoning selection verified; `scrollWidth === clientWidth` |
| V-005 | Browser QA at 390 x 844 | model controls collapsed to one column; `scrollWidth === clientWidth` |
| V-006 | Public invalid/revoked URL browser state | safe “Agente indisponível” state rendered without internal details |
| V-007 | `git diff --check` | passed |
| V-008 | Aquiles privacy scan, 113 files | passed with zero findings |

## Release state and next action

- QA status: `ready_local`, with provider-backed and database-backed preview smoke still required.
- Migration: `packages/db/drizzle/0006_fair_thundra.sql` generated but not applied.
- Production state: unchanged.
- Rollback: revert the feature diff; the migration is additive, and existing agents remain compatible.
- Next owner: AQUILES after explicit authorization for commit/push and preview deployment, or the repository owner to configure `OPENROUTER_API_KEY`, apply migration `0006`, and deploy both API and web projects.

## Authorized environment and migration follow-up

- Authorization received: configure `OPENROUTER_API_KEY` and run the migration.
- Vercel target: `luizvbs-projects-261f81e6/netolabs-forge-api`.
- `OPENROUTER_API_KEY`: configured as Sensitive in Production and Preview; Development intentionally omitted because Vercel does not support Sensitive variables there.
- Neon target: project `netolabs-forge-db`, branch `main`, database `neondb` (identified by Forge-specific tables and migration journal).
- Migration result: Drizzle reported success; `reasoning_effort`, `is_public`, `public_id`, and `published_at` verified, with `agents_public_id_uq` unique index present.
- Concurrent repository state: `0007_green_marten_broadcloak.sql` appeared during this follow-up and was also pending, so the repository migration command applied both `0006` and `0007`. Database journal now contains 8 entries matching the current local Drizzle journal. No rollback was attempted because both migrations completed successfully and `0007` belongs to concurrent user work.
- Deployment state: unchanged. Vercel environment changes become active on the next API deployment.

---

# Aquiles run: Forge Qualification + Scheduling Kit

## Control metadata

| Field | Value |
| --- | --- |
| Run ID | `forge-qualification-scheduling-2026-07-15` |
| Request class | `feature` |
| Started | 2026-07-15T14:30:00-03:00 |
| Last updated | 2026-07-15T14:32:54-03:00 |
| Status | `complete` |
| Phase ceiling | `VERIFY` |
| Current gate | `VERIFY_PASSED` |
| Workspace | `/Users/luizneto/aquiles/netolabs-forge` |
| Repository / branch | `luizvb/netolabs-forge` / `main` |
| Source state | Existing dirty worktree containing the verified multi-provider/public-agent feature |

## Outcome and boundaries

- User-visible outcome: install a versioned Qualification + Scheduling Kit, configure a high-ticket service operation, publish it, collect and score a lead, show real available slots, confirm one booking, and inspect outcomes in the authenticated workspace.
- Delivery boundary: local product/FDE/design/engineering artifacts, additive schema migration, API/runtime, web experience, automated tests, build and local browser QA.
- Explicit exclusions: commit, push, preview/production deploy, production database mutation, DNS, provider credentials, Google Calendar/Calendly OAuth, WhatsApp, CRM write-back, payment collection, rescheduling and cancellation.
- Privacy boundary: the deterministic qualification flow stores contact data in Forge but does not send that data to an LLM provider. Public responses never expose other leads, bookings, workspace identity, prompt, configuration thresholds or credentials.

## Authorization and access

| Capability | State | Evidence |
| --- | --- | --- |
| Local edits | `authorized` | User explicitly asked to start building and focus fully on this agent |
| Commit / push | `not_authorized` | Not requested |
| GitHub access | `available` | Preflight observed authenticated account `luizvb` and origin remote |
| Preview / production deploy | `not_authorized` | Not requested |
| Vercel access | `available_unlinked` | Preflight observed account `luizvb`; local workspace is not linked |
| Environment / production database mutation | `not_authorized` | No external provider or production change requested |

## Evidence, decisions and risks

| ID | Class | Claim / decision | Source |
| --- | --- | --- | --- |
| E-QS-001 | `user_stated` | Focus 100% on Qualification + Scheduling for high-ticket services and create an ordered plan for later Kits | Active user goal |
| E-QS-002 | `observed` | Forge already provides tenant-owned agents, knowledge, evals, public links, usage controls and observability | `README.md`, current repository |
| E-QS-003 | `observed` | Current public chat is stateless and the runtime has no action/tool execution contract | `apps/api/src/server.ts`, `apps/api/src/adk.ts` |
| E-QS-004 | `decision` | Sell the first Kit as a paid, operated qualified-booking pilot rather than a generic chatbot or connector bundle | `docs/product/qualification-scheduling-go-to-market.md` |
| D-QS-001 | `decision` | Use a deterministic, persisted qualification state machine so PII is not sent to model providers and the flow works without model credentials | `.aquiles/qualification-scheduling.md` |
| D-QS-002 | `decision` | Ship an internal scheduling provider behind a provider-neutral contract; external calendar adapters follow without changing the Kit contract | `.aquiles/qualification-scheduling.md` |
| R-QS-001 | `open` | Internal bookings will not yet block time in an external company calendar | Explicit UI labeling and roadmap item; external provider adapters remain required before broader channel launch |
| R-QS-002 | `open` | Public lead intake creates a PII retention obligation | Minimize fields, tenant-isolate rows, avoid LLM transmission, document deletion/retention follow-up |

## Success contract

| ID | Observable proof | Status |
| --- | --- | --- |
| AC-QS-001 | Operator installs a tagged, configured Kit agent | `passed` |
| AC-QS-002 | Installation seeds five evals and uses existing capacity enforcement | `passed` |
| AC-QS-003 | Unpublished, disabled and non-Kit IDs cannot start qualification | `passed` |
| AC-QS-004 | Server resume works and stale question answers are rejected | `passed` |
| AC-QS-005 | Exact request retries return the stored turn without double advancement | `passed` |
| AC-QS-006 | Area is mandatory and the structured score threshold controls eligibility | `passed` |
| AC-QS-007 | Qualified leads receive future São Paulo slots without occupied starts | `passed` |
| AC-QS-008 | Booking accepts valid availability and racing/occupied starts conflict | `passed` |
| AC-QS-009 | Booking updates the session and tenant-owned operations metrics | `passed` |
| AC-QS-010 | Public/operator states and 1280/390 px layouts pass browser QA | `passed` |
| AC-QS-011 | Contact data stays in deterministic tenant state and outside public metadata/model calls | `passed` |
| AC-QS-012 | Tests, typecheck, build, diff check and privacy scan pass | `passed` |

## Verification ledger

| ID | Method | Result |
| --- | --- | --- |
| V-QS-001 | `pnpm typecheck` | Passed for web, database and API |
| V-QS-002 | `pnpm test` | 75/75 tests passed; qualification suite 5/5 |
| V-QS-003 | `pnpm build` | Production builds passed for all workspaces |
| V-QS-004 | Local migration `0007` | Applied successfully to isolated PGlite/PostgreSQL |
| V-QS-005 | Database-backed HTTP path | 2 qualified sessions, score 7 each, 1 booking, idempotent replay and occupied-slot conflict passed |
| V-QS-006 | Public gate checks | Unpublished, disabled and non-Kit start attempts returned 404 |
| V-QS-007 | Browser QA | Catalog, setup, public journey and operation panel rendered; 1280/390 px checks passed |
| V-QS-008 | `git diff --check` | Passed |
| V-QS-009 | Aquiles privacy scan | 1,229 files, zero findings |

## Release state and next action

- QA status: `ready_local`.
- Production state: unchanged; no commit, push, deploy, environment update or production migration was performed.
- Rollback: revert the Kit code diff; migration `0007` is additive and legacy agents remain compatible.
- Next owner: PRODUCT/FDE for a design-partner pilot and authorization of the next release gate; Calendar adapters remain roadmap order 2.

---

# Aquiles delta: Forge Google Calendar adapter

## Control metadata

| Field | Value |
| --- | --- |
| Run ID | `forge-google-calendar-2026-07-15` |
| Request class | `integration` |
| Started | 2026-07-15T14:40:00-03:00 |
| Last updated | 2026-07-15T15:02:00-03:00 |
| Status | `in_progress` |
| Phase ceiling | `GIT_PUBLISH` |
| Current gate | `GIT_PUBLISH_PENDING` |
| Workspace | `/Users/luizneto/aquiles/netolabs-forge` |
| Repository / branch | `luizvb/netolabs-forge` / `main` |
| Source state | Verified Qualification + Scheduling work plus the earlier multi-provider/public-agent delta, all intentionally included by the user's “commit e push de tudo” instruction |

## Authorization and access

| Capability | State | Evidence |
| --- | --- | --- |
| Local edits | `authorized` | User requested the Google Calendar or Calendly integration |
| Commit / push | `authorized` | User explicitly requested commit and push of everything |
| GitHub access | `available` | Preflight observed authenticated account `luizvb` and `origin` pointing to `luizvb/netolabs-forge` |
| Preview / production deploy | `not_authorized` | Not requested |
| Environment / production database mutation | `not_authorized` | Credentials and production migration were not provided or requested |

## Evidence and decisions

| ID | Class | Claim / decision | Source |
| --- | --- | --- | --- |
| E-GCAL-001 | `user_stated` | Implement Google Calendar or Calendly and publish all current work | Active user request |
| E-GCAL-002 | `observed` | The Kit already has a provider-neutral internal scheduling boundary and transactional booking state | `apps/api/src/qualification.ts`, `apps/api/src/qualification-routes.ts` |
| E-GCAL-003 | `external` | Google web-server OAuth supports offline access, refresh tokens and signed state; Calendar exposes FreeBusy, writable calendar-list and event insertion contracts | Official Google Identity and Calendar API documentation |
| D-GCAL-001 | `decision` | Ship Google first because it provides native busy-time reads, deterministic event writes and Meet creation without introducing a second booking source of truth | `.aquiles/google-calendar.md` |
| D-GCAL-002 | `decision` | Keep the internal calendar as fallback only when no external connection exists; active-but-broken Google connections fail closed | `.aquiles/google-calendar.md` |
| R-GCAL-001 | `open` | Live consent and event creation cannot be verified without user-owned Google Cloud credentials | Required design-partner production gate; no credentials fabricated or requested in source control |

## Success contract

| ID | Observable proof | Status |
| --- | --- | --- |
| AC-GCAL-001 | Signed, expiring, tenant-bound OAuth state | `implemented` |
| AC-GCAL-002 | Encrypted refresh-token persistence and on-demand access refresh | `implemented` |
| AC-GCAL-003 | Writable calendar discovery and selection | `implemented` |
| AC-GCAL-004 | Internal and Google overlap removal | `implemented` |
| AC-GCAL-005 | Agent-serialized, deterministic external booking creation | `implemented` |
| AC-GCAL-006 | Safe event/Meet metadata persistence and public response | `implemented` |
| AC-GCAL-007 | Backward-compatible internal scheduling | `implemented` |
| AC-GCAL-008 | Responsive operator connection states | `implemented` |
| AC-GCAL-009 | Server environment and Google Cloud setup documentation | `implemented` |
| AC-GCAL-010 | Full verification and Git publication | `verification_passed_publish_pending` |

## Verification ledger

| ID | Method | Result |
| --- | --- | --- |
| V-GCAL-001 | `pnpm typecheck` | Passed across all workspaces |
| V-GCAL-002 | `pnpm test` | 81/81 passed; Google 5/5 and Qualification 6/6 |
| V-GCAL-003 | `pnpm build` | Production builds passed |
| V-GCAL-004 | Local migration | `0008` and preceding uncommitted migrations applied successfully to isolated PostgreSQL |
| V-GCAL-005 | Browser QA | Disconnected and reauthorization states passed; 390 px had no horizontal overflow |
| V-GCAL-006 | Aquiles privacy scan | 1,241 files, zero findings |
| V-GCAL-007 | `pnpm audit --prod` | Conditional: npm registry legacy endpoint returned HTTP 410; no audit result claimed |
| V-GCAL-008 | `git diff --check` | Passed |

## Pre-publication state

- QA status: `conditional_pass`; only live provider credentials and the retired registry audit endpoint remain external gates.
- Production state: unchanged; no deploy, environment update or production migration was authorized.
- Git publication is explicitly authorized and is the next in-scope action.
