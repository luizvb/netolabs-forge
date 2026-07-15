import { randomUUID } from 'node:crypto';
import { agentUsageCounters, agents, and, asc, eq, getDb, inArray, requestReservations, sql, workspaceSubscriptions } from '@forge/db';
import { PLAN_CATALOG, firstCommercialPlan, hasPaidAccess, hasPaidRequestAllowance, isPaidPlanKey, planForSubscription, type PlanDefinition } from './plans.js';

type Counter = { trialConsumed: number; trialReserved: number; paidConsumed: number; paidReserved: number };
type UsageAccess = { trial: boolean; paid: boolean };

export function aggregateTrialUsage(counters: Array<Pick<Counter, 'trialConsumed' | 'trialReserved'>>) {
  return counters.reduce((total, item) => ({
    consumed: total.consumed + item.trialConsumed,
    reserved: total.reserved + item.trialReserved,
  }), { consumed: 0, reserved: 0 });
}

export function chooseUsageBucket(counter: Counter, access: UsageAccess, requestsPerAgent = 1_500, renewalAt: Date | null = null, trialEndsAt: Date | null = null, trialRequestLimit = firstCommercialPlan().trialRequestsPerWorkspace) {
  if (access.trial && counter.trialConsumed + counter.trialReserved < trialRequestLimit) return 'trial' as const;
  if (access.paid && counter.paidConsumed + counter.paidReserved < requestsPerAgent) return 'paid' as const;
  const message = access.paid
    ? 'Este agente atingiu a franquia mensal de requisições.'
    : access.trial
      ? `As ${trialRequestLimit.toLocaleString('pt-BR')} execuções incluídas no teste terminaram. Assine um plano para continuar.`
      : 'Seu período de teste terminou. Assine um plano e adicione uma forma de pagamento para continuar.';
  throw Object.assign(new Error(message), {
    statusCode: 402,
    code: 'USAGE_EXHAUSTED',
    details: {
      exhaustedBucket: access.paid ? 'paid' : 'trial',
      trial: { used: counter.trialConsumed, reserved: counter.trialReserved, limit: trialRequestLimit, endsAt: trialEndsAt?.toISOString() ?? null },
      paid: { used: counter.paidConsumed, reserved: counter.paidReserved, limit: requestsPerAgent },
      renewalAt: renewalAt?.toISOString() ?? null,
    },
  });
}

export function shouldReleaseFailedRequest(error: unknown) {
  const value = error as { statusCode?: number; code?: string } | null;
  return Boolean(value && (value.statusCode === 400 || value.statusCode === 401 || value.code === 'MODEL_NOT_CONFIGURED' || value.code === 'MODEL_VALIDATION_FAILED'));
}

export function agentCreationStatus(plan: PlanDefinition, counts: { stored: number; active: number }) {
  if (plan.storedAgentLimit !== null && counts.stored >= plan.storedAgentLimit) throw Object.assign(new Error(`O plano ${plan.name} permite ${plan.storedAgentLimit} agente(s) armazenado(s).`), { statusCode: 402, code: 'AGENT_STORAGE_LIMIT' });
  if (counts.active >= plan.activeAgentLimit) {
    if (plan.storedAgentLimit === null) return 'disabled' as const;
    throw Object.assign(new Error(`O plano ${plan.name} permite ${plan.activeAgentLimit} agente(s) ativo(s).`), { statusCode: 402, code: 'ACTIVE_AGENT_LIMIT' });
  }
  return 'ready' as const;
}

