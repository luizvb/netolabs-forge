# Forge Agent Kits roadmap

Status: Qualification + Scheduling and Google Calendar adapter implemented locally; remaining capabilities ordered below
Date: 2026-07-15

## Sequencing rule

Each Kit enters build only after the prior shared capability is measured in production or a design-partner pilot. A Kit is not a prompt preset. It must ship with an install contract, tool policy, eval pack, human recovery path and outcome dashboard.

## Ordered roadmap

| Order | Kit / platform capability | Outcome | Shared capabilities added | Entry gate |
| --- | --- | --- | --- | --- |
| 1 | Qualification + Scheduling v1 | Qualified booking confirmed | Template identity, persisted sessions, deterministic scoring, internal availability, booking concurrency, outcome dashboard | Current build |
| 2 | Calendar adapters | Same booking reflected in the operator's source of truth | Google Calendar OAuth, encrypted credentials, FreeBusy and event creation shipped; Calendly and webhook reconciliation remain | Validate Google with a design partner, then confirm Calendly demand |
| 3 | CRM adapters | Qualified lead and booking written back to CRM | Contact/deal mapping, HubSpot and Pipedrive adapters, idempotent upsert, sync status | At least 3 design partners use a CRM |
| 4 | WhatsApp channel + human handoff | Qualification completes in the customer's primary channel | Official channel adapter, thread continuity, inbox ownership, consent, handoff queue | Official provider path and support ownership are selected |
| 5 | Customer Support N1 | Eligible conversation resolved or handed off with context | Ticketing adapters, account/order lookup tools, resolution outcome, CSAT | Tool policy and handoff reliability meet release thresholds |
| 6 | Customer Success | Customer activation or risk intervention completed | Proactive journeys, product/billing signals, account health, CSM tasks | CRM/product event data is available and retention baseline exists |
| 7 | Quote Builder for Services | Qualified proposal delivered | Pricing rules, proposal document, approval, e-signature adapter | Qualification data proves reusable for commercial proposals |
| 8 | Catalog Seller | Order confirmed | Catalog, stock, cart, payment link, fulfillment status and commerce guardrails | One narrow merchant vertical and source systems are selected |
| 9 | Reactivation + Renewal | Dormant customer reactivated or renewal routed | Campaign consent, segmentation, suppression, billing/offer policy | Customer data/consent model and attribution are proven |

## Cross-cutting release gates

- Provider credentials use least privilege and are never included in prompts, client bundles or logs.
- Every write action has validation, authorization, idempotency, audit and a recovery path.
- Every Kit defines one billable outcome and guardrail metrics before implementation.
- External claims require measured evidence; roadmap items are never presented as shipped integrations.
- New template versions require diff, eval rerun and explicit operator adoption when behavior changes materially.
