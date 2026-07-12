import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { agents, and, desc, eq, evalBatches, evalRuns, evalScenarios, getDb, inArray, knowledgeChunks, knowledgeSources, memberships, users, workspaces } from '@forge/db';
import { createToken, hashPassword, requireAuth, verifyPassword } from './auth.js';
import { judgeResponse, reviewPrompt, runAgent } from './adk.js';
import { aggregateEvalRuns, buildEvalCsv, promptFingerprint, runDeterministicChecks } from './evals.js';
import { chunkText, extractFileText, fetchPublicPage } from './knowledge.js';

const app = Fastify({ logger: true });
await app.register(cookie);
await app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4 } });
const db = getDb();
const credentials = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2).optional() });
const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);

async function ownedAgent(id: string, workspaceId: string) {
  const [agent] = await db.select().from(agents).where(and(eq(agents.id, id), eq(agents.workspaceId, workspaceId))).limit(1);
  if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 });
  return agent;
}

async function knowledgeFor(agentId: string, query: string) {
  const terms = query.toLowerCase().split(/\W+/).filter((x) => x.length > 3).slice(0, 8);
  const rows = await db.select({ content: knowledgeChunks.content }).from(knowledgeChunks).where(eq(knowledgeChunks.agentId, agentId)).limit(80);
  return rows.map((r) => ({ ...r, score: terms.reduce((n, term) => n + (r.content.toLowerCase().includes(term) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score).slice(0, 6).map((r) => r.content).join('\n\n');
}

async function insertKnowledge(agentId: string, input: { type: string; title: string; rawText: string; url?: string }) {
  const rawText = input.rawText.trim().slice(0, 500_000);
  if (!rawText) throw Object.assign(new Error('Knowledge source has no extractable text'), { statusCode: 400 });
  const [source] = await db.insert(knowledgeSources).values({ agentId, type: input.type, title: input.title, url: input.url, rawText }).returning();
  const parts = chunkText(rawText);
  if (parts.length) await db.insert(knowledgeChunks).values(parts.map((content, position) => ({ sourceId: source.id, agentId, content, position })));
  return { ...source, chunks: parts.length };
}

async function processEvalBatch(batchId: string, agent: typeof agents.$inferSelect, scenarios: Array<typeof evalScenarios.$inferSelect>, supervisorModel: string) {
  await db.update(evalBatches).set({ status: 'running', startedAt: new Date(), updatedAt: new Date() }).where(eq(evalBatches.id, batchId));
  const runs = await db.select().from(evalRuns).where(eq(evalRuns.batchId, batchId)).orderBy(evalRuns.createdAt);
  for (const run of runs) {
    const [batch] = await db.select({ status: evalBatches.status }).from(evalBatches).where(eq(evalBatches.id, batchId)).limit(1);
    if (batch?.status === 'canceling') { await db.update(evalRuns).set({ status: 'canceled', updatedAt: new Date() }).where(eq(evalRuns.id, run.id)); continue; }
    const scenario = scenarios.find((item) => item.id === run.scenarioId); if (!scenario) continue;
    const started = Date.now();
    try {
      await db.update(evalRuns).set({ status: 'running', updatedAt: new Date() }).where(eq(evalRuns.id, run.id));
      const candidate = await runAgent(agent, scenario.input, await knowledgeFor(agent.id, scenario.input));
      const latencyMs = Date.now() - started;
      const checks = runDeterministicChecks(candidate.text, latencyMs, scenario.assertions);
      const criticalFailure = checks.some((check) => !check.passed && check.severity === 'critical');
      const judgment = await judgeResponse(scenario.input, scenario.expectedBehavior, candidate.text, supervisorModel);
      const score = criticalFailure ? Math.min(4, judgment.overallScore) : judgment.overallScore;
      const passed = !criticalFailure && score >= 8 && judgment.verdict !== 'fail';
      await db.update(evalRuns).set({ status: passed ? 'passed' : 'failed', score, passed, response: candidate.text, reasoning: judgment.reasoning, latencyMs, dimensionScores: judgment.scores, deterministicChecks: checks, strengths: judgment.strengths, improvements: judgment.improvements, failureTags: [...new Set([...judgment.failureTags, ...checks.filter((check) => !check.passed).map((check) => check.id)])], metadata: { totalTokens: candidate.usage.totalTokens, promptRecommendation: judgment.promptRecommendation }, updatedAt: new Date() }).where(eq(evalRuns.id, run.id));
    } catch (error) {
      await db.update(evalRuns).set({ status: 'error', reasoning: error instanceof Error ? error.message : 'Unknown error', latencyMs: Date.now() - started, updatedAt: new Date() }).where(eq(evalRuns.id, run.id));
    }
  }
  const completedRuns = await db.select().from(evalRuns).where(eq(evalRuns.batchId, batchId));
  const summary = aggregateEvalRuns(completedRuns);
  const canceled = completedRuns.every((run) => run.status === 'canceled');
  const status = canceled ? 'canceled' : summary.errors ? 'completed_with_errors' : 'completed';
  await db.update(evalBatches).set({ status, summary, completedAt: new Date(), updatedAt: new Date() }).where(eq(evalBatches.id, batchId));
}

app.get('/health', async () => ({ ok: true }));
app.post('/auth/register', async (request, reply) => {
  const input = credentials.extend({ name: z.string().min(2) }).parse(request.body);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
  if (existing.length) return reply.code(409).send({ message: 'Email already registered' });
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: input.email.toLowerCase(), name: input.name, passwordHash: await hashPassword(input.password) }).returning();
    const [workspace] = await tx.insert(workspaces).values({ name: `${input.name}'s workspace`, slug: `${slugify(input.name)}-${user.id.slice(0, 6)}` }).returning();
    await tx.insert(memberships).values({ userId: user.id, workspaceId: workspace.id });
    return { user, workspace };
  });
  const token = await createToken(result.user.id, result.workspace.id);
  reply.setCookie('forge_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 604800 });
  return { user: { id: result.user.id, name: result.user.name, email: result.user.email }, workspace: result.workspace };
});
app.post('/auth/login', async (request, reply) => {
  const input = credentials.pick({ email: true, password: true }).parse(request.body);
  const [row] = await db.select({ user: users, membership: memberships }).from(users).innerJoin(memberships, eq(memberships.userId, users.id)).where(eq(users.email, input.email.toLowerCase())).limit(1);
  if (!row || !(await verifyPassword(input.password, row.user.passwordHash))) return reply.code(401).send({ message: 'Invalid email or password' });
  reply.setCookie('forge_session', await createToken(row.user.id, row.membership.workspaceId), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 604800 });
  return { user: { id: row.user.id, name: row.user.name, email: row.user.email } };
});
app.post('/auth/logout', async (_, reply) => { reply.clearCookie('forge_session', { path: '/' }); return { ok: true }; });
app.get('/auth/me', async (request) => { const auth = await requireAuth(request); const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, auth.userId)); return { user }; });