export async function createAgentWithCapacity(workspaceId: string, values: Omit<typeof agents.$inferInsert, 'workspaceId' | 'status'>) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${workspaceId}::text))`);
    const [subscription, rows] = await Promise.all([
      tx.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, workspaceId)).limit(1),
      tx.select({ status: agents.status }).from(agents).where(eq(agents.workspaceId, workspaceId)),
    ]);
    assertPlanAccess(subscription[0]);
    const plan = planForSubscription(subscription[0]);
    const status = agentCreationStatus(plan, { stored: rows.length, active: rows.filter((row) => row.status !== 'disabled').length });
    const [agent] = await tx.insert(agents).values({ ...values, workspaceId, status }).returning();
    return { agent, storedInactive: status === 'disabled' };
  });
}

export async function setAgentActivation(workspaceId: string, agentId: string, active: boolean) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${workspaceId}::text))`);
    const [[agent], [subscription], rows] = await Promise.all([
      tx.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId))).limit(1),
      tx.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, workspaceId)).limit(1),
      tx.select({ id: agents.id, status: agents.status }).from(agents).where(eq(agents.workspaceId, workspaceId)),
    ]);
    if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 });
    if (active) assertPlanAccess(subscription);
    const plan = planForSubscription(subscription);
    if (active && agent.status === 'disabled' && rows.filter((row) => row.status !== 'disabled' && row.id !== agentId).length >= plan.activeAgentLimit) throw Object.assign(new Error(`O plano ${plan.name} já atingiu o limite de agentes ativos.`), { statusCode: 402, code: 'ACTIVE_AGENT_LIMIT' });
    const [updated] = await tx.update(agents).set({ status: active ? 'ready' : 'disabled', updatedAt: new Date() }).where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId))).returning();
    return updated;
  });
}

export async function reserveAgentRequest(input: { workspaceId: string; agentId: string; idempotencyKey?: string }) {
  const db = getDb();
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}::text))`);
    const [agent] = await tx.select({ id: agents.id, lineageId: agents.lineageId, status: agents.status }).from(agents).where(and(eq(agents.id, input.agentId), eq(agents.workspaceId, input.workspaceId))).limit(1);
    if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 });
    if (agent.status === 'disabled') throw Object.assign(new Error('Ative o agente antes de executar uma conversa.'), { statusCode: 409, code: 'AGENT_DISABLED' });
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${agent.lineageId}::text))`);

    const [existing] = await tx.select().from(requestReservations).where(and(eq(requestReservations.workspaceId, input.workspaceId), eq(requestReservations.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) return { ...existing, reused: true };

    const [[subscription], activeAgents] = await Promise.all([
      tx.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, input.workspaceId)).limit(1),
      tx.select({ id: agents.id }).from(agents)
        .where(and(eq(agents.workspaceId, input.workspaceId), inArray(agents.status, ['draft', 'ready'])))
        .orderBy(asc(agents.createdAt), asc(agents.id)),
    ]);
    const plan = planForSubscription(subscription);
    const activeAgentPosition = activeAgents.findIndex((row) => row.id === agent.id);
    if (activeAgentPosition < 0 || activeAgentPosition >= plan.activeAgentLimit) {
      throw Object.assign(new Error(`O plano ${plan.name} não inclui este slot de agente ativo.`), { statusCode: 402, code: 'ACTIVE_AGENT_LIMIT' });
    }
    await tx.insert(agentUsageCounters).values({ lineageId: agent.lineageId, workspaceId: input.workspaceId, agentId: agent.id }).onConflictDoNothing();
    let [counter] = await tx.select().from(agentUsageCounters).where(eq(agentUsageCounters.lineageId, agent.lineageId)).limit(1);
    if (!counter) throw new Error('Usage counter could not be initialized');

    const periodChanged = Boolean(subscription?.currentPeriodStart && (!counter.periodStart || counter.periodStart.getTime() !== subscription.currentPeriodStart.getTime()));
    if (periodChanged) {
      [counter] = await tx.update(agentUsageCounters).set({ paidConsumed: 0, paidReserved: 0, periodStart: subscription!.currentPeriodStart, periodEnd: subscription!.currentPeriodEnd, updatedAt: new Date() }).where(eq(agentUsageCounters.lineageId, agent.lineageId)).returning();
    }
    const workspaceCounters = await tx.select().from(agentUsageCounters).where(eq(agentUsageCounters.workspaceId, input.workspaceId));
    const workspaceTrialTotals = aggregateTrialUsage(workspaceCounters);
    const workspaceTrial: Counter = { trialConsumed: workspaceTrialTotals.consumed, trialReserved: workspaceTrialTotals.reserved, paidConsumed: counter.paidConsumed, paidReserved: counter.paidReserved };
    const trialActive = ['trialing', 'checkout_pending'].includes(subscription?.status ?? '') && Boolean(subscription?.trialEndsAt && subscription.trialEndsAt > new Date());
    const trialPlan = subscription?.planKey && isPaidPlanKey(subscription.planKey) ? PLAN_CATALOG[subscription.planKey] : firstCommercialPlan();
    const bucket = chooseUsageBucket(workspaceTrial, { trial: trialActive, paid: hasPaidRequestAllowance(subscription ?? {}) }, plan.requestsPerActiveAgent || trialPlan.requestsPerActiveAgent, subscription?.currentPeriodEnd ?? null, subscription?.trialEndsAt ?? null, trialPlan.trialRequestsPerWorkspace);
    const [reservation] = await tx.insert(requestReservations).values({ idempotencyKey, workspaceId: input.workspaceId, agentId: agent.id, lineageId: agent.lineageId, bucket, periodStart: bucket === 'paid' ? subscription?.currentPeriodStart : null }).returning();
    await tx.update(agentUsageCounters).set(bucket === 'trial'
      ? { trialReserved: sql`${agentUsageCounters.trialReserved} + 1`, updatedAt: new Date() }
      : { paidReserved: sql`${agentUsageCounters.paidReserved} + 1`, updatedAt: new Date() }
    ).where(eq(agentUsageCounters.lineageId, agent.lineageId));
    return { ...reservation, reused: false };
  });
}

