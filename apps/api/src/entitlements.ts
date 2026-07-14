import { randomUUID } from 'node:crypto';
import { agentUsageCounters, agents, and, eq, getDb, requestReservations, sql, workspaceSubscriptions } from '@forge/db';
import { PLAN_CATALOG, hasPaidAccess, planForSubscription, type PlanDefinition } from './plans.js';

type Counter = { trialConsumed: number; trialReserved: number; paidConsumed: number; paidReserved: number };

export function chooseUsageBucket(counter: Counter, paid: boolean, requestsPerAgent = 1_500, renewalAt: Date | null = null) {
  if (counter.trialConsumed + counter.trialReserved < 30) return 'trial' as const;
  if (paid && counter.paidConsumed + counter.paidReserved < requestsPerAgent) return 'paid' as const;
  throw Object.assign(new Error(paid ? 'Este agente atingiu a franquia mensal de requisições.' : 'As 30 requisições gratuitas deste agente terminaram. Escolha um plano para continuar.'), {
    statusCode: 402,
    code: 'USAGE_EXHAUSTED',
    details: {
      exhaustedBucket: paid ? 'paid' : 'trial',
      trial: { used: counter.trialConsumed, reserved: counter.trialReserved, limit: 30 },
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
    const [agent] = await tx.select({ id: agents.id, lineageId: agents.lineageId, status: agents.status }).from(agents).where(and(eq(agents.id, input.agentId), eq(agents.workspaceId, input.workspaceId))).limit(1);
    if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 });
    if (agent.status === 'disabled') throw Object.assign(new Error('Ative o agente antes de executar uma conversa.'), { statusCode: 409, code: 'AGENT_DISABLED' });
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${agent.lineageId}::text))`);

    const [existing] = await tx.select().from(requestReservations).where(and(eq(requestReservations.workspaceId, input.workspaceId), eq(requestReservations.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) return { ...existing, reused: true };

    const [subscription] = await tx.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, input.workspaceId)).limit(1);
    const plan = planForSubscription(subscription);
    await tx.insert(agentUsageCounters).values({ lineageId: agent.lineageId, workspaceId: input.workspaceId, agentId: agent.id }).onConflictDoNothing();
    let [counter] = await tx.select().from(agentUsageCounters).where(eq(agentUsageCounters.lineageId, agent.lineageId)).limit(1);
    if (!counter) throw new Error('Usage counter could not be initialized');

    const periodChanged = Boolean(subscription?.currentPeriodStart && (!counter.periodStart || counter.periodStart.getTime() !== subscription.currentPeriodStart.getTime()));
    if (periodChanged) {
      [counter] = await tx.update(agentUsageCounters).set({ paidConsumed: 0, paidReserved: 0, periodStart: subscription!.currentPeriodStart, periodEnd: subscription!.currentPeriodEnd, updatedAt: new Date() }).where(eq(agentUsageCounters.lineageId, agent.lineageId)).returning();
    }
    const bucket = chooseUsageBucket(counter, hasPaidAccess(subscription ?? {}), plan.requestsPerActiveAgent || PLAN_CATALOG.solo.requestsPerActiveAgent, subscription?.currentPeriodEnd ?? null);
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
  return { plan, subscription: subscription[0] ?? null, agents: counters.map((counter) => ({ agentId: counter.agentId, lineageId: counter.lineageId, trial: { used: counter.trialConsumed, reserved: counter.trialReserved, limit: 30 }, paid: { used: counter.paidConsumed, reserved: counter.paidReserved, limit: plan.requestsPerActiveAgent }, periodStart: counter.periodStart, periodEnd: counter.periodEnd })) };
}
