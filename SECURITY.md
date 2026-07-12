# Security policy

## Supported version

Security fixes are applied to the latest version on the `main` branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Include:

- the affected endpoint or component;
- reproduction steps or a proof of concept;
- the expected security impact;
- any suggested remediation.

Do not include real credentials, personal data, or customer content in the report. Please allow a reasonable remediation window before public disclosure.

## Security expectations

- Never commit `.env` files or production credentials.
- Use a unique `AUTH_SECRET` with at least 32 random characters.
- Use pooled Neon connections at runtime and direct connections only for migrations.
- Keep URL ingestion protections enabled to prevent server-side request forgery.
- Review generated database migrations before applying them.
