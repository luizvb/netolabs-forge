import { describe, expect, it } from 'vitest';
import { billingLifecyclePresentation, forgeCheckoutBody, forgePriceLabel } from './Billing';

const base = {
  plan: { key: 'solo', name: 'Solo', prices: { brl: 149, usd: 29 }, activeAgentLimit: 1, storedAgentLimit: 1, requestsPerActiveAgent: 1_500, totalIncludedRequests: 1_500, trialDurationDays: 7, trialRequestsPerWorkspace: 50, benchlineIncluded: true },
  subscription: { status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-08-14T00:00:00Z', graceUntil: null },
} as const;

describe('Forge billing lifecycle presentation', () => {
  it('uses renewal copy only for an active subscription', () => {
    expect(billingLifecyclePresentation({ ...base, normalizedState: 'active' }, 'pt-BR')).toMatchObject({ title: 'Pagamento confirmado', detail: expect.stringContaining('Renova em') });
  });

  it('explains the automatic charge while the Premium trial is active', () => {
    const presentation = billingLifecyclePresentation({ ...base, normalizedState: 'trialing', subscription: { ...base.subscription, status: 'trialing', trialEndsAt: '2026-07-22T00:00:00Z' } }, 'pt-BR');
    expect(presentation).toMatchObject({ title: 'Premium em teste', detail: expect.stringContaining('50 runs') });
    expect(presentation?.detail).toContain('cobrado automaticamente');
  });

  it('uses access-until copy for scheduled cancellation', () => {
    const presentation = billingLifecyclePresentation({ ...base, normalizedState: 'cancel_scheduled' }, 'pt-BR');
    expect(presentation).toMatchObject({ title: 'Cancelamento agendado', detail: expect.stringContaining('continua até') });
    expect(presentation?.detail).not.toContain('Renova em');
  });

  it('shows recovery and preserved-history states', () => {
    expect(billingLifecyclePresentation({ ...base, normalizedState: 'past_due_blocked' }, 'pt-BR')?.title).toBe('Pagamento precisa de atenção');
    expect(billingLifecyclePresentation({ ...base, normalizedState: 'canceled' }, 'pt-BR')?.detail).toContain('continuam preservados');
  });

  it('formats the approved BRL/USD monthly offers explicitly', () => {
    expect(forgePriceLabel(149, 'brl')).toMatch(/^R\$\s?149$/);
    expect(forgePriceLabel(29, 'usd')).toMatch(/^US\$\s?29$/);
  });

  it('sends the selected allowlisted currency to Checkout', () => {
    expect(JSON.parse(forgeCheckoutBody('studio', 'usd'))).toEqual({ plan: 'studio', currency: 'usd' });
    expect(JSON.parse(forgeCheckoutBody('solo', 'brl'))).toEqual({ plan: 'solo', currency: 'brl' });
  });
});
