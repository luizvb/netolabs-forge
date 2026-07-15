import { describe, expect, it } from 'vitest';
import { activeAgentIdsToDisable, normalizedBillingState, paidCheckoutOptions, revocationWorkspaceForDelivery, shouldApplySubscriptionSnapshot, shouldResetTrialUsage, stripeSubscriptionCancellationScheduled, subscriptionEventForRetry, subscriptionIdFromInvoice, subscriptionSnapshotFromStripe, subscriptionWorkspaceLockKey } from './billing.js';

describe('Stripe entitlement snapshots', () => {
  it('derives a paid snapshot only from server-verified subscription metadata', () => {
    const snapshot = subscriptionSnapshotFromStripe({ id: 'sub_1', customer: 'cus_1', status: 'trialing', cancel_at_period_end: false, current_period_start: 1_700_000_000, current_period_end: 1_702_592_000, trial_start: 1_700_000_000, trial_end: 1_700_604_800, metadata: { workspaceId: 'workspace-1', planKey: 'studio' } }, 1_700_000_010);
    expect(snapshot).toMatchObject({ workspaceId: 'workspace-1', planKey: 'studio', status: 'trialing', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    expect(snapshot.trialStartedAt?.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    expect(snapshot.trialEndsAt?.toISOString()).toBe('2023-11-21T22:13:20.000Z');
  });

  it('always collects payment and never starts another trial in Checkout', () => {
    expect(paidCheckoutOptions()).toEqual({ paymentMethodCollection: 'always', subscriptionTrial: {} });
  });

  it('preserves the one-time trial marker on a later subscription without trial fields', () => {
    const trialStartedAt = new Date('2026-07-15T12:00:00Z');
    const trialEndsAt = new Date('2026-07-22T12:00:00Z');
    const snapshot = subscriptionSnapshotFromStripe(
      { id: 'sub_2', customer: 'cus_1', status: 'active', metadata: { workspaceId: 'workspace-1', planKey: 'solo' } },
      1_784_112_400,
      { workspaceId: 'workspace-1', planKey: 'solo', trialStartedAt, trialEndsAt },
    );
    expect(snapshot).toMatchObject({ trialStartedAt, trialEndsAt });
  });

  it('resets legacy free usage only when the first verified Stripe trial begins', () => {
    const trialStartedAt = new Date('2026-07-15T12:00:00Z');
    expect(shouldResetTrialUsage(undefined, { status: 'trialing', trialStartedAt })).toBe(true);
    expect(shouldResetTrialUsage({ trialStartedAt }, { status: 'trialing', trialStartedAt })).toBe(false);
    expect(shouldResetTrialUsage(undefined, { status: 'active', trialStartedAt: null })).toBe(false);
  });

  it('rejects arbitrary or missing plan metadata', () => {
    expect(() => subscriptionSnapshotFromStripe({ id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { workspaceId: 'workspace-1', planKey: 'price_from_browser' } }, 1)).toThrow('metadata');
  });

  it('derives plan changes from the canonical Stripe Price instead of stale metadata', () => {
    const snapshot = subscriptionSnapshotFromStripe({
      id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { workspaceId: 'workspace-1', planKey: 'scale' },
      items: { data: [{ price: { id: 'price_solo_brl' } }] },
    }, 2, undefined, { STRIPE_PRICE_SOLO_BRL: 'price_solo_brl' } as NodeJS.ProcessEnv);
    expect(snapshot.planKey).toBe('solo');
  });

  it('deterministically disables active slots above a downgraded plan limit', () => {
    expect(activeAgentIdsToDisable(['oldest', 'middle', 'newest'], 1)).toEqual(['middle', 'newest']);
    expect(activeAgentIdsToDisable(['only'], 3)).toEqual([]);
  });

  it('reconciles a pending Benchline revocation when Stripe redelivers the same subscription event', () => {
    const subscription = { id: 'sub_1', customer: 'cus_1', status: 'canceled' };
    expect(subscriptionEventForRetry('customer.subscription.deleted', subscription)?.id).toBe('sub_1');
    expect(revocationWorkspaceForDelivery('workspace-1', undefined)).toBe('workspace-1');
    expect(revocationWorkspaceForDelivery(undefined, 'workspace-1')).toBe('workspace-1');
  });

  it('finds subscriptions in current and legacy invoice payloads', () => {
    expect(subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: 'sub_parent' } } })).toBe('sub_parent');
    expect(subscriptionIdFromInvoice({ subscription: { id: 'sub_legacy' } })).toBe('sub_legacy');
    expect(subscriptionIdFromInvoice({})).toBeUndefined();
  });

  it('normalizes renewal, cancellation and payment recovery states', () => {
    const now = new Date('2026-07-14T12:00:00Z');
    expect(normalizedBillingState({ status: 'active' }, now)).toBe('active');
    expect(normalizedBillingState({ status: 'active', cancelAtPeriodEnd: true }, now)).toBe('cancel_scheduled');
    expect(normalizedBillingState({ status: 'past_due', graceUntil: new Date('2026-07-15T12:00:00Z') }, now)).toBe('past_due_grace');
    expect(normalizedBillingState({ status: 'past_due', graceUntil: new Date('2026-07-13T12:00:00Z') }, now)).toBe('past_due_blocked');
    expect(normalizedBillingState({ status: 'canceled' }, now)).toBe('canceled');
    expect(normalizedBillingState({ status: 'trialing', trialEndsAt: new Date('2026-07-14T12:00:00Z') }, now)).toBe('trial_expired');
  });

  it('normalizes flexible billing cancel_at as a scheduled cancellation', () => {
    const eventCreated = 1_752_491_000;
    const snapshot = subscriptionSnapshotFromStripe({
      id: 'sub_flexible', customer: 'cus_1', status: 'active',
      cancel_at_period_end: false, cancel_at: eventCreated + 2_592_000,
      metadata: { workspaceId: 'workspace-1', planKey: 'studio' },
    }, eventCreated);

    expect(snapshot.cancelAtPeriodEnd).toBe(true);
    expect(normalizedBillingState(snapshot, new Date(eventCreated * 1_000))).toBe('cancel_scheduled');
    expect(stripeSubscriptionCancellationScheduled({ cancel_at_period_end: false, cancel_at: eventCreated - 1 }, eventCreated)).toBe(false);
  });

  it('keeps canonical active state for paid and failed invoices delivered out of order or in the same second', () => {
    const second = 1_700_000_010;
    const canonical = { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { workspaceId: 'workspace-1', planKey: 'studio' } };
    const paidSnapshot = subscriptionSnapshotFromStripe(canonical, second);
    const delayedFailedSnapshot = subscriptionSnapshotFromStripe(canonical, second);
    expect(delayedFailedSnapshot.status).toBe('active');
    expect(shouldApplySubscriptionSnapshot(paidSnapshot, delayedFailedSnapshot)).toBe(true);

    const stalePastDue = { ...delayedFailedSnapshot, status: 'past_due' };
    expect(shouldApplySubscriptionSnapshot(paidSnapshot, stalePastDue)).toBe(false);
    expect(shouldApplySubscriptionSnapshot(paidSnapshot, { ...stalePastDue, providerUpdatedAt: new Date((second - 1) * 1_000) })).toBe(false);
    expect(shouldApplySubscriptionSnapshot(stalePastDue, paidSnapshot)).toBe(true);
  });

  it('serializes the first subscription webhook by workspace metadata before an indexed row exists', () => {
    expect(subscriptionWorkspaceLockKey({ id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { workspaceId: 'workspace-1' } })).toBe('workspace-1');
    expect(subscriptionWorkspaceLockKey({ id: 'sub_1', customer: 'cus_1', status: 'active' }, 'workspace-fallback')).toBe('workspace-fallback');
  });
});
