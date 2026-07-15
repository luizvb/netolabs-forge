import { describe, expect, it } from 'vitest';
import { agentCreationStatus, aggregateTrialUsage, assertPlanAccess, chooseUsageBucket, shouldReleaseFailedRequest } from './entitlements.js';
import { PLAN_CATALOG } from './plans.js';

describe('request entitlement policy', () => {
  it('uses the first plan full 1,500-request allowance during the workspace trial', () => {
    expect(chooseUsageBucket({ trialConsumed: 1_499, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: true, paid: false })).toBe('trial');
    expect(() => chooseUsageBucket({ trialConsumed: 1_500, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: true, paid: false })).toThrow('1.500 execuções');
    expect(chooseUsageBucket({ trialConsumed: 1_500, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: false, paid: true })).toBe('paid');
  });

  it('requires a subscription after expiry and never carries unused trial runs into an active period', () => {
    expect(() => chooseUsageBucket({ trialConsumed: 0, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: false, paid: false })).toThrow('forma de pagamento');
    expect(chooseUsageBucket({ trialConsumed: 10, trialReserved: 0, paidConsumed: 0, paidReserved: 0 }, { trial: false, paid: true })).toBe('paid');
  });

  it('shares the plan trial allowance across every agent in the workspace', () => {
    const total = aggregateTrialUsage([
      { trialConsumed: 700, trialReserved: 0 },
      { trialConsumed: 799, trialReserved: 1 },
    ]);
    expect(total).toEqual({ consumed: 1_499, reserved: 1 });
    expect(() => chooseUsageBucket({ trialConsumed: total.consumed, trialReserved: total.reserved, paidConsumed: 0, paidReserved: 0 }, { trial: true, paid: false })).toThrow('1.500 execuções');
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

  it('hard-gates monetized writes at the exact trial boundary', () => {
    const endsAt = new Date('2026-07-22T15:00:00.000Z');
    expect(() => assertPlanAccess({ planKey: 'solo', status: 'trialing', trialEndsAt: endsAt }, new Date(endsAt.getTime() - 1))).not.toThrow();
    expect(() => assertPlanAccess({ planKey: 'solo', status: 'trialing', trialEndsAt: endsAt }, endsAt)).toThrow(expect.objectContaining({ statusCode: 402, code: 'SUBSCRIPTION_REQUIRED' }));
    expect(() => assertPlanAccess(null, endsAt)).toThrow(expect.objectContaining({ statusCode: 402, code: 'SUBSCRIPTION_REQUIRED' }));
  });
});
