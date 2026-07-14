# Forge — NetoLabs Stripe link delta

Status: `in_progress`  
Owner: `coder`  
Product contract: `Repositories/netolabs/docs/product/netolabs-stripe-catalog-brief.md`

## Change

- Add an idempotent bootstrap for one metadata-stable `Forge` Product and six monthly BRL/USD Prices.
- Preserve the existing `STRIPE_PRICE_<PLAN>_<CURRENCY>` bindings and `forge_<plan>_monthly_<currency>` lookup keys.
- Mark every created Product/Price as a test-only commercial hypothesis.
- Validate Product parent, plan, currency, amount, cadence and mode before Checkout.

## Verification

- Bootstrap-core tests plus existing plan/billing tests, API typecheck and build.
- Missing, cross-product, wrong-mode and mismatched Prices fail before Checkout.

## Risk and exit

Forge values remain hypotheses and must not be created or activated live without Luiz's explicit approval. Exit to Tester after a controlled test-mode catalog run and negative isolation checks.
