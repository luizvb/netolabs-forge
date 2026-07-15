import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { agents, and, benchlineAgentMappings, benchlineConnections, eq, getDb, memberships, sql, users, workspaces, workspaceSubscriptions } from '@forge/db';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { hasPaidAccess, planForSubscription } from './plans.js';
import { FORGE_S2S_HEADERS, signS2S } from './s2s.js';

export const BENCHLINE_CONSENT_VERSION = '2026-07-13';
export const BENCHLINE_CONSENT_SCOPES = ['account_profile', 'workspace_profile', 'agent_definition', 'eval_summary'] as const;

const remoteResultSchema = z.object({
  workspaceId: z.string().min(1),
  agents: z.array(z.object({ externalAgentId: z.string().uuid(), agentId: z.string().min(1), twinId: z.string().min(1), status: z.string() })),
});

const statusSchema = z.object({
  status: z.enum(['connected', 'partial', 'error', 'revoked', 'unavailable']),
  workspaceUrl: z.string().url().optional(),
  agent: z.object({ externalAgentId: z.string(), agentId: z.string(), twinId: z.string(), latestEval: z.object({ score: z.number().nullable(), status: z.string(), completedAt: z.string().nullable() }).nullable(), findings: z.number().int().nonnegative(), recommendations: z.number().int().nonnegative() }).nullable().optional(),
});

export function forgeAgentPayload<T extends Pick<typeof agents.$inferSelect, 'id' | 'name' | 'description' | 'model' | 'instructions' | 'guardrails' | 'promptVersion' | 'status'>>(agent: T) {
  return {
    externalAgentId: agent.id,
    name: agent.name,
    description: agent.description,
    model: agent.model,
    instructions: agent.instructions,
    guardrails: agent.guardrails,
    promptVersion: agent.promptVersion,
    status: agent.status,
  };
}

async function ownerAuth(request: FastifyRequest) {
  const auth = await requireAuth(request);
  const db = getDb();
  const [membership] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.workspaceId, auth.workspaceId), eq(memberships.userId, auth.userId))).limit(1);
  if (membership?.role !== 'owner') throw Object.assign(new Error('Only a workspace owner can link Benchline.'), { statusCode: 403, code: 'WORKSPACE_OWNER_REQUIRED' });
  return auth;
}

async function requireForgeBundle(workspaceId: string) {
  const db = getDb();
  const [subscription] = await db.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, workspaceId)).limit(1);
  if (!hasPaidAccess(subscription ?? {})) throw Object.assign(new Error('Benchline requires an active Forge trial or paid subscription.'), { statusCode: 402, code: 'FORGE_SUBSCRIPTION_REQUIRED' });
  return subscription!;
}

async function benchlineRequest(method: 'GET' | 'POST', path: string, body: unknown, idempotencyKey: string) {
  const baseUrl = process.env.BENCHLINE_API_URL?.replace(/\/$/, '');
  const secret = process.env.BENCHLINE_S2S_SECRET;
  if (!baseUrl || !secret) throw Object.assign(new Error('Benchline integration is unavailable.'), { statusCode: 503, code: 'BENCHLINE_NOT_CONFIGURED' });
  const serialized = body === undefined ? '' : JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signed = signS2S(secret, { method, path, timestamp, idempotencyKey, body: serialized });
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    'content-type': 'application/json', [FORGE_S2S_HEADERS.timestamp]: timestamp, [FORGE_S2S_HEADERS.idempotency]: idempotencyKey,
    [FORGE_S2S_HEADERS.bodyHash]: signed.bodyHash, [FORGE_S2S_HEADERS.signature]: signed.signature,
  }, signal: AbortSignal.timeout(Number(process.env.BENCHLINE_TIMEOUT_MS ?? 8_000)), ...(method === 'POST' ? { body: serialized } : {}) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error('Benchline could not complete the signed request.'), { statusCode: response.status >= 500 ? 502 : response.status, code: 'BENCHLINE_REMOTE_ERROR' });
  return value;
}

