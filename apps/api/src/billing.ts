import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import { agents, and, asc, benchlineConnections, eq, getDb, inArray, memberships, stripeEvents, users, workspaceSubscriptions } from '@forge/db';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { hasPaidAccess, isPaidPlanKey, planForSubscription, publicCatalog, stripePlanForPriceId, stripePriceId } from './plans.js';
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

export function subscriptionEventForRetry(eventType: string, value: unknown) {
  return eventType.startsWith('customer.subscription.') ? value as StripeSubscriptionShape : undefined;
}

export function revocationWorkspaceForDelivery(updatedWorkspaceId?: string, pendingWorkspaceId?: string) {
  return updatedWorkspaceId ?? pendingWorkspaceId;
}

const stripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe is not configured'), { statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' });
};

const asDate = (value?: number) => value ? new Date(value * 1_000) : null;

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
  app.get('/billing/catalog', async () => ({ plans: publicCatalog(), currency: 'brl', hypothesis: true }));

  app.get('/billing/status', async (request) => {
    const auth = await requireAuth(request);
    const usage = await workspaceUsage(auth.workspaceId);
    return { ...usage, paidAccess: hasPaidAccess(usage.subscription ?? {}) };
  });

  app.post('/billing/checkout', async (request) => {
    const auth = await requireOwner(request);
    const input = z.object({ plan: z.enum(['solo', 'studio', 'scale']), currency: z.enum(['brl', 'usd']).default('brl') }).parse(request.body ?? {});
    const db = getDb();
    const stripe = stripeClient();
    const [subscription] = await db.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, auth.workspaceId)).limit(1);
    if (subscription && hasPaidAccess(subscription)) throw Object.assign(new Error('Use o portal Stripe para alterar um plano ativo.'), { statusCode: 409, code: 'USE_BILLING_PORTAL' });
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, auth.userId)).limit(1);
    let customerId = subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user?.email, metadata: { workspaceId: auth.workspaceId } }, { idempotencyKey: `forge-customer-${auth.workspaceId}` });
      customerId = customer.id;
      await db.insert(workspaceSubscriptions).values({ workspaceId: auth.workspaceId, stripeCustomerId: customerId }).onConflictDoUpdate({ target: workspaceSubscriptions.workspaceId, set: { stripeCustomerId: customerId, updatedAt: new Date() } });
    }
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId, client_reference_id: auth.workspaceId,
      line_items: [{ price: stripePriceId(input.plan, input.currency), quantity: 1 }],
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=canceled`, allow_promotion_codes: true,
      metadata: { workspaceId: auth.workspaceId, planKey: input.plan },
      subscription_data: { metadata: { workspaceId: auth.workspaceId, planKey: input.plan } },
    }, { idempotencyKey: `forge-checkout-${auth.workspaceId}-${input.plan}-${input.currency}-${new Date().toISOString().slice(0, 10)}` });
    return { url: session.url };
  });

  app.post('/billing/portal', async (request) => {
    const auth = await requireOwner(request);
    const db = getDb();
    const [subscription] = await db.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, auth.workspaceId)).limit(1);
    if (!subscription?.stripeCustomerId || !subscription.stripeSubscriptionId || !hasPaidAccess(subscription)) throw Object.assign(new Error('No active billing subscription is connected yet.'), { statusCode: 409, code: 'NO_BILLING_ACCOUNT' });
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
    const returnUrl = `${origin}/billing`;
    const session = await stripeClient().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
      flow_data: {
        type: 'subscription_cancel',
        subscription_cancel: { subscription: subscription.stripeSubscriptionId },
        after_completion: { type: 'redirect', redirect: { return_url: returnUrl } },
      },
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
    const subscriptionEvent = subscriptionEventForRetry(event.type, event.data.object);
    // Stripe events only have second-level timestamps. Fetching the canonical
    // subscription prevents two same-second deliveries from restoring stale state.
    const canonicalSubscription = subscriptionEvent
      ? await stripe.subscriptions.retrieve(subscriptionEvent.id) as unknown as StripeSubscriptionShape
      : undefined;
    const db = getDb();
    let revokeWorkspaceId: string | undefined;
    const eventSubscriptionId = canonicalSubscription?.id ?? subscriptionEvent?.id;
    const processed = await db.transaction(async (tx) => {
      const inserted = await tx.insert(stripeEvents).values({ eventId: event.id, type: event.type, payloadHash: createHash('sha256').update(rawBody).digest('hex'), providerCreatedAt: new Date(event.created * 1_000) }).onConflictDoNothing().returning({ eventId: stripeEvents.eventId });
      if (!inserted.length) return false;
      if (event.type.startsWith('customer.subscription.')) {
        const value = canonicalSubscription!;
        const [existing] = await tx.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.stripeSubscriptionId, value.id)).limit(1);
        const snapshot = subscriptionSnapshotFromStripe(value, event.created, existing ? { workspaceId: existing.workspaceId, planKey: existing.planKey } : undefined);
        if (!existing?.providerUpdatedAt || existing.providerUpdatedAt <= snapshot.providerUpdatedAt) {
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
