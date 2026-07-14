export type PlanKey = 'trial' | 'solo' | 'studio' | 'scale';
export type PaidPlanKey = Exclude<PlanKey, 'trial'>;
export type BillingCurrency = 'brl' | 'usd';

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  prices: Record<BillingCurrency, number> | null;
  activeAgentLimit: number;
  storedAgentLimit: number | null;
  requestsPerActiveAgent: number;
  totalIncludedRequests: number;
  trialRequestsPerLineage: number;
  benchlineIncluded: boolean;
};

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  trial: { key: 'trial', name: 'Teste', prices: null, activeAgentLimit: 1, storedAgentLimit: 1, requestsPerActiveAgent: 0, totalIncludedRequests: 0, trialRequestsPerLineage: 30, benchlineIncluded: false },
  solo: { key: 'solo', name: 'Solo', prices: { brl: 149, usd: 29 }, activeAgentLimit: 1, storedAgentLimit: 1, requestsPerActiveAgent: 1_500, totalIncludedRequests: 1_500, trialRequestsPerLineage: 30, benchlineIncluded: true },
  studio: { key: 'studio', name: 'Studio', prices: { brl: 349, usd: 69 }, activeAgentLimit: 3, storedAgentLimit: 3, requestsPerActiveAgent: 1_500, totalIncludedRequests: 4_500, trialRequestsPerLineage: 30, benchlineIncluded: true },
  scale: { key: 'scale', name: 'Scale', prices: { brl: 899, usd: 179 }, activeAgentLimit: 10, storedAgentLimit: null, requestsPerActiveAgent: 1_500, totalIncludedRequests: 15_000, trialRequestsPerLineage: 30, benchlineIncluded: true },
};

export const paidPlanKeys = ['solo', 'studio', 'scale'] as const;
export const isPaidPlanKey = (value: string): value is PaidPlanKey => paidPlanKeys.includes(value as PaidPlanKey);

export function publicCatalog() {
  return paidPlanKeys.map((key) => PLAN_CATALOG[key]);
}

export function stripePriceId(plan: PaidPlanKey, currency: BillingCurrency, env: NodeJS.ProcessEnv = process.env) {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${currency.toUpperCase()}`;
  const value = env[key]?.trim();
  if (!value) throw Object.assign(new Error(`Stripe price is not configured for ${plan}/${currency}`), { statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });
  return value;
}

export function stripePlanForPriceId(priceId: string, env: NodeJS.ProcessEnv = process.env) {
  for (const plan of paidPlanKeys) {
    for (const currency of ['brl', 'usd'] as const) {
      const configuredPriceId = env[`STRIPE_PRICE_${plan.toUpperCase()}_${currency.toUpperCase()}`]?.trim();
      if (configuredPriceId && configuredPriceId === priceId) return { plan, currency };
    }
  }
  throw Object.assign(new Error('Stripe subscription uses an unknown price.'), { statusCode: 400, code: 'BILLING_UNKNOWN_PRICE' });
}

export type StripeCatalogPrice = {
  id: string;
  active?: boolean;
  livemode?: boolean;
  currency?: string;
  unit_amount?: number | null;
  type?: string;
  recurring?: { interval?: string; interval_count?: number } | null;
  metadata?: Record<string, string>;
  product?: string | { deleted?: boolean | void; metadata?: Record<string, string> };
};

export function forgeCatalogPriceMismatch(plan: PaidPlanKey, currency: BillingCurrency, price: StripeCatalogPrice, expectedLive: boolean, env: NodeJS.ProcessEnv = process.env) {
  if (price.id !== stripePriceId(plan, currency, env)) return 'identity';
  if (!price.active) return 'inactive';
  if (price.livemode !== expectedLive) return 'mode';
  if (price.currency !== currency) return 'currency';
  if (price.unit_amount !== PLAN_CATALOG[plan].prices![currency] * 100) return 'amount';
  if (price.type !== 'recurring' || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1) return 'cadence';
  if (price.metadata?.owner_brand !== 'netolabs' || price.metadata?.product_key !== 'forge' || price.metadata?.package_key !== plan || price.metadata?.entitlement_key !== 'forge_plan_access' || price.metadata?.catalog_version !== '2026-07-14' || price.metadata?.commercial_status !== 'approved') return 'metadata';
  const product = typeof price.product === 'string' ? null : price.product;
  if (!product || product.deleted || product.metadata?.owner_brand !== 'netolabs' || product.metadata?.product_key !== 'forge') return 'parent';
  return null;
}

export function hasPaidAccess(input: { planKey?: string | null; status?: string | null; graceUntil?: Date | null }, now = new Date()) {
  if (!input.planKey || !isPaidPlanKey(input.planKey)) return false;
  if (input.status === 'active' || input.status === 'trialing') return true;
  return input.status === 'past_due' && Boolean(input.graceUntil && input.graceUntil > now);
}

export function planForSubscription(input?: { planKey?: string | null; status?: string | null; graceUntil?: Date | null }, now = new Date()) {
  if (!input || !hasPaidAccess(input, now) || !input.planKey || !isPaidPlanKey(input.planKey)) return PLAN_CATALOG.trial;
  return PLAN_CATALOG[input.planKey];
}

export function assertAgentCapacity(plan: PlanDefinition, counts: { stored: number; active: number }, desiredStatus: 'draft' | 'ready' | 'disabled' = 'ready') {
  if (plan.storedAgentLimit !== null && counts.stored >= plan.storedAgentLimit) {
    throw Object.assign(new Error(`O plano ${plan.name} permite ${plan.storedAgentLimit} agente(s) armazenado(s).`), { statusCode: 402, code: 'AGENT_STORAGE_LIMIT' });
  }
  if (desiredStatus !== 'disabled' && counts.active >= plan.activeAgentLimit) {
    throw Object.assign(new Error(`O plano ${plan.name} permite ${plan.activeAgentLimit} agente(s) ativo(s).`), { statusCode: 402, code: 'ACTIVE_AGENT_LIMIT' });
  }
}