async function provisionPayload(workspaceId: string, userId: string) {
  const db = getDb();
  const [[workspace], [user], agentRows, [subscription], [connection]] = await Promise.all([
    db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(agents).where(eq(agents.workspaceId, workspaceId)),
    db.select().from(workspaceSubscriptions).where(eq(workspaceSubscriptions.workspaceId, workspaceId)).limit(1),
    db.select({ consentVersion: benchlineConnections.consentVersion, consentScopes: benchlineConnections.consentScopes, consentedAt: benchlineConnections.consentedAt }).from(benchlineConnections).where(eq(benchlineConnections.workspaceId, workspaceId)).limit(1),
  ]);
  if (!workspace || !user || !connection?.consentVersion || !connection.consentedAt) throw Object.assign(new Error('Workspace identity or consent is incomplete'), { statusCode: 409 });
  return {
    source: 'forge_bundle' as const,
    consent: { version: connection.consentVersion, acceptedAt: connection.consentedAt.toISOString(), scopes: connection.consentScopes },
    account: { externalUserId: user.id, name: user.name, email: user.email },
    workspace: { externalWorkspaceId: workspace.id, name: workspace.name },
    entitlement: { status: 'active', activeAgentLimit: planForSubscription(subscription).activeAgentLimit, suitesPerAgent: 5, casesPerAgent: 40, concurrency: 1 },
    agents: agentRows.map(forgeAgentPayload),
  };
}

