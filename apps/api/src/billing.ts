import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import { agents, and, asc, benchlineConnections, eq, getDb, inArray, memberships, sql, stripeEvents, users, workspaceSubscriptions } from '@forge/db';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { forgeCatalogPriceMismatch, hasPaidAccess, isPaidPlanKey, planForSubscription, publicCatalog, stripePlanForPriceId, stripePriceId } from './plans.js';
import { workspaceUsage } from './entitlements.js';
import { revokeBenchlineBundle } from './benchline.js';

type StripeSubscriptionShape = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ current_period_start?: number; current_period_end?: number; price?: { id: string } }> };
};

type StripeInvoiceShape = {
  subscription?: string | { id?: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
};

export function subscriptionEventForRetry(eventType: string, value: unknown) {
  return eventType.startsWith('customer.subscription.') ? value as StripeSubscriptionShape : undefined;
}

export function subscriptionIdFromInvoice(value: StripeInvoiceShape) {
  const subscription = value.parent?.subscription_details?.subscription ?? value.subscription;
  if (typeof subscription === 'string') return subscription;
  return subscription?.id;
}

export function revocationWorkspaceForDelivery(updatedWorkspaceId?: string, pendingWorkspaceId?: string) {
  return updatedWorkspaceId ?? pendingWorkspaceId;
}

const stripeClient = () => {
  const key = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(rk|sk)_(test|live)_/.test(key)) throw Object.assign(new Error('Stripe is not configured'), { statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia', appInfo: { name: 'Forge', version: '0.1.0' } });
};

const stripeExpectedLive = () => /^(rk|sk)_live_/.test(process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY || '');

const asDate = (value?: number) => value ? new Date(value * 1_000) : null;

export function normalizedBillingState(input?: { status?: string | null; cancelAtPeriodEnd?: boolean | null; graceUntil?: Date | null }, now = new Date()) {
  if (!input?.status || input.status === 'trial_eligible') return 'free';
  if (input.cancelAtPeriodEnd && ['active', 'trialing'].includes(input.status)) return 'cancel_scheduled';
  if (input.status === 'past_due') return input.graceUntil && input.graceUntil > now ? 'past_due_grace' : 'past_due_blocked';
  if (['active', 'trialing', 'checkout_pending', 'paused', 'canceled', 'incomplete'].includes(input.status)) return input.status;
  return input.status === 'unpaid' ? 'past_due_blocked' : 'reconciliation_required';
}

export function subscriptionSnapshotFromStripe(subscription: StripeSubscriptionShape, eventCreated: number, fallback?: { workspaceId?: string; planKey?: string }, env: NodeJS.ProcessEnv = process.env) {
  const firstItem = subscription.items?.data?.[0];
  const planKey = firstItem?.price?.id ? stripePlanForPriceId(firstItem.price.id, env).plan : subscription.metadata?.planKey ?? fallback?.planKey;
  const workspaceId = subscription.metadata?.workspaceId ?? fallback?.workspaceId;
  if (!workspaceId || !planKey || !isPaidPlanKey(planKey)) throw Object.assign(new Error('Stripe subscription metadata is incomplete'), { statusCode: 400, code: 'INVALID_SUBSCRIPTION_METADATA' });
  const status = subscription.status === 'canceled' ? 'canceled' : subscription.status;
  const graceUntil = status === 'past_due' ? new Date(eventCreated * 1_000 + Number(process.env.BILLING_GRACE_DAYS ?? 3) * 86_400_000) : null;
  return {
    workspaceId, planKey, status, stripeSubscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    currentPeriodStart: asDate(subscription.current_period_start ?? firstItem?.current_period_start),
    currentPeriodEnd: asDate(subscription.current_period_end ?? firstItem?.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end), graceUntil, providerUpdatedAt: new Date(eventCreated * 1_000), updatedAt: new Date(),
  };
}

export function shouldApplySubscriptionSnapshot(existing: { status: string; providerUpdatedAt: Date | null } | undefined, incoming: { status: string; providerUpdatedAt: Date }) {
  if (!existing?.providerUpdatedAt) return true;
  const delta = incoming.providerUpdatedAt.getTime() - existing.providerUpdatedAt.getTime();
  if (delta !== 0) return delta > 0;
  return !(['active', 'trialing'].includes(existing.status) && ['past_due', 'unpaid'].includes(incoming.status));
}

export function subscriptionWorkspaceLockKey(subscription: StripeSubscriptionShape, fallbackWorkspaceId?: string) {
  return subscription.metadata?.workspaceId ?? fallbackWorkspaceId;
}

export function activeAgentIdsToDisable(activeAgentIds: string[], activeAgentLimit: number) {
  return activeAgentIds.slice(activeAgentLimit);
}

async function requireOwner(request: FastifyRequest) {
  const auth = await requireAuth(request);
  const db = getDb();
  const [membership] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.workspaceId, auth.workspaceId), eq(memberships.userId, auth.userId))).limit(1);
  if (!membership || membership.role !== 'owner') throw Object.assign(new Error('Only a workspace owner can manage billing.'), { statusCode: 403, code: 'WORKSPACE_OWNER_REQUIRED' });
  return auth;
}

