import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG } from '../src/plans.js';
import { assertBootstrapGate, plans, priceMetadata, priceMismatch, priceMutableMismatch, productSpec } from './stripe-bootstrap-core.mjs';

describe('Forge Stripe bootstrap contract', () => {
  it('uses one sandbox/hypothesis Product and mirrors all six runtime slots', () => {
    expect(productSpec.metadata).toMatchObject({ owner_brand: 'netolabs', product_key: 'forge', commercial_status: 'sandbox_hypothesis' });
    expect(productSpec.taxCode).toBe('txcd_10103001');
    expect(plans).toHaveLength(6);
    for (const plan of plans) expect(plan.cents).toBe(PLAN_CATALOG[plan.plan].prices?.[plan.currency] * 100);
  });

  it('requires an explicit account for writes and dual approval for live', () => {
    expect(assertBootstrapGate({ secret: 'rk_test_example', apply: false })).toBe('test');
    expect(() => assertBootstrapGate({ secret: 'rk_test_example', apply: true })).toThrow('--account');
    expect(() => assertBootstrapGate({ secret: 'rk_live_example', apply: true, targetAccount: 'acct_example', allowLive: false })).toThrow('Refusing live');
  });

  it('validates immutable Price fields, parent, mode and hypothesis metadata', () => {
    const plan = plans[0];
    const valid = { active: true, product: 'prod_forge', livemode: false, currency: 'brl', unit_amount: 14900, tax_behavior: 'exclusive', nickname: plan.key, type: 'recurring', recurring: { interval: 'month', interval_count: 1 }, metadata: priceMetadata(plan) };
    expect(priceMismatch(plan, valid, 'prod_forge', false)).toBeNull();
    expect(priceMismatch(plan, { ...valid, product: 'prod_benchline' }, 'prod_forge', false)).toBe('parent');
    expect(priceMismatch(plan, { ...valid, livemode: true }, 'prod_forge', false)).toBe('mode');
    expect(priceMutableMismatch(plan, valid)).toBe(false);
    expect(priceMutableMismatch(plan, { ...valid, nickname: 'legacy' })).toBe(true);
  });
});
