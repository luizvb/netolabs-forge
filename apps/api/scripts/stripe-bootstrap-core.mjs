export const catalogVersion = '2026-07-14';
export const productSpec = {
  name: 'Forge',
  description: 'A controlled workspace to build, ground, and evaluate dependable AI agents.',
  taxCode: 'txcd_10103001',
  metadata: { owner_brand: 'netolabs', product_key: 'forge', repo_slug: 'netolabs-forge', canonical_url: 'https://forge.netolabs.dev', catalog_version: catalogVersion, commercial_status: 'sandbox_hypothesis' },
};

export const plans = [
  ['solo', 'brl', 14900], ['solo', 'usd', 2900],
  ['studio', 'brl', 34900], ['studio', 'usd', 6900],
  ['scale', 'brl', 89900], ['scale', 'usd', 17900],
].map(([plan, currency, cents]) => ({ plan, currency, cents, key: `forge_${plan}_monthly_${currency}`, env: `STRIPE_PRICE_${String(plan).toUpperCase()}_${String(currency).toUpperCase()}` }));

export function keyMode(secret) {
  if (/^(rk|sk)_test_/.test(secret ?? '')) return 'test';
  if (/^(rk|sk)_live_/.test(secret ?? '')) return 'live';
  throw new Error('Stripe key prefix is invalid.');
}

export function assertBootstrapGate({ secret, apply, targetAccount, allowLive }) {
  const mode = keyMode(secret);
  if (apply && !targetAccount?.startsWith('acct_')) throw new Error('Apply requires --account acct_... to pin the target account.');
  if (mode === 'live' && allowLive !== true) throw new Error('Refusing live-mode Forge catalog mutation without both --allow-live and ALLOW_STRIPE_LIVE_BOOTSTRAP=true.');
  return mode;
}

export function priceMetadata(plan) {
  return { owner_brand: 'netolabs', product_key: 'forge', package_key: plan.plan, entitlement_key: 'forge_plan_access', catalog_version: catalogVersion, commercial_status: 'sandbox_hypothesis' };
}

export function priceMismatch(plan, price, productId, expectedLive) {
  if (!price.active) return 'inactive';
  if ((typeof price.product === 'string' ? price.product : price.product?.id) !== productId) return 'parent';
  if (price.livemode !== expectedLive) return 'mode';
  if (price.currency !== plan.currency) return 'currency';
  if (price.unit_amount !== plan.cents) return 'amount';
  if (price.tax_behavior !== 'exclusive') return 'tax_behavior';
  if (price.type !== 'recurring' || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1) return 'cadence';
  return null;
}

export function priceMutableMismatch(plan, price) {
  const metadata = priceMetadata(plan);
  return price.nickname !== plan.key || Object.entries(metadata).some(([key, value]) => price.metadata?.[key] !== value);
}