export async function settleAgentRequest(reservationId: string, outcome: 'commit' | 'release') {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(requestReservations).where(eq(requestReservations.id, reservationId)).limit(1);
    if (!reservation || reservation.status !== 'reserved') return reservation ?? null;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${reservation.lineageId}::text))`);
    const trial = reservation.bucket === 'trial';
    await tx.update(agentUsageCounters).set(trial
      ? { trialReserved: sql`greatest(0, ${agentUsageCounters.trialReserved} - 1)`, trialConsumed: outcome === 'commit' ? sql`${agentUsageCounters.trialConsumed} + 1` : agentUsageCounters.trialConsumed, updatedAt: new Date() }
      : { paidReserved: sql`greatest(0, ${agentUsageCounters.paidReserved} - 1)`, paidConsumed: outcome === 'commit' ? sql`${agentUsageCounters.paidConsumed} + 1` : agentUsageCounters.paidConsumed, updatedAt: new Date() }
    ).where(eq(agentUsageCounters.lineageId, reservation.lineageId));
    const [updated] = await tx.update(requestReservations).set(outcome === 'commit'
      ? { status: 'committed', committedAt: new Date(), updatedAt: new Date() }
      : { status: 'released', releasedAt: new Date(), updatedAt: new Date() }
    ).where(eq(requestReservations.id, reservation.id)).returning();
    return updated;
  });
}

export async function workspaceUsage(workspaceId: string) {
  const db = getDb();
  const [subscription, counters] = await Promise.all([
    db.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, workspaceId)).limit(1),
    db.select().from(agentUsageCounters).where(eq(agentUsageCounters.workspaceId, workspaceId)),
  ]);
  const plan = planForSubscription(subscription[0]);
  const trialPlan = subscription[0]?.planKey && isPaidPlanKey(subscription[0].planKey) ? PLAN_CATALOG[subscription[0].planKey] : firstCommercialPlan();
  const trialLimit = trialPlan.trialRequestsPerWorkspace;
  const aggregateTrial = aggregateTrialUsage(counters);
  const trial = { used: aggregateTrial.consumed, reserved: aggregateTrial.reserved };
  return { plan, subscription: subscription[0] ?? null, trial: { ...trial, limit: trialLimit, endsAt: subscription[0]?.trialEndsAt ?? null, eligible: false }, agents: counters.map((counter) => ({ agentId: counter.agentId, lineageId: counter.lineageId, trial: { used: counter.trialConsumed, reserved: counter.trialReserved, limit: trialLimit }, paid: { used: counter.paidConsumed, reserved: counter.paidReserved, limit: plan.requestsPerActiveAgent }, periodStart: counter.periodStart, periodEnd: counter.periodEnd })) };
}

export async function requireWorkspacePlanAccess(workspaceId: string, now = new Date()) {
  const db = getDb();
  const [subscription] = await db.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, workspaceId)).limit(1);
  assertPlanAccess(subscription, now);
  return subscription!;
}

export function assertPlanAccess(subscription?: { planKey?: string | null; status?: string | null; graceUntil?: Date | null; trialEndsAt?: Date | null } | null, now = new Date()) {
  if (hasPaidAccess(subscription ?? {}, now)) return;
  throw Object.assign(new Error('Seu período de teste terminou. Assine um plano e adicione uma forma de pagamento para continuar.'), {
    statusCode: 402,
    code: 'SUBSCRIPTION_REQUIRED',
    details: { trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null },
  });
}