app.get('/agents', async (request) => { const auth = await requireAuth(request); return db.select().from(agents).where(eq(agents.workspaceId, auth.workspaceId)).orderBy(desc(agents.createdAt)); });
app.post('/agents', async (request, reply) => {
  const auth = await requireAuth(request);
  const input = z.object({ name: z.string().min(2), description: z.string().max(240).default(''), instructions: z.string().min(20), model: z.string().default('gemini-2.5-flash') }).parse(request.body);
  const [agent] = await db.insert(agents).values({ ...input, workspaceId: auth.workspaceId, slug: `${slugify(input.name)}-${crypto.randomUUID().slice(0, 6)}` }).returning();
  return reply.code(201).send(agent);
});
app.get('/agents/:id', async (request) => { const auth = await requireAuth(request); return ownedAgent(z.object({ id: z.string().uuid() }).parse(request.params).id, auth.workspaceId); });
app.delete('/agents/:id', async (request, reply) => { const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId); await db.delete(agents).where(eq(agents.id, id)); return reply.code(204).send(); });

app.get('/agents/:id/knowledge', async (request) => { const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId); return db.select().from(knowledgeSources).where(eq(knowledgeSources.agentId, id)).orderBy(desc(knowledgeSources.createdAt)); });
app.post('/agents/:id/knowledge', async (request, reply) => {
  const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId);
  const input = z.object({ type: z.enum(['text', 'url']), title: z.string().min(2), content: z.string().optional(), url: z.string().url().optional() }).refine((x) => x.type === 'text' ? Boolean(x.content) : Boolean(x.url)).parse(request.body);
  const rawText = input.type === 'url' ? await fetchPublicPage(input.url!) : input.content!;
  return reply.code(201).send(await insertKnowledge(id, { type: input.type, title: input.title, url: input.url, rawText }));
});
app.post('/agents/:id/knowledge/upload', async (request, reply) => {
  const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId);
  const file = await request.file(); if (!file) throw Object.assign(new Error('A file is required'), { statusCode: 400 });
  const buffer = await file.toBuffer(); const rawText = await extractFileText(file.filename, file.mimetype, buffer);
  return reply.code(201).send(await insertKnowledge(id, { type: 'file', title: file.filename, rawText }));
});
app.delete('/agents/:id/knowledge/:sourceId', async (request, reply) => { const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), sourceId: z.string().uuid() }).parse(request.params); await ownedAgent(p.id, auth.workspaceId); await db.delete(knowledgeSources).where(and(eq(knowledgeSources.id, p.sourceId), eq(knowledgeSources.agentId, p.id))); return reply.code(204).send(); });

