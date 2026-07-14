import { describe, expect, it } from 'vitest';
import { activeAgentIdsToDisable, revocationWorkspaceForDelivery, subscriptionEventForRetry, subscriptionSnapshotFromStripe } from './billing.js';

describe('Stripe entitlement snapshots', () => {
  it('derives a paid snapshot only from server-verified subscription metadata', () => {
    const snapshot = subscriptionSnapshotFromStripe({ id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, current_period_start: 1_700_000_000, current_period_end: 1_702_592_000, metadata: { workspaceId: 'workspace-1', planKey: 'studio' } }, 1_700_000_010);
    expect(snapshot).toMatchObject({ workspaceId: 'workspace-1', planKey: 'studio', status: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
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
});
