# Forge by NetoLabs

**Build agents that hold up.**

Forge is an open-source SaaS platform for building, grounding, testing, publishing, and managing dependable AI agents. It supports Gemini and GPT models through OpenRouter while preserving direct Google Agent Development Kit compatibility. The product combines multi-tenant agent management, knowledge ingestion, private and public chat playgrounds, and repeatable evaluations in one focused web application.

[![MIT License](https://img.shields.io/badge/license-MIT-20231f.svg)](LICENSE)
[![CI](https://github.com/luizvb/netolabs-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/luizvb/netolabs-forge/actions/workflows/ci.yml)
[![Live app](https://img.shields.io/badge/live-forge.netolabs.dev-28624a.svg)](https://forge.netolabs.dev)

![Forge brand system](docs/brand/forge-brand-board.png)

## Live deployment

- Web application: [forge.netolabs.dev](https://forge.netolabs.dev)
- API health: [netolabs-forge-api.vercel.app/api/health](https://netolabs-forge-api.vercel.app/api/health)

The web application and API run as separate Vercel projects from the same monorepo. Browser requests use the web app's `/api/*` proxy so authentication cookies remain same-origin.

## Features

- Google authentication through Neon Auth, with issuer/subject identity provisioning and a controlled legacy local fallback
- Workspace-based multi-tenancy and data isolation
- Create, list, inspect, and delete custom agents
- Turn a plain-language agent definition into a production prompt with grounding rules, guardrails, escalation boundaries, and an editable final draft
- Knowledge sources from text, public URLs, PDF, DOCX, TXT, Markdown, and CSV files
- Ingestion protections for private networks, unsafe redirects, oversized files, and unsupported content
- Durable knowledge worker with live progress, retries, leases, versioned content, persisted chunks, activation controls, and detailed job history
- Per-agent chunking and lexical retrieval that only uses active, ready sources
- Gemini and GPT agents through OpenRouter, with selectable reasoning effort
- Backward-compatible direct Gemini and Vertex AI execution through Google ADK
- Reversible public test links with non-enumerable IDs and workspace-owned usage limits
- Installable, versioned Agent Kits that package an operating contract, guardrails, evals, actions and outcome reporting
- Qualification + Scheduling Kit with consent, persisted lead sessions, deterministic scoring, real internal availability, idempotent booking and duplicate-slot protection
- Tenant-owned qualification operations dashboard with recent leads, scores, conversion rates and confirmed bookings
- Supervisor-generated evaluation suites built from the agent prompt, active knowledge, and optional questions supplied by the operator
- Evaluation scenarios, prompt fingerprints, deterministic checks, independent model judging, score dimensions, latency and token tracking
- Evaluation history, CSV export, cancellation, and AI-assisted prompt review
- Full conversation and model-call ledger with inputs, outputs, tokens, latency, estimated Google model cost, and the pricing snapshot used for each estimate
- Workspace and per-agent observability dashboards for traffic, quality, knowledge health, token usage, and estimated spend
- Stripe subscriptions for Solo, Studio and Scale, with signed idempotent webhooks, Customer Portal and server-owned price IDs
- 30 lifetime test executions per agent lineage followed by an atomic 1,500-request monthly allowance per active paid agent
- Explicit, versioned Forge-to-Benchline consent with signed synchronization and free bundled eval entitlements
- Responsive web interface with explicit loading, empty, and error states
- Drizzle migrations and Neon Postgres support

## Architecture

```text
apps/web       React + Vite web application
apps/api       Fastify API, authentication, Google ADK, worker, telemetry, and eval runner
packages/db    Drizzle schema, migrations, and PostgreSQL connection
api/index.ts   Vercel Function entry point
```

Runtime traffic uses Neon's pooled `DATABASE_URL`. Schema migrations use the direct `DIRECT_URL` connection.

## Tech stack

- React, TypeScript, Vite, and a custom responsive design system
- Fastify and Zod
- OpenRouter Chat Completions and Google ADK for TypeScript
- PostgreSQL on Neon with Drizzle ORM
- Vitest
- Vercel

## Quick start

Requirements:

- Node.js 22 or newer
- pnpm 10 or newer
- A PostgreSQL database, preferably Neon
- An OpenRouter API key, or Google AI / Vertex AI credentials for legacy direct-Google agents

```bash
git clone https://github.com/luizvb/netolabs-forge.git
cd netolabs-forge
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm dev
```

Local services:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled PostgreSQL URL used by the API |
| `DIRECT_URL` | Yes for migrations | Direct PostgreSQL URL used by Drizzle migrations |
| `AUTH_SECRET` | Yes | Random session-signing secret with at least 32 characters |
| `NEON_AUTH_ISSUER` | Production auth | Expected Neon Auth JWT issuer |
| `NEON_AUTH_JWKS_URL` | Production auth | Neon Auth remote JWKS URL used by the API |
| `NEON_AUTH_AUDIENCE` | If configured in Neon | Expected JWT audience |
| `VITE_NEON_AUTH_URL` | Web Google auth | Public Neon Auth endpoint used by the browser SDK |
| `ALLOW_LEGACY_AUTH` / `VITE_ALLOW_LEGACY_AUTH` | No | Explicit migration-only password fallback; keep `false` in production |
| `STRIPE_SECRET_KEY` | Billing | Server-side Stripe key; prefer a restricted key |
| `STRIPE_WEBHOOK_SECRET` | Billing | Signing secret for `/billing/webhook` |
| `STRIPE_PRICE_{PLAN}_{CURRENCY}` | Billing | Server-owned recurring Price IDs for Solo, Studio and Scale in BRL/USD |
| `BILLING_GRACE_DAYS` | No | Bounded past-due grace period; defaults to 3 days |
| `BENCHLINE_API_URL` | Benchline bundle | Base URL of the Benchline partner API |
| `BENCHLINE_S2S_SECRET` | Benchline bundle | Shared HMAC secret; configure the same value in Benchline through a secret manager |
| `OPENROUTER_API_KEY` | Recommended model runtime | Server-side OpenRouter key used for Gemini and GPT agent, supervisor, and judge calls |
| `OPENROUTER_SITE_URL` | No | Application URL sent as OpenRouter attribution; defaults to `WEB_ORIGIN` |
| `GOOGLE_API_KEY` | For Gemini | Google AI API key used by agent and judge calls |
| `GOOGLE_GENAI_USE_VERTEXAI` | For Vertex AI | Set to `true` to use Vertex AI instead of an API key |
| `GOOGLE_CLOUD_PROJECT` | For Vertex AI | Google Cloud project ID |
| `GOOGLE_CLOUD_LOCATION` | For Vertex AI | Vertex AI region; defaults to `global` |
| `GOOGLE_CALENDAR_CLIENT_ID` | Calendar integration | OAuth 2.0 web client ID created in Google Cloud |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Calendar integration | Server-only OAuth client secret |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Calendar integration | Exact authorized callback URI; locally `http://localhost:4000/calendar-connections/google/callback` |
| `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` | Calendar integration | Base64-encoded 32-byte key used to encrypt refresh tokens at rest |
| `EVAL_SUPERVISOR_MODEL` | No | Independent judge model; defaults to `google/gemini-2.5-pro` with OpenRouter |
| `EVAL_REASONING_EFFORT` | No | OpenRouter reasoning effort for structured supervisor calls; defaults to `medium` |
| `CRON_SECRET` | Production worker cron | Secret used to authenticate Vercel's knowledge-worker trigger |
| `WORKER_POLL_MS` | No | Poll interval for the persistent worker; defaults to `1500` ms |
| `GOOGLE_PRICING_JSON` | No | JSON override for estimated per-million-token model prices |
| `WEB_ORIGIN` | Yes | Allowed browser origin for CORS |
| `DATABASE_MAX_CONNECTIONS` | No | Maximum database connections per API instance |

Never commit real credentials. The supplied `.env.example` contains placeholders only.

## Local PostgreSQL smoke test

The repository includes a PGlite Socket setup for a reproducible PostgreSQL-compatible integration test:

```bash
pnpm db:local
```

In a second terminal:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:54329/postgres \
DIRECT_URL=postgresql://postgres:postgres@localhost:54329/postgres \
DATABASE_MAX_CONNECTIONS=1 pnpm db:migrate

DATABASE_URL=postgresql://postgres:postgres@localhost:54329/postgres \
DATABASE_MAX_CONNECTIONS=1 \
AUTH_SECRET=local-development-secret-with-32-chars \
pnpm start:api
```

In a third terminal:

```bash
pnpm smoke:local
```

The smoke test covers registration, login and logout, tenant isolation, agent CRUD, prompt generation, asynchronous knowledge ingestion, live job state, knowledge inspection and activation, evaluation generation, the observability ledger, estimated pricing, and cascade deletion.

## Qualification + Scheduling Kit

Open **Kits** in an authenticated workspace to install the first complete Agent Kit. The setup captures the offer, service area, score threshold and weekly availability, then creates a tenant-owned agent with five regression scenarios. Publication remains off until the operator reviews and activates the public link.

The public journey is deterministic and does not send lead contact data to a model provider. It collects one bounded answer at a time, resumes from server state, qualifies only against structured criteria and offers future slots from the configured weekly window. Booking creation is transactional and idempotent, so overlapping reservations cannot be confirmed for the same agent.

Every Kit keeps Forge's internal calendar as a safe default. An operator can additionally connect Google Calendar from the agent's **Operação** tab: Forge combines Google FreeBusy with internal bookings, creates a deterministic calendar event and Google Meet on confirmation, and stores only an AES-256-GCM-encrypted refresh token. If Google requires a new authorization, public availability closes until the operator reconnects, avoiding accidental double-booking.

To enable the connection, create an OAuth 2.0 **Web application** in Google Cloud, enable the Google Calendar API, configure the consent screen and add the exact `GOOGLE_CALENDAR_REDIRECT_URI` as an authorized redirect URI. Generate the encryption key with `openssl rand -base64 32`. Keep all four values in the server secret manager; none belongs in the browser bundle. Calendly, CRM, WhatsApp, cancellation and rescheduling adapters remain roadmap work; the ordered plan is documented in [`docs/product/agent-kits-roadmap.md`](docs/product/agent-kits-roadmap.md).

The paid-pilot offer, ICP, pricing hypotheses, ROI model and delivery motion are documented in [`docs/product/qualification-scheduling-go-to-market.md`](docs/product/qualification-scheduling-go-to-market.md).

## Commands

```bash
pnpm typecheck       # Type-check every workspace
pnpm test            # Run the test suite
pnpm build           # Build all applications and packages
pnpm audit --prod    # Audit production dependencies
pnpm db:generate     # Generate a Drizzle migration
pnpm db:migrate      # Apply pending migrations
pnpm smoke:local     # Run the HTTP integration smoke test
pnpm worker          # Run the persistent knowledge worker
```

## Deployment

Forge uses two Vercel projects:

1. The web project has `apps/web` as its root directory.
2. The API project uses the repository root and serves the catch-all Vercel Function in `api/index.ts`.
3. Rehearse additive migrations on an isolated Neon branch, then apply them using its direct connection URL.
4. Configure Neon Auth with Google credentials and trusted production/callback domains. Configure the JWT issuer/JWKS values in the API and `VITE_NEON_AUTH_URL` in the web project.
5. Create recurring Stripe Prices for the six plan/currency keys, configure the signed webhook and Customer Portal, then inject only their IDs and server secrets.
6. Deploy the Benchline partner migration/API with the shared HMAC secret before enabling `BENCHLINE_API_URL` in Forge.
7. Request-driven ingestion extends the Vercel Function lifetime so jobs begin immediately. A secured daily cron recovers abandoned work on Hobby deployments; for sustained throughput and fast retries, run `pnpm worker` as a persistent process.

Checkout redirects never grant product access. Forge activates or changes a plan only after processing a verified Stripe subscription webhook. The implementation has no automatic overage: limits stop execution until renewal or an explicit plan change.

Prompt and eval generation have a deterministic, guardrailed fallback so the authoring workflow remains available without model credentials. Chat, model-judged eval execution, and AI prompt review require either `OPENROUTER_API_KEY` or direct Google/Vertex credentials. Existing unqualified Gemini model names automatically use OpenRouter when it is the only configured model runtime.

Public test links are disabled by default. An owner can publish or revoke a link from the agent detail page. Public calls consume the same server-enforced agent allowance and expose no system prompt, connected knowledge, workspace identity, or credentials.

Cost figures are estimates, not invoices. Forge stores the model rates used alongside every call so historical calculations remain auditable when provider pricing changes.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Brand assets

The logo system, palette, typography, and usage notes live in [`docs/brand`](docs/brand/README.md).

## License

Forge is released under the [MIT License](LICENSE).
