# Contributing to Forge

Thank you for helping improve Forge.

## Development workflow

1. Fork the repository and create a focused branch.
2. Install dependencies with `pnpm install`.
3. Copy `.env.example` to `.env` and use development-only credentials.
4. Make the smallest coherent change that solves the problem.
5. Add or update tests when behavior changes.
6. Run the validation suite before opening a pull request:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
```

## Pull requests

- Explain the problem and the chosen solution.
- Include screenshots for visible interface changes.
- Document new environment variables and migration steps.
- Keep unrelated refactors out of the same pull request.
- Never include credentials, production data, or private customer content.

## Database changes

Update the Drizzle schema in `packages/db/src/schema.ts`, generate a migration with `pnpm db:generate`, and review the generated SQL before committing it. Migrations must be backward-safe for a rolling deployment whenever possible.

## Reporting vulnerabilities

Do not open a public issue for a security vulnerability. Follow the private reporting process in [SECURITY.md](SECURITY.md).
