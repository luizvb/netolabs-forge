import { describe, expect, it } from 'vitest';
import { agentCreationStatus, aggregateTrialUsage, chooseUsageBucket, shouldReleaseFailedRequest } from './entitlements.js';
import { PLAN_CATALOG } from './plans.js';

describe('request entitlement policy', () => {
  it('uses exactly 50 workspace trial runs before the paid bucket', () => {
    expect(chooseUsageBucket({ trialConsumed: 49, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: true, paid: false })).toBe('trial');
    expect(() => chooseUsageBucket({ trialConsumed: 50, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: true, paid: false })).toThrow('50 runs');
    expect(chooseUsageBucket({ trialConsumed: 50, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: false, paid: true })).toBe('paid');
  });

  it('requires Checkout before trial use and never carries unused trial runs into an active period', () => {
    expect(() => chooseUsageBucket({ trialConsumed: 0, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: false, paid: false })).toThrow('Checkout');
    expect(chooseUsageBucket({ trialConsumed: 10, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: false, paid: true })).toBe('paid');
  });

  it('shares the 50-run cap across every agent in the workspace', () => {
    const total = aggregateTrialUsage([
      { trialConsumed: 20, trialReserved: 0 },
      { trialConsumed: 29, trialReserved: 1 },
    ]);
    expect(total).toEqual({ consumed: 49, reserved: 1 });
    expect(() => chooseUsageBucket({ trialConsumed: total.consumed, trialReserved: total.reserved, paidConsumed: 0, paidReserved: 0 }, { trial: true, paid: false })).toThrow('50 runs');
  });

  it('counts reservations when protecting the last slot', () => {
    const renewalAt = new Date('2026-08-13T00:00:00.000Z');
    try {
      chooseUsageBucket({ trialConsumed: 50, trialReserved: 0, paidConsumed: 1_499, paidReserved: 1 }, { trial: false, paid: true }, 1_500, renewalAt);
      throw new Error('Expected usage exhaustion');
    } catch (error) {
      expect(error).toMatchObject({ code: 'USAGE_EXHAUSTED', details: { exhaustedBucket: 'paid', renewalAt: renewalAt.toISOString() } });
    }
  });

  it('releases validation/auth failures but consumes provider-side failures', () => {
    expect(shouldReleaseFailedRequest({ statusCode: 400 })).toBe(true);
    expect(shouldReleaseFailedRequest({ code: 'MODEL_NOT_CONFIGURED' })).toBe(true);
    expect(shouldReleaseFailedRequest({ statusCode: 502 })).toBe(false);
  });

  it('stores excess Scale definitions inactive without weakening paid active slots', () => {
    expect(agentCreationStatus(PLAN_CATALOG.scale, { stored: 40, active: 10 })).toBe('disabled');
    expect(() => agentCreationStatus(PLAN_CATALOG.studio, { stored: 3, active: 3 })).toThrow('armazenado');
  });
});
