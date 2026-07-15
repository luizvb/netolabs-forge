import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG, assertAgentCapacity, forgeCatalogPriceMismatch, hasPaidAccess, hasPaidRequestAllowance, planForSubscription, publicCatalog, stripePlanForPriceId, stripePriceId } from './plans.js';

describe('Forge plan policy', () => {
  it('fails closed on cross-product, mode and catalog Price mismatches', () => {
    const env = { STRIPE_PRICE_SOLO_BRL: 'price_solo_brl' } as NodeJS.ProcessEnv;
    const valid = { id: 'price_solo_brl', active: true, livemode: false, currency: 'brl', unit_amount: 14900, type: 'recurring', recurring: { interval: 'month', interval_count: 1 }, metadata: { owner_brand: 'netolabs', product_key: 'forge', package_key: 'solo', entitlement_key: 'forge_plan_access', catalog_version: '2026-07-14', commercial_status: 'approved' }, product: { metadata: { owner_brand: 'netolabs', product_key: 'forge' } } };
    expect(forgeCatalogPriceMismatch('solo', 'brl', valid, false, env)).toBeNull();
    expect(forgeCatalogPriceMismatch('solo', 'brl', { ...valid, livemode: true }, false, env)).toBe('mode');
    expect(forgeCatalogPriceMismatch('solo', 'brl', { ...valid, product: { metadata: { owner_brand: 'netolabs', product_key: 'benchline' } } }, false, env)).toBe('parent');
    expect(forgeCatalogPriceMismatch('solo', 'brl', { ...valid, metadata: { ...valid.metadata, commercial_status: 'sandbox_hypothesis' } }, false, env)).toBe('metadata');
  });
  it('keeps the approved plan matrix and trial separate', () => {
    expect(publicCatalog().map((plan) => [plan.key, plan.activeAgentLimit, plan.totalIncludedRequests])).toEqual([
      ['solo', 1, 1_500], ['studio', 3, 4_500], ['scale', 10, 15_000],
    ]);
    expect(PLAN_CATALOG.scale.storedAgentLimit).toBeNull();
    expect(PLAN_CATALOG.trial.trialDurationDays).toBe(7);
    expect(PLAN_CATALOG.trial.trialRequestsPerWorkspace).toBe(50);
  });

  it('never accepts a browser supplied Stripe price id', () => {
    expect(stripePriceId('solo', 'brl', { STRIPE_PRICE_SOLO_BRL: 'price_server_owned' } as NodeJS.ProcessEnv)).toBe('price_server_owned');
    expect(() => stripePriceId('studio', 'usd', {} as NodeJS.ProcessEnv)).toThrow('not configured');
  });

  it('maps webhook prices back to the server-owned plan and currency', () => {
    const env = { STRIPE_PRICE_STUDIO_USD: 'price_studio_usd' } as NodeJS.ProcessEnv;
    expect(stripePlanForPriceId('price_studio_usd', env)).toEqual({ plan: 'studio', currency: 'usd' });
    expect(() => stripePlanForPriceId('price_from_another_product', env)).toThrow('unknown price');
  });

  it('honors only active subscriptions or the bounded past-due grace period', () => {
    const now = new Date('2026-07-13T12:00:00Z');
    expect(hasPaidAccess({ planKey: 'studio', status: 'active' }, now)).toBe(true);
    expect(hasPaidAccess({ planKey: 'studio', status: 'trialing', trialEndsAt: new Date('2026-07-20T12:00:00Z') }, now)).toBe(true);
    expect(hasPaidAccess({ planKey: 'studio', status: 'trialing', trialEndsAt: new Date('2026-07-12T12:00:00Z') }, now)).toBe(false);
    expect(hasPaidRequestAllowance({ planKey: 'studio', status: 'trialing', trialEndsAt: new Date('2026-07-20T12:00:00Z') }, now)).toBe(false);
    expect(hasPaidRequestAllowance({ planKey: 'studio', status: 'active' }, now)).toBe(true);
    expect(hasPaidAccess({ planKey: 'studio', status: 'past_due', graceUntil: new Date('2026-07-14T12:00:00Z') }, now)).toBe(true);
    expect(planForSubscription({ planKey: 'studio', status: 'past_due', graceUntil: new Date('2026-07-12T12:00:00Z') }, now).key).toBe('trial');
    expect(hasPaidAccess({ planKey: 'scale', status: 'canceled' }, now)).toBe(false);
  });

  it('enforces stored and active agent limits', () => {
    expect(() => assertAgentCapacity(PLAN_CATALOG.solo, { stored: 1, active: 0 })).toThrow('armazenado');
    expect(() => assertAgentCapacity(PLAN_CATALOG.studio, { stored: 2, active: 3 })).toThrow('ativo');
    expect(() => assertAgentCapacity(PLAN_CATALOG.scale, { stored: 100, active: 9 })).not.toThrow();
  });
});