export function registerBillingRoutes(app: FastifyInstance) {
  app.get('/billing/catalog', async () => ({ plans: publicCatalog(), currencies: ['brl', 'usd'], taxExclusive: true, commercialStatus: 'approved' }));

  app.get('/billing/status', async (request) => {
    const auth = await requireAuth(request);
    const db = getDb();
    const usage = await workspaceUsage(auth.workspaceId);
    const [membership] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.workspaceId, auth.workspaceId), eq(memberships.userId, auth.userId))).limit(1);
    return {
      plan: usage.plan,
      agents: usage.agents,
      subscription: usage.subscription ? {
        status: usage.subscription.status,
        cancelAtPeriodEnd: usage.subscription.cancelAtPeriodEnd,
        currentPeriodStart: usage.subscription.currentPeriodStart,
        currentPeriodEnd: usage.subscription.currentPeriodEnd,
        graceUntil: usage.subscription.graceUntil,
      } : null,
      paidAccess: hasPaidAccess(usage.subscription ?? {}),
      normalizedState: normalizedBillingState(usage.subscription ?? undefined),
      portalAvailable: Boolean(usage.subscription?.stripeCustomerId),
      canManageBilling: membership?.role === 'owner',
    };
  });

  app.post('/billing/checkout', async (request) => {
    const auth = await requireOwner(request);
    const input = z.object({ plan: z.enum(['solo', 'studio', 'scale']), currency: z.enum(['brl', 'usd']).default('brl') }).parse(request.body ?? {});
    const db = getDb();
    const stripe = stripeClient();
    const configuredPriceId = stripePriceId(input.plan, input.currency);
    const providerPrice = await stripe.prices.retrieve(configuredPriceId, { expand: ['product'] });
    const priceMismatch = forgeCatalogPriceMismatch(input.plan, input.currency, providerPrice, stripeExpectedLive());
    if (priceMismatch) throw Object.assign(new Error(`Stripe Price ${priceMismatch} does not match the Forge catalog.`), { statusCode: 409, code: 'BILLING_CATALOG_MISMATCH' });
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, auth.userId)).limit(1);
    const now = new Date();
    const pendingUntil = new Date(now.getTime() - 40 * 60_000);
    const checkoutState = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${auth.workspaceId}::text))`);
      const [subscription] = await tx.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, auth.workspaceId)).limit(1);
      if (subscription?.stripeSubscriptionId && !['canceled', 'incomplete_expired'].includes(subscription.status)) {
        throw Object.assign(new Error('Use o portal Stripe para gerenciar a assinatura existente.'), { statusCode: 409, code: 'USE_BILLING_PORTAL' });
      }
      if (subscription?.status === 'checkout_pending' && subscription.updatedAt > pendingUntil) {
        throw Object.assign(new Error('Um Checkout já está em andamento. Aguarde a confirmação ou tente novamente em alguns minutos.'), { statusCode: 409, code: 'CHECKOUT_IN_PROGRESS' });
      }
      let customerId = subscription?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({ email: user?.email, metadata: { workspaceId: auth.workspaceId, ownerBrand: 'netolabs', productKey: 'forge' } }, { idempotencyKey: `forge-customer-${auth.workspaceId}` });
        customerId = customer.id;
      }
      const previousStatus = subscription?.status ?? 'trial_eligible';
      await tx.insert(workspaceSubscriptions).values({ workspaceId: auth.workspaceId, stripeCustomerId: customerId, status: 'checkout_pending' }).onConflictDoUpdate({ target: workspaceSubscriptions.workspaceId, set: { stripeCustomerId: customerId, status: 'checkout_pending', updatedAt: now } });
      return { customerId, previousStatus };
    });
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
    try {
      const lease = Math.floor(now.getTime() / (40 * 60_000));
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription', customer: checkoutState.customerId, client_reference_id: auth.workspaceId,
        line_items: [{ price: configuredPriceId, quantity: 1 }],
        success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/billing?checkout=canceled`, allow_promotion_codes: true,
        metadata: { workspaceId: auth.workspaceId, planKey: input.plan, ownerBrand: 'netolabs', productKey: 'forge' },
        subscription_data: { metadata: { workspaceId: auth.workspaceId, planKey: input.plan, ownerBrand: 'netolabs', productKey: 'forge' } },
      }, { idempotencyKey: `forge-checkout-${auth.workspaceId}-${input.plan}-${input.currency}-${lease}` });
      return { url: session.url };
    } catch (error) {
      await db.update(workspaceSubscriptions).set({ status: checkoutState.previousStatus, updatedAt: new Date() }).where(and(eq(workspaceSubscriptions.workspaceId, auth.workspaceId), eq(workspaceSubscriptions.status, 'checkout_pending')));
      throw error;
    }
  });

  app.post('/billing/portal', async (request) => {
    const auth = await requireOwner(request);
    const db = getDb();
    const [subscription] = await db.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, auth.workspaceId)).limit(1);
    if (!subscription?.stripeCustomerId) throw Object.assign(new Error('No billing account is connected yet.'), { statusCode: 409, code: 'NO_BILLING_ACCOUNT' });
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
    const returnUrl = `${origin}/billing`;
    const portalConfigurationId = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
    const session = await stripeClient().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
      ...(portalConfigurationId ? { configuration: portalConfigurationId } : {}),
    });
    return { url: session.url };
  });

  app.post('/billing/webhook', { config: { rawBody: true } }, async (request, reply) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw Object.assign(new Error('Stripe webhook is not configured'), { statusCode: 503 });
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    const signature = request.headers['stripe-signature'];
    if (!rawBody || typeof signature !== 'string') return reply.code(400).send({ message: 'Missing signed raw webhook body' });
    const stripe = stripeClient();
    const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.livemode !== stripeExpectedLive()) return reply.code(400).send({ message: 'Stripe event mode does not match this environment', code: 'BILLING_MODE_MISMATCH' });
    const subscriptionEvent = subscriptionEventForRetry(event.type, event.data.object);
    const invoiceSubscriptionId = event.type === 'invoice.paid' || event.type === 'invoice.payment_failed'
      ? subscriptionIdFromInvoice(event.data.object as StripeInvoiceShape)
      : undefined;
    // Stripe events only have second-level timestamps. Fetching the canonical
    // subscription prevents two same-second deliveries from restoring stale state.
    const canonicalSubscriptionId = subscriptionEvent?.id ?? invoiceSubscriptionId;
    const canonicalSubscription = canonicalSubscriptionId
      ? await stripe.subscriptions.retrieve(canonicalSubscriptionId) as unknown as StripeSubscriptionShape
      : undefined;
    const db = getDb();
    let revokeWorkspaceId: string | undefined;
    const eventSubscriptionId = canonicalSubscription?.id ?? subscriptionEvent?.id;
    const processed = await db.transaction(async (tx) => {
      const inserted = await tx.insert(stripeEvents).values({ eventId: event.id, type: event.type, payloadHash: createHash('sha256').update(rawBody).digest('hex'), providerCreatedAt: new Date(event.created * 1_000) }).onConflictDoNothing().returning({ eventId: stripeEvents.eventId });
      if (!inserted.length) return false;
      if (canonicalSubscription) {
        const value = canonicalSubscription!;
        const workspaceLockKey = subscriptionWorkspaceLockKey(value);
        if (workspaceLockKey) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${workspaceLockKey}::text))`);
        await tx.execute(sql`select workspace_id from workspace_subscriptions where stripe_subscription_id = ${value.id} for update`);
        const [existing] = await tx.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.stripeSubscriptionId, value.id)).limit(1);
        const snapshot = subscriptionSnapshotFromStripe(value, event.created, existing ? { workspaceId: existing.workspaceId, planKey: existing.planKey } : undefined);
        if (shouldApplySubscriptionSnapshot(existing, snapshot)) {
          await tx.insert(workspaceSubscriptions).values(snapshot).onConflictDoUpdate({ target: workspaceSubscriptions.workspaceId, set: snapshot });
          const activePlan = planForSubscription(snapshot);
          const activeAgents = await tx.select({ id: agents.id }).from(agents)
            .where(and(eq(agents.workspaceId, snapshot.workspaceId), inArray(agents.status, ['draft', 'ready'])))
            .orderBy(asc(agents.createdAt), asc(agents.id));
          const excessAgentIds = activeAgentIdsToDisable(activeAgents.map((agent) => agent.id), activePlan.activeAgentLimit);
          if (excessAgentIds.length) {
            await tx.update(agents).set({ status: 'disabled', updatedAt: new Date() }).where(inArray(agents.id, excessAgentIds));
          }
          if (!hasPaidAccess(snapshot)) {
            revokeWorkspaceId = snapshot.workspaceId;
            await tx.update(benchlineConnections).set({ status: 'revocation_pending', updatedAt: new Date() }).where(eq(benchlineConnections.workspaceId, snapshot.workspaceId));
          }
        }
      }
      return true;
    });
    let pendingWorkspaceId: string | undefined;
    if (!revokeWorkspaceId && eventSubscriptionId) {
      const [subscription] = await db.select({ workspaceId: workspaceSubscriptions.workspaceId }).from(workspaceSubscriptions).where(eq(workspaceSubscriptions.stripeSubscriptionId, eventSubscriptionId)).limit(1);
      if (subscription) {
        const [connection] = await db.select({ status: benchlineConnections.status }).from(benchlineConnections).where(eq(benchlineConnections.workspaceId, subscription.workspaceId)).limit(1);
        if (connection?.status === 'revocation_pending') pendingWorkspaceId = subscription.workspaceId;
      }
    }
    revokeWorkspaceId = revocationWorkspaceForDelivery(revokeWorkspaceId, pendingWorkspaceId);
    if (revokeWorkspaceId) {
      const revocation = await revokeBenchlineBundle(revokeWorkspaceId);
      if (!revocation.remoteSynced) throw Object.assign(new Error('Benchline revocation is pending reconciliation.'), { statusCode: 503, code: 'BENCHLINE_REVOCATION_PENDING' });
    }
    return reply.send({ received: true, duplicate: !processed });
  });
}
