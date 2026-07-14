import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG, assertAgentCapacity, hasPaidAccess, planForSubscription, publicCatalog, stripePriceId } from './plans.js';

describe('Forge plan policy', () => {
  it('keeps the approved plan matrix and trial separate', () => {
    expect(publicCatalog().map((plan) => [plan.key, plan.activeAgentLimit, plan.totalIncludedRequests])).toEqual([
      ['solo', 1, 1_500], ['studio', 3, 4_500], ['scale', 10, 15_000],
    ]);
    expect(PLAN_CATALOG.scale.storedAgentLimit).toBeNull();
    expect(PLAN_CATALOG.trial.trialRequestsPerLineage).toBe(30);
  });

  it('never accepts a browser supplied Stripe price id', () => {
    expect(stripePriceId('solo', 'brl', { STRIPE_PRICE_SOLO_BRL: 'price_server_owned' } as NodeJS.ProcessEnv)).toBe('price_server_owned');
    expect(() => stripePriceId('studio', 'usd', {} as NodeJS.ProcessEnv)).toThrow('not configured');
  });

  it('honors only active subscriptions or the bounded past-due grace period', () => {
    const now = new Date('2026-07-13T12:00:00Z');
    expect(hasPaidAccess({ planKey: 'studio', status: 'active' }, now)).toBe(true);
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
