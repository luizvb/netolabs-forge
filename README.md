# Forge by NetoLabs

**Build agents that hold up.**

Forge is an open-source SaaS platform for building, grounding, testing, and managing dependable AI agents with the [Google Agent Development Kit](https://google.github.io/adk-docs/). It combines multi-tenant agent management, knowledge ingestion, a chat playground, and repeatable evaluations in one focused web application.

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
- Google ADK agents powered by Gemini or Vertex AI
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
- Google ADK for TypeScript
- PostgreSQL on Neon with Drizzle ORM
- Vitest
- Vercel

## Quick start

Requirements:

- Node.js 22 or newer
- pnpm 10 or newer
- A PostgreSQL database, preferably Neon
- A Google AI API key or Vertex AI credentials for model-backed features

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
| `GOOGLE_API_KEY` | For Gemini | Google AI API key used by agent and judge calls |
| `GOOGLE_GENAI_USE_VERTEXAI` | For Vertex AI | Set to `true` to use Vertex AI instead of an API key |
| `GOOGLE_CLOUD_PROJECT` | For Vertex AI | Google Cloud project ID |
| `GOOGLE_CLOUD_LOCATION` | For Vertex AI | Vertex AI region; defaults to `global` |
| `EVAL_SUPERVISOR_MODEL` | No | Independent judge model; defaults to `gemini-2.5-pro` |
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

Prompt and eval generation have a deterministic, guardrailed fallback so the authoring workflow remains available without model credentials. Chat, model-judged eval execution, and AI prompt review require Gemini or Vertex AI credentials.

Cost figures are estimates, not invoices. Forge stores the model rates used alongside every call so historical calculations remain auditable when provider pricing changes.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Brand assets

The logo system, palette, typography, and usage notes live in [`docs/brand`](docs/brand/README.md).

## License

Forge is released under the [MIT License](LICENSE).
