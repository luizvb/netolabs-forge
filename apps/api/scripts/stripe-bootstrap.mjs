import Stripe from 'stripe';
import { assertBootstrapGate, plans, priceMetadata, priceMismatch, priceMutableMismatch, productSpec } from './stripe-bootstrap-core.mjs';

const args = new Set(process.argv.slice(2));
const valueAfter = (flag) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : undefined; };
const apply = args.has('--apply');
const allowLive = args.has('--allow-live') && process.env.ALLOW_STRIPE_LIVE_BOOTSTRAP === 'true';
const targetAccount = valueAfter('--account') ?? process.env.STRIPE_TARGET_ACCOUNT;
const secret = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
if (!secret) throw new Error('Set STRIPE_RESTRICTED_KEY (preferred) or STRIPE_SECRET_KEY in the shell. Never paste it into this script.');
const mode = assertBootstrapGate({ secret, apply, targetAccount, allowLive });
if (!secret.startsWith('rk_')) process.stderr.write('Warning: prefer a least-privilege restricted Stripe key per service/environment.\n');

const stripe = new Stripe(secret, { apiVersion: '2026-06-24.dahlia', appInfo: { name: 'Forge catalog bootstrap', version: '1.0.0' } });
const account = await stripe.accounts.retrieve();
if (targetAccount && account.id !== targetAccount) throw new Error(`Authenticated Stripe account does not match explicit target account ${targetAccount}.`);
const expectedLive = mode === 'live';
const remoteProducts = [];
for await (const product of stripe.products.list({ limit: 100 })) remoteProducts.push(product);
const stable = remoteProducts.filter((product) => product.metadata?.owner_brand === 'netolabs' && product.metadata?.product_key === 'forge');
const active = stable.filter((product) => product.active);
if (active.length > 1) throw new Error('Multiple active Forge Products have stable NetoLabs metadata; select a canonical Product manually.');
const nameOnly = remoteProducts.filter((product) => product.active && product.name.toLowerCase() === 'forge' && !stable.includes(product));
if (nameOnly.length) process.stderr.write(`Manual review: ${nameOnly.length} name-only Forge Product(s) were not adopted or archived.\n`);

let product = active[0] ?? stable[0];
if (!product) {
  product = apply
    ? await stripe.products.create({ name: productSpec.name, description: productSpec.description, tax_code: productSpec.taxCode, metadata: productSpec.metadata }, { idempotencyKey: 'netolabs-product:forge:2026-07-14' })
    : { id: '<create:forge>', name: productSpec.name, metadata: productSpec.metadata, active: true };
} else {
  const metadataDiffers = Object.entries(productSpec.metadata).some(([key, value]) => product.metadata?.[key] !== value);
  if (apply && (!product.active || product.name !== productSpec.name || product.description !== productSpec.description || product.tax_code !== productSpec.taxCode || metadataDiffers)) product = await stripe.products.update(product.id, { active: true, name: productSpec.name, description: productSpec.description, tax_code: productSpec.taxCode, metadata: productSpec.metadata });
}

process.stdout.write(`# Forge Stripe catalog (${mode}, ${apply ? 'apply' : 'dry-run'}, sandbox hypothesis)\nPRODUCT_FORGE=${product.id}\n`);
for (const plan of plans) {
  const existing = await stripe.prices.list({ lookup_keys: [plan.key], limit: 100, expand: ['data.product'] });
  let price = existing.data.find((candidate) => !priceMismatch(plan, candidate, product.id, expectedLive));
  if (price && apply && priceMutableMismatch(plan, price)) price = await stripe.prices.update(price.id, { nickname: plan.key, metadata: priceMetadata(plan) });
  if (!price) {
    price = !apply || product.id.startsWith('<create:')
      ? { id: `<create:${plan.key}>` }
      : await stripe.prices.create({
        product: product.id, currency: plan.currency, unit_amount: plan.cents, tax_behavior: 'exclusive', nickname: plan.key,
        lookup_key: plan.key, transfer_lookup_key: true, recurring: { interval: 'month' }, metadata: priceMetadata(plan),
      }, { idempotencyKey: `netolabs-price:${plan.key}:2026-07-14` });
    if (existing.data.length) process.stderr.write(`Preserved ${existing.data.length} historical/mismatched Price(s) for ${plan.key}; no automatic archive was attempted.\n`);
  }
  process.stdout.write(`${plan.env}=${price.id}\n`);
}
process.stdout.write('STRIPE_WEBHOOK_SECRET=<from the signed test webhook endpoint; never commit this value>\n');