app.post('/agents/:id/chat', async (request) => { const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; const agent = await ownedAgent(id, auth.workspaceId); const { message } = z.object({ message: z.string().min(1).max(12000) }).parse(request.body); const result = await runAgent(agent, message, await knowledgeFor(id, message)); return { response: result.text, usage: result.usage }; });

app.get('/agents/:id/evals', async (request) => { const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId); const scenarios = await db.select().from(evalScenarios).where(eq(evalScenarios.agentId, id)).orderBy(desc(evalScenarios.createdAt)); const runs = scenarios.length ? await db.select().from(evalRuns).where(inArray(evalRuns.scenarioId, scenarios.map((x) => x.id))).orderBy(desc(evalRuns.createdAt)) : []; return scenarios.map((scenario) => ({ ...scenario, latest: runs.find((run) => run.scenarioId === scenario.id) ?? null })); });
app.post('/agents/:id/evals', async (request, reply) => {
  const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId);
  const assertions = z.object({ mustContain: z.array(z.string().min(1)).max(10).optional(), mustNotContain: z.array(z.string().min(1)).max(10).optional(), maxLatencyMs: z.number().int().positive().optional(), minLength: z.number().int().positive().optional() }).default({});
  const input = z.object({ name: z.string().min(2), input: z.string().min(2), expectedBehavior: z.string().min(5), category: z.string().default('quality'), weight: z.number().positive().default(1), assertions }).parse(request.body);
  const [scenario] = await db.insert(evalScenarios).values({ ...input, agentId: id }).returning(); return reply.code(201).send(scenario);
});
app.delete('/agents/:id/evals/:scenarioId', async (request, reply) => { const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), scenarioId: z.string().uuid() }).parse(request.params); await ownedAgent(p.id, auth.workspaceId); await db.delete(evalScenarios).where(and(eq(evalScenarios.id, p.scenarioId), eq(evalScenarios.agentId, p.id))); return reply.code(204).send(); });
app.post('/agents/:id/evals/run', async (request, reply) => {
  const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; const agent = await ownedAgent(id, auth.workspaceId);
  const body = z.object({ scenarioId: z.string().uuid().optional(), supervisorModel: z.string().min(3).max(120).default(process.env.EVAL_SUPERVISOR_MODEL ?? 'gemini-2.5-pro') }).parse(request.body ?? {});
  if (body.supervisorModel === agent.model) return reply.code(400).send({ message: 'Candidate and supervisor models must be different' });
  const conditions = [eq(evalScenarios.agentId, id), eq(evalScenarios.active, true)]; if (body.scenarioId) conditions.push(eq(evalScenarios.id, body.scenarioId));
  const scenarios = await db.select().from(evalScenarios).where(and(...conditions)); if (!scenarios.length) return reply.code(400).send({ message: 'No active eval scenarios found' });
  const knowledge = await db.select({ id: knowledgeSources.id, updatedAt: knowledgeSources.updatedAt }).from(knowledgeSources).where(eq(knowledgeSources.agentId, id)).orderBy(knowledgeSources.id);
  const prompt = promptFingerprint(agent, JSON.stringify(knowledge));
  const [batch] = await db.insert(evalBatches).values({ agentId: id, promptHash: prompt.hash, promptSnapshot: prompt.snapshot, candidateModel: agent.model, supervisorModel: body.supervisorModel, config: { scenarioIds: scenarios.map((scenario) => scenario.id) } }).returning();
  const created = await db.insert(evalRuns).values(scenarios.map((scenario) => ({ scenarioId: scenario.id, batchId: batch.id, agentId: id }))).returning();
  void processEvalBatch(batch.id, agent, scenarios, body.supervisorModel);
  return reply.code(202).send({ batchId: batch.id, runIds: created.map((run) => run.id), promptHash: prompt.hash });
});
app.get('/agents/:id/eval-runs', async (request) => { const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId); return db.select({ id: evalBatches.id, status: evalBatches.status, promptHash: evalBatches.promptHash, candidateModel: evalBatches.candidateModel, supervisorModel: evalBatches.supervisorModel, config: evalBatches.config, summary: evalBatches.summary, promptReview: evalBatches.promptReview, createdAt: evalBatches.createdAt, startedAt: evalBatches.startedAt, completedAt: evalBatches.completedAt }).from(evalBatches).where(eq(evalBatches.agentId, id)).orderBy(desc(evalBatches.createdAt)).limit(50); });
app.get('/agents/:id/eval-runs/:batchId', async (request) => {
  const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), batchId: z.string().uuid() }).parse(request.params); await ownedAgent(p.id, auth.workspaceId);
  const [batch] = await db.select().from(evalBatches).where(and(eq(evalBatches.id, p.batchId), eq(evalBatches.agentId, p.id))).limit(1); if (!batch) throw Object.assign(new Error('Eval run not found'), { statusCode: 404 });
  const cases = await db.select({ run: evalRuns, scenario: evalScenarios }).from(evalRuns).innerJoin(evalScenarios, eq(evalScenarios.id, evalRuns.scenarioId)).where(eq(evalRuns.batchId, batch.id)).orderBy(evalRuns.createdAt);
  return { ...batch, cases: cases.map(({ run, scenario }) => ({ ...run, scenario })) };
});
app.post('/agents/:id/eval-runs/:batchId/cancel', async (request) => { const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), batchId: z.string().uuid() }).parse(request.params); await ownedAgent(p.id, auth.workspaceId); await db.update(evalBatches).set({ status: 'canceling', updatedAt: new Date() }).where(and(eq(evalBatches.id, p.batchId), eq(evalBatches.agentId, p.id))); return { ok: true }; });
app.post('/agents/:id/eval-runs/:batchId/improve-prompt', async (request) => {
  const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), batchId: z.string().uuid() }).parse(request.params); const agent = await ownedAgent(p.id, auth.workspaceId);
  const [batch] = await db.select().from(evalBatches).where(and(eq(evalBatches.id, p.batchId), eq(evalBatches.agentId, p.id))).limit(1); if (!batch) throw Object.assign(new Error('Eval run not found'), { statusCode: 404 });
  const rows = await db.select({ run: evalRuns, scenario: evalScenarios }).from(evalRuns).innerJoin(evalScenarios, eq(evalScenarios.id, evalRuns.scenarioId)).where(eq(evalRuns.batchId, batch.id));
  const cases = rows.filter(({ run }) => ['passed', 'failed'].includes(run.status)).map(({ run, scenario }) => ({ input: scenario.input, expected: scenario.expectedBehavior, response: run.response ?? '', score: run.score ?? 0, reasoning: run.reasoning ?? '' }));
  if (!cases.length) throw Object.assign(new Error('No completed cases to review'), { statusCode: 400 });
  const review = await reviewPrompt({ instructions: agent.instructions, cases }, batch.supervisorModel); await db.update(evalBatches).set({ promptReview: review, updatedAt: new Date() }).where(eq(evalBatches.id, batch.id)); return review;
});
app.get('/agents/:id/eval-runs/:batchId.csv', async (request, reply) => {
  const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), batchId: z.string().uuid() }).parse(request.params); await ownedAgent(p.id, auth.workspaceId);
  const rows = await db.select({ run: evalRuns, scenario: evalScenarios }).from(evalRuns).innerJoin(evalScenarios, eq(evalScenarios.id, evalRuns.scenarioId)).innerJoin(evalBatches, and(eq(evalBatches.id, evalRuns.batchId), eq(evalBatches.agentId, p.id))).where(eq(evalRuns.batchId, p.batchId));
  const csv = buildEvalCsv(rows.map(({ run, scenario }) => ({ scenario: scenario.name, category: scenario.category, status: run.status, score: run.score, passed: run.passed, latencyMs: run.latencyMs, ...(run.dimensionScores ?? {}), reasoning: run.reasoning, response: run.response, failureTags: (run.failureTags ?? []).join('|') })));
  return reply.header('content-disposition', `attachment; filename="agent-eval-${p.batchId}.csv"`).type('text/csv; charset=utf-8').send(csv);
});

app.setErrorHandler((error, request, reply) => {
  const err = error instanceof Error ? error : new Error('Unknown error');
  const statusCode = (err as Error & { statusCode?: number }).statusCode;
  const code = typeof statusCode === 'number' ? statusCode : err instanceof z.ZodError ? 400 : 500;
  if (code >= 500) request.log.error({ err }, 'request failed');
  reply.code(code).send({ message: code === 500 ? 'Unexpected server error' : err instanceof z.ZodError ? err.issues[0]?.message ?? 'Invalid request' : err.message, issues: err instanceof z.ZodError ? err.issues : undefined });
});
export default app;

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) await app.listen({ port: Number(process.env.API_PORT ?? 4000), host: '0.0.0.0' });