export async function revokeBenchlineBundle(workspaceId: string) {
  const db = getDb();
  const revokedAt = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`benchline-revoke:${workspaceId}`}))`);
    const [existing] = await tx.select({ revokedAt: benchlineConnections.revokedAt }).from(benchlineConnections).where(eq(benchlineConnections.workspaceId, workspaceId)).limit(1);
    const stableRevokedAt = existing?.revokedAt ?? new Date();
    await tx.insert(benchlineConnections).values({ workspaceId, status: 'revocation_pending', revokedAt: stableRevokedAt, lastError: 'REMOTE_REVOKE_PENDING' })
      .onConflictDoUpdate({ target: benchlineConnections.workspaceId, set: { status: 'revocation_pending', revokedAt: stableRevokedAt, lastError: 'REMOTE_REVOKE_PENDING', updatedAt: new Date() } });
    return stableRevokedAt;
  });
  const payload = { source: 'forge_bundle' as const, externalWorkspaceId: workspaceId, revokedAt: revokedAt.toISOString() };
  let remoteSynced = true;
  try { await benchlineRequest('POST', '/partner/forge/v1/revoke', payload, `revoke:${workspaceId}`); } catch { remoteSynced = false; }
  await db.update(benchlineConnections).set({ status: remoteSynced ? 'revoked' : 'revocation_pending', revokedAt, lastError: remoteSynced ? null : 'REMOTE_REVOKE_PENDING', updatedAt: new Date() }).where(eq(benchlineConnections.workspaceId, workspaceId));
  return { status: remoteSynced ? 'revoked' as const : 'revocation_pending' as const, remoteSynced };
}

async function syncConnection(workspaceId: string, userId: string) {
  const db = getDb();
  const payload = await provisionPayload(workspaceId, userId);
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
  const result = remoteResultSchema.parse(await benchlineRequest('POST', '/partner/forge/v1/provision', payload, `provision:${workspaceId}:${digest}`));
  await db.transaction(async (tx) => {
    await tx.update(benchlineConnections).set({ status: 'connected', remoteWorkspaceId: result.workspaceId, lastSyncAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(benchlineConnections.workspaceId, workspaceId));
    for (const mapping of result.agents) {
      await tx.insert(benchlineAgentMappings).values({ workspaceId, agentId: mapping.externalAgentId, remoteAgentId: mapping.agentId, remoteTwinId: mapping.twinId, status: mapping.status, lastSyncAt: new Date() })
        .onConflictDoUpdate({ target: benchlineAgentMappings.agentId, set: { remoteAgentId: mapping.agentId, remoteTwinId: mapping.twinId, status: mapping.status, lastSyncAt: new Date(), lastError: null, updatedAt: new Date() } });
    }
  });
  return result;
}

export async function syncBenchlineAfterAgentChange(workspaceId: string) {
  const db = getDb();
  const [connection] = await db.select().from(benchlineConnections).where(eq(benchlineConnections.workspaceId, workspaceId)).limit(1);
  if (!connection?.consentedBy || !connection.consentedAt || connection.revokedAt) return { attempted: false as const };
  try {
    await requireForgeBundle(workspaceId);
    await db.update(benchlineConnections).set({ status: 'syncing', updatedAt: new Date() }).where(eq(benchlineConnections.workspaceId, workspaceId));
    await syncConnection(workspaceId, connection.consentedBy);
    return { attempted: true as const, synced: true as const };
  } catch (error) {
    await db.update(benchlineConnections).set({ status: 'error', lastError: (error as { code?: string }).code ?? 'SYNC_FAILED', updatedAt: new Date() }).where(eq(benchlineConnections.workspaceId, workspaceId));
    return { attempted: true as const, synced: false as const };
  }
}

export function registerBenchlineRoutes(app: FastifyInstance) {
  app.post('/benchline/connect', async (request) => {
    const auth = await ownerAuth(request);
    await requireForgeBundle(auth.workspaceId);
    const body = z.object({ consentAccepted: z.literal(true), consentVersion: z.literal(BENCHLINE_CONSENT_VERSION) }).parse(request.body);
    const db = getDb();
    await db.insert(benchlineConnections).values({ workspaceId: auth.workspaceId, status: 'syncing', consentVersion: body.consentVersion, consentedBy: auth.userId, consentScopes: [...BENCHLINE_CONSENT_SCOPES], consentedAt: new Date(), revokedAt: null, lastError: null })
      .onConflictDoUpdate({ target: benchlineConnections.workspaceId, set: { status: 'syncing', consentVersion: body.consentVersion, consentedBy: auth.userId, consentScopes: [...BENCHLINE_CONSENT_SCOPES], consentedAt: new Date(), revokedAt: null, lastError: null, updatedAt: new Date() } });
    try { return await syncConnection(auth.workspaceId, auth.userId); }
    catch (error) { await db.update(benchlineConnections).set({ status: 'error', lastError: (error as { code?: string }).code ?? 'SYNC_FAILED', updatedAt: new Date() }).where(eq(benchlineConnections.workspaceId, auth.workspaceId)); throw error; }
  });

  app.post('/benchline/sync', async (request) => {
    const auth = await ownerAuth(request); await requireForgeBundle(auth.workspaceId);
    const db = getDb(); const [connection] = await db.select().from(benchlineConnections).where(eq(benchlineConnections.workspaceId, auth.workspaceId)).limit(1);
    if (!connection?.consentedAt || connection.revokedAt) throw Object.assign(new Error('Benchline consent is required before sync.'), { statusCode: 409, code: 'BENCHLINE_CONSENT_REQUIRED' });
    return syncConnection(auth.workspaceId, auth.userId);
  });

  app.get('/benchline/status', async (request) => {
    const auth = await requireAuth(request); const query = z.object({ agentId: z.string().uuid().optional() }).parse(request.query ?? {});
    const db = getDb(); const [connection] = await db.select().from(benchlineConnections).where(eq(benchlineConnections.workspaceId, auth.workspaceId)).limit(1);
    if (!connection) return { status: process.env.BENCHLINE_API_URL ? 'disconnected' : 'unavailable', consentVersion: BENCHLINE_CONSENT_VERSION };
    if (connection.revokedAt) return { status: 'revoked', consentVersion: BENCHLINE_CONSENT_VERSION, revokedAt: connection.revokedAt };
    if (!connection.remoteWorkspaceId || connection.status !== 'connected') return { ...connection, consentVersion: BENCHLINE_CONSENT_VERSION };
    const path = `/partner/forge/v1/status?externalWorkspaceId=${encodeURIComponent(auth.workspaceId)}${query.agentId ? `&externalAgentId=${encodeURIComponent(query.agentId)}` : ''}`;
    const remote = statusSchema.parse(await benchlineRequest('GET', path, undefined, `status:${auth.workspaceId}:${query.agentId ?? 'workspace'}:${randomUUID()}`));
    return { ...remote, consentVersion: BENCHLINE_CONSENT_VERSION, lastSyncAt: connection.lastSyncAt };
  });

  app.delete('/benchline/link', async (request) => {
    const auth = await ownerAuth(request); const db = getDb();
    return revokeBenchlineBundle(auth.workspaceId);
  });
}
