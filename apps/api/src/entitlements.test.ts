import { describe, expect, it } from 'vitest';
import { agentCreationStatus, chooseUsageBucket, shouldReleaseFailedRequest } from './entitlements.js';
import { PLAN_CATALOG } from './plans.js';

describe('request entitlement policy', () => {
  it('uses exactly 30 lifetime trial requests before the paid bucket', () => {
    expect(chooseUsageBucket({ trialConsumed: 29, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, false)).toBe('trial');
    expect(() => chooseUsageBucket({ trialConsumed: 30, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, false)).toThrow('30 requisições');
    expect(chooseUsageBucket({ trialConsumed: 30, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, true)).toBe('paid');
  });

  it('counts reservations when protecting the last slot', () => {
    const renewalAt = new Date('2026-08-13T00:00:00.000Z');
    try {
      chooseUsageBucket({ trialConsumed: 30, trialReserved: 0, paidConsumed: 1_499, paidReserved: 1 }, true, 1_500, renewalAt);
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
