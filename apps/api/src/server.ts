import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { waitUntil } from '@vercel/functions';
import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { agents, and, conversations, desc, eq, evalBatches, evalRuns, evalScenarios, getDb, gte, inArray, knowledgeChunks, knowledgeJobs, knowledgeSources, memberships, modelCalls, sql, users, workspaces } from '@forge/db';
import { createToken, hashPassword, requireAuth, verifyPassword } from './auth.js';
import { judgeResponse, reviewPrompt, runAgent } from './adk.js';
import { aggregateEvalRuns, buildEvalCsv, promptFingerprint, runDeterministicChecks } from './evals.js';
import { extractFileText } from './knowledge.js';
import { drainKnowledgeJobs, enqueueKnowledgeJob } from './knowledge-worker.js';
import { recordModelCall } from './observability.js';
import { generateEvalScenarios, generateOfficialPrompt } from './supervisor.js';

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

async function ownedSource(sourceId: string, agentId: string, workspaceId: string) {
  await ownedAgent(agentId, workspaceId);
  const [source] = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.agentId, agentId))).limit(1);
  if (!source) throw Object.assign(new Error('Knowledge source not found'), { statusCode: 404 });
  return source;
}

function scheduleKnowledgeJob(jobId: string) {
  const task = drainKnowledgeJobs({ onlyJobId: jobId, limit: 1, workerId: `request-${jobId.slice(0, 8)}` });
  if (process.env.VERCEL) waitUntil(task);
  else void task;
}

async function knowledgeFor(agentId: string, query: string) {
  const terms = query.toLowerCase().split(/\W+/).filter((x) => x.length > 3).slice(0, 8);
  const rows = await db.select({ content: knowledgeChunks.content }).from(knowledgeChunks).innerJoin(knowledgeSources, and(eq(knowledgeSources.id, knowledgeChunks.sourceId), eq(knowledgeSources.active, true), eq(knowledgeSources.status, 'ready'))).where(eq(knowledgeChunks.agentId, agentId)).limit(80);
  return rows.map((r) => ({ ...r, score: terms.reduce((n, term) => n + (r.content.toLowerCase().includes(term) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score).slice(0, 6).map((r) => r.content).join('\n\n');
}

async function createKnowledgeSource(workspaceId: string, agentId: string, input: { type: string; title: string; rawText?: string; url?: string; metadata?: Record<string, unknown> }) {
  const rawText = (input.rawText ?? '').trim().slice(0, 500_000);
  if (input.type !== 'url' && !rawText) throw Object.assign(new Error('Knowledge source has no extractable text'), { statusCode: 400 });
  const [source] = await db.insert(knowledgeSources).values({ agentId, type: input.type, title: input.title, url: input.url, rawText, status: 'processing', metadata: input.metadata ?? {} }).returning();
  const job = await enqueueKnowledgeJob({ workspaceId, agentId, sourceId: source.id });
  scheduleKnowledgeJob(job.id);
  return { ...source, latestJob: job };
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
      await recordModelCall({ workspaceId: agent.workspaceId, agentId: agent.id, evalRunId: run.id, kind: 'eval_candidate', model: agent.model, request: scenario.input, response: candidate.text, usage: candidate.usage, latencyMs, metadata: { batchId, scenarioId: scenario.id } });
      const checks = runDeterministicChecks(candidate.text, latencyMs, scenario.assertions);
      const criticalFailure = checks.some((check) => !check.passed && check.severity === 'critical');
      const judgeStarted = Date.now();
      const judgment = await judgeResponse(scenario.input, scenario.expectedBehavior, candidate.text, supervisorModel);
      await recordModelCall({ workspaceId: agent.workspaceId, agentId: agent.id, evalRunId: run.id, kind: 'eval_judge', model: supervisorModel, request: JSON.stringify({ input: scenario.input, expectedBehavior: scenario.expectedBehavior, response: candidate.text }), response: judgment.reasoning, usage: judgment.usage, latencyMs: Date.now() - judgeStarted, metadata: { batchId, scenarioId: scenario.id, verdict: judgment.verdict, score: judgment.overallScore } });
      const score = criticalFailure ? Math.min(4, judgment.overallScore) : judgment.overallScore;
      const passed = !criticalFailure && score >= 8 && judgment.verdict !== 'fail';
      await db.update(evalRuns).set({ status: passed ? 'passed' : 'failed', score, passed, response: candidate.text, reasoning: judgment.reasoning, latencyMs, dimensionScores: judgment.scores, deterministicChecks: checks, strengths: judgment.strengths, improvements: judgment.improvements, failureTags: [...new Set([...judgment.failureTags, ...checks.filter((check) => !check.passed).map((check) => check.id)])], metadata: { totalTokens: candidate.usage.totalTokens + judgment.usage.totalTokens, candidateTokens: candidate.usage.totalTokens, judgeTokens: judgment.usage.totalTokens, promptRecommendation: judgment.promptRecommendation }, updatedAt: new Date() }).where(eq(evalRuns.id, run.id));
    } catch (error) {
      await recordModelCall({ workspaceId: agent.workspaceId, agentId: agent.id, evalRunId: run.id, kind: 'eval_error', model: agent.model, status: 'failed', request: scenario.input, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : 'Unknown error', metadata: { batchId, scenarioId: scenario.id } });
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

app.post('/prompts/generate', async (request) => {
  const auth = await requireAuth(request);
  const input = z.object({ name: z.string().max(120).optional(), definition: z.string().min(20).max(12_000), guardrails: z.array(z.string().min(3).max(500)).max(20).optional(), tone: z.string().max(500).optional(), escalation: z.string().max(1_000).optional(), model: z.string().max(120).optional() }).parse(request.body);
  const started = Date.now();
  try {
    const result = await generateOfficialPrompt(input);
    await recordModelCall({ workspaceId: auth.workspaceId, kind: 'prompt_generation', model: result.model, request: input.definition, response: result.instructions, usage: result.usage, latencyMs: Date.now() - started, metadata: { source: result.source, guardrails: result.guardrails.length } });
    return result;
  } catch (error) {
    await recordModelCall({ workspaceId: auth.workspaceId, kind: 'prompt_generation', model: input.model ?? process.env.EVAL_SUPERVISOR_MODEL ?? 'gemini-2.5-pro', status: 'failed', request: input.definition, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : 'Prompt generation failed' });
    throw error;
  }
});

app.get('/agents', async (request) => { const auth = await requireAuth(request); return db.select().from(agents).where(eq(agents.workspaceId, auth.workspaceId)).orderBy(desc(agents.createdAt)); });
app.post('/agents', async (request, reply) => {
  const auth = await requireAuth(request);
  const input = z.object({ name: z.string().min(2), description: z.string().max(240).default(''), instructions: z.string().min(20), model: z.string().default('gemini-2.5-flash'), promptDefinition: z.string().max(12_000).default(''), guardrails: z.array(z.string().max(500)).max(20).default([]), generatedPrompt: z.boolean().default(false) }).parse(request.body);
  const [agent] = await db.insert(agents).values({ name: input.name, description: input.description, instructions: input.instructions, model: input.model, promptDefinition: input.promptDefinition, guardrails: input.guardrails, promptGeneratedAt: input.generatedPrompt ? new Date() : null, workspaceId: auth.workspaceId, slug: `${slugify(input.name)}-${crypto.randomUUID().slice(0, 6)}` }).returning();
  return reply.code(201).send(agent);
});
app.get('/agents/:id', async (request) => { const auth = await requireAuth(request); return ownedAgent(z.object({ id: z.string().uuid() }).parse(request.params).id, auth.workspaceId); });
app.delete('/agents/:id', async (request, reply) => { const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId); await db.delete(agents).where(eq(agents.id, id)); return reply.code(204).send(); });

app.get('/agents/:id/knowledge', async (request) => {
  const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId);
  const [sources, jobs] = await Promise.all([
    db.select().from(knowledgeSources).where(eq(knowledgeSources.agentId, id)).orderBy(desc(knowledgeSources.createdAt)),
    db.select().from(knowledgeJobs).where(eq(knowledgeJobs.agentId, id)).orderBy(desc(knowledgeJobs.createdAt)).limit(200),
  ]);
  return sources.map((source) => ({ ...source, latestJob: jobs.find((job) => job.sourceId === source.id) ?? null }));
});
app.post('/agents/:id/knowledge', async (request, reply) => {
  const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId);
  const input = z.object({ type: z.enum(['text', 'url']), title: z.string().min(2), content: z.string().optional(), url: z.string().url().optional() }).refine((x) => x.type === 'text' ? Boolean(x.content) : Boolean(x.url)).parse(request.body);
  return reply.code(202).send(await createKnowledgeSource(auth.workspaceId, id, { type: input.type, title: input.title, url: input.url, rawText: input.content }));
});
app.post('/agents/:id/knowledge/upload', async (request, reply) => {
  const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId);
  const file = await request.file(); if (!file) throw Object.assign(new Error('A file is required'), { statusCode: 400 });
  const buffer = await file.toBuffer(); const rawText = await extractFileText(file.filename, file.mimetype, buffer);
  return reply.code(202).send(await createKnowledgeSource(auth.workspaceId, id, { type: 'file', title: file.filename, rawText, metadata: { filename: file.filename, mimetype: file.mimetype, bytes: buffer.byteLength } }));
});
app.get('/agents/:id/knowledge/:sourceId', async (request) => {
  const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), sourceId: z.string().uuid() }).parse(request.params); const source = await ownedSource(p.sourceId, p.id, auth.workspaceId);
  const [chunks, jobs] = await Promise.all([
    db.select({ id: knowledgeChunks.id, position: knowledgeChunks.position, content: knowledgeChunks.content, createdAt: knowledgeChunks.createdAt }).from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id)).orderBy(knowledgeChunks.position).limit(200),
    db.select().from(knowledgeJobs).where(eq(knowledgeJobs.sourceId, source.id)).orderBy(desc(knowledgeJobs.createdAt)).limit(30),
  ]);
  return { ...source, chunks, jobs };
});
app.patch('/agents/:id/knowledge/:sourceId', async (request) => {
  const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), sourceId: z.string().uuid() }).parse(request.params); await ownedSource(p.sourceId, p.id, auth.workspaceId);
  const input = z.object({ active: z.boolean() }).parse(request.body);
  const [source] = await db.update(knowledgeSources).set({ active: input.active, updatedAt: new Date() }).where(and(eq(knowledgeSources.id, p.sourceId), eq(knowledgeSources.agentId, p.id))).returning();
  return source;
});
app.post('/agents/:id/knowledge/:sourceId/reprocess', async (request, reply) => {
  const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), sourceId: z.string().uuid() }).parse(request.params); const source = await ownedSource(p.sourceId, p.id, auth.workspaceId);
  await db.update(knowledgeSources).set({ version: sql`${knowledgeSources.version} + 1`, status: 'processing', error: null, updatedAt: new Date() }).where(eq(knowledgeSources.id, source.id));
  const job = await enqueueKnowledgeJob({ workspaceId: auth.workspaceId, agentId: p.id, sourceId: source.id });
  scheduleKnowledgeJob(job.id);
  return reply.code(202).send(job);
});
app.delete('/agents/:id/knowledge/:sourceId', async (request, reply) => { const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), sourceId: z.string().uuid() }).parse(request.params); await ownedAgent(p.id, auth.workspaceId); await db.delete(knowledgeSources).where(and(eq(knowledgeSources.id, p.sourceId), eq(knowledgeSources.agentId, p.id))); return reply.code(204).send(); });

app.get('/internal/worker', async (request, reply) => {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || request.headers.authorization !== `Bearer ${secret}`)) return reply.code(401).send({ message: 'Invalid worker authorization' });
  return drainKnowledgeJobs({ limit: 10, workerId: 'vercel-cron' });
});

app.post('/agents/:id/chat', async (request) => {
  const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; const agent = await ownedAgent(id, auth.workspaceId);
  const body = z.object({ message: z.string().min(1).max(12_000), conversationId: z.string().uuid().optional() }).parse(request.body);
  let conversationId = body.conversationId;
  if (conversationId) {
    const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.agentId, id), eq(conversations.workspaceId, auth.workspaceId))).limit(1);
    if (!conversation) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
  } else {
    const [conversation] = await db.insert(conversations).values({ workspaceId: auth.workspaceId, agentId: id, userId: auth.userId, title: body.message.trim().slice(0, 80) }).returning();
    conversationId = conversation.id;
  }
  const started = Date.now();
  try {
    const result = await runAgent(agent, body.message, await knowledgeFor(id, body.message));
    const call = await recordModelCall({ workspaceId: auth.workspaceId, agentId: id, conversationId, kind: 'chat', model: agent.model, request: body.message, response: result.text, usage: result.usage, latencyMs: Date.now() - started });
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    return { response: result.text, usage: result.usage, conversationId, callId: call.id, estimatedCostUsd: call.estimatedCostUsd, latencyMs: call.latencyMs };
  } catch (error) {
    await recordModelCall({ workspaceId: auth.workspaceId, agentId: id, conversationId, kind: 'chat', model: agent.model, status: 'failed', request: body.message, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : 'Agent call failed' });
    throw error;
  }
});

app.get('/agents/:id/evals', async (request) => { const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; await ownedAgent(id, auth.workspaceId); const scenarios = await db.select().from(evalScenarios).where(eq(evalScenarios.agentId, id)).orderBy(desc(evalScenarios.createdAt)); const runs = scenarios.length ? await db.select().from(evalRuns).where(inArray(evalRuns.scenarioId, scenarios.map((x) => x.id))).orderBy(desc(evalRuns.createdAt)) : []; return scenarios.map((scenario) => ({ ...scenario, latest: runs.find((run) => run.scenarioId === scenario.id) ?? null })); });
app.post('/agents/:id/evals/generate', async (request, reply) => {
  const auth = await requireAuth(request); const id = z.object({ id: z.string().uuid() }).parse(request.params).id; const agent = await ownedAgent(id, auth.workspaceId);
  const input = z.object({ questions: z.array(z.string().min(3).max(2_000)).max(20).default([]), count: z.number().int().min(3).max(12).default(6), model: z.string().max(120).optional() }).parse(request.body ?? {});
  const sources = await db.select({ title: knowledgeSources.title, rawText: knowledgeSources.rawText }).from(knowledgeSources).where(and(eq(knowledgeSources.agentId, id), eq(knowledgeSources.active, true), eq(knowledgeSources.status, 'ready'))).orderBy(desc(knowledgeSources.updatedAt)).limit(20);
  const knowledge = sources.map((source) => `Source: ${source.title}\n${source.rawText.slice(0, 4_000)}`).join('\n\n').slice(0, 24_000);
  const started = Date.now();
  try {
    const generated = await generateEvalScenarios({ instructions: agent.instructions, knowledge, sourceTitles: sources.map((source) => source.title), questions: input.questions, count: input.count, model: input.model });
    const inserted = await db.insert(evalScenarios).values(generated.scenarios.map((scenario) => ({ ...scenario, agentId: id, generatedBy: 'supervisor', generationMetadata: { source: generated.source, model: generated.model, generatedAt: new Date().toISOString() } }))).returning();
    await recordModelCall({ workspaceId: auth.workspaceId, agentId: id, kind: 'eval_generation', model: generated.model, request: JSON.stringify({ questions: input.questions, count: input.count, sourceTitles: sources.map((source) => source.title) }), response: JSON.stringify(generated.scenarios), usage: generated.usage, latencyMs: Date.now() - started, metadata: { source: generated.source, scenarios: inserted.length } });
    return reply.code(201).send({ scenarios: inserted, source: generated.source, model: generated.model });
  } catch (error) {
    await recordModelCall({ workspaceId: auth.workspaceId, agentId: id, kind: 'eval_generation', model: input.model ?? process.env.EVAL_SUPERVISOR_MODEL ?? 'gemini-2.5-pro', status: 'failed', request: JSON.stringify(input), latencyMs: Date.now() - started, error: error instanceof Error ? error.message : 'Eval generation failed' });
    throw error;
  }
});
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
  const started = Date.now();
  const review = await reviewPrompt({ instructions: agent.instructions, cases }, batch.supervisorModel);
  await recordModelCall({ workspaceId: auth.workspaceId, agentId: agent.id, kind: 'prompt_review', model: batch.supervisorModel, request: JSON.stringify({ instructions: agent.instructions, cases }), response: review.improvedPrompt, usage: { inputTokens: review.inputTokens, outputTokens: review.outputTokens, totalTokens: review.totalTokens }, latencyMs: Date.now() - started, metadata: { batchId: batch.id, adjustments: review.adjustments.length } });
  await db.update(evalBatches).set({ promptReview: review, updatedAt: new Date() }).where(eq(evalBatches.id, batch.id)); return review;
});
app.get('/agents/:id/eval-runs/:batchId.csv', async (request, reply) => {
  const auth = await requireAuth(request); const p = z.object({ id: z.string().uuid(), batchId: z.string().uuid() }).parse(request.params); await ownedAgent(p.id, auth.workspaceId);
  const rows = await db.select({ run: evalRuns, scenario: evalScenarios }).from(evalRuns).innerJoin(evalScenarios, eq(evalScenarios.id, evalRuns.scenarioId)).innerJoin(evalBatches, and(eq(evalBatches.id, evalRuns.batchId), eq(evalBatches.agentId, p.id))).where(eq(evalRuns.batchId, p.batchId));
  const csv = buildEvalCsv(rows.map(({ run, scenario }) => ({ scenario: scenario.name, category: scenario.category, status: run.status, score: run.score, passed: run.passed, latencyMs: run.latencyMs, ...(run.dimensionScores ?? {}), reasoning: run.reasoning, response: run.response, failureTags: (run.failureTags ?? []).join('|') })));
  return reply.header('content-disposition', `attachment; filename="agent-eval-${p.batchId}.csv"`).type('text/csv; charset=utf-8').send(csv);
});

app.get('/analytics/overview', async (request) => {
  const auth = await requireAuth(request);
  const query = z.object({ agentId: z.string().uuid().optional(), days: z.coerce.number().int().min(1).max(90).default(30) }).parse(request.query);
  if (query.agentId) await ownedAgent(query.agentId, auth.workspaceId);
  const since = new Date(Date.now() - query.days * 86_400_000);
  const callConditions = [eq(modelCalls.workspaceId, auth.workspaceId), gte(modelCalls.createdAt, since)];
  if (query.agentId) callConditions.push(eq(modelCalls.agentId, query.agentId));
  const workspaceAgents = await db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.workspaceId, auth.workspaceId));
  const selectedAgentIds = query.agentId ? [query.agentId] : workspaceAgents.map((agent) => agent.id);
  const [calls, sources, jobs, evalRows, conversationRows] = await Promise.all([
    db.select().from(modelCalls).where(and(...callConditions)).orderBy(desc(modelCalls.createdAt)).limit(2_000),
    selectedAgentIds.length ? db.select().from(knowledgeSources).where(inArray(knowledgeSources.agentId, selectedAgentIds)) : Promise.resolve([]),
    selectedAgentIds.length ? db.select().from(knowledgeJobs).where(and(inArray(knowledgeJobs.agentId, selectedAgentIds), gte(knowledgeJobs.createdAt, since))).orderBy(desc(knowledgeJobs.createdAt)).limit(1_000) : Promise.resolve([]),
    selectedAgentIds.length ? db.select().from(evalRuns).where(and(inArray(evalRuns.agentId, selectedAgentIds), gte(evalRuns.createdAt, since))).orderBy(desc(evalRuns.createdAt)).limit(2_000) : Promise.resolve([]),
    query.agentId ? db.select().from(conversations).where(and(eq(conversations.workspaceId, auth.workspaceId), eq(conversations.agentId, query.agentId), gte(conversations.createdAt, since))) : db.select().from(conversations).where(and(eq(conversations.workspaceId, auth.workspaceId), gte(conversations.createdAt, since))),
  ]);
  const succeeded = calls.filter((call) => call.status === 'succeeded');
  const scoredEvals = evalRows.filter((run) => run.passed != null);
  const timeline = new Map<string, { date: string; requests: number; tokens: number; costUsd: number; errors: number }>();
  for (let offset = query.days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    timeline.set(date, { date, requests: 0, tokens: 0, costUsd: 0, errors: 0 });
  }
  for (const call of calls) {
    const point = timeline.get(call.createdAt.toISOString().slice(0, 10));
    if (!point) continue;
    point.requests += 1; point.tokens += call.totalTokens; point.costUsd += call.estimatedCostUsd; if (call.status === 'failed') point.errors += 1;
  }
  const agentNames = new Map(workspaceAgents.map((agent) => [agent.id, agent.name]));
  return {
    rangeDays: query.days,
    totals: {
      agents: selectedAgentIds.length, conversations: conversationRows.length, requests: calls.length,
      inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0), outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0), totalTokens: calls.reduce((sum, call) => sum + call.totalTokens, 0),
      estimatedCostUsd: Number(calls.reduce((sum, call) => sum + call.estimatedCostUsd, 0).toFixed(8)),
      averageLatencyMs: succeeded.length ? Math.round(succeeded.reduce((sum, call) => sum + call.latencyMs, 0) / succeeded.length) : 0,
      errorRate: calls.length ? calls.filter((call) => call.status === 'failed').length / calls.length : 0,
      evalPassRate: scoredEvals.length ? scoredEvals.filter((run) => run.passed).length / scoredEvals.length : 0,
    },
    knowledge: {
      total: sources.length, active: sources.filter((source) => source.active).length, ready: sources.filter((source) => source.status === 'ready').length,
      processing: sources.filter((source) => source.status === 'processing').length, failed: sources.filter((source) => source.status === 'failed').length,
      queuedJobs: jobs.filter((job) => job.status === 'queued').length, processingJobs: jobs.filter((job) => job.status === 'processing').length,
    },
    tests: { total: evalRows.length, passed: evalRows.filter((run) => run.status === 'passed').length, failed: evalRows.filter((run) => ['failed', 'error'].includes(run.status)).length },
    timeline: [...timeline.values()].map((point) => ({ ...point, costUsd: Number(point.costUsd.toFixed(8)) })),
    recentCalls: calls.slice(0, 12).map((call) => ({ ...call, agentName: call.agentId ? agentNames.get(call.agentId) ?? 'Deleted agent' : 'Workspace supervisor', input: call.input.slice(0, 240), output: call.output?.slice(0, 320) ?? null })),
  };
});

app.get('/analytics/calls', async (request) => {
  const auth = await requireAuth(request);
  const query = z.object({ agentId: z.string().uuid().optional(), kind: z.string().max(80).optional(), status: z.enum(['succeeded', 'failed']).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
  if (query.agentId) await ownedAgent(query.agentId, auth.workspaceId);
  const conditions = [eq(modelCalls.workspaceId, auth.workspaceId)];
  if (query.agentId) conditions.push(eq(modelCalls.agentId, query.agentId));
  if (query.kind) conditions.push(eq(modelCalls.kind, query.kind));
  if (query.status) conditions.push(eq(modelCalls.status, query.status));
  const [calls, workspaceAgents] = await Promise.all([
    db.select().from(modelCalls).where(and(...conditions)).orderBy(desc(modelCalls.createdAt)).limit(query.limit),
    db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.workspaceId, auth.workspaceId)),
  ]);
  const names = new Map(workspaceAgents.map((agent) => [agent.id, agent.name]));
  return calls.map((call) => ({ ...call, agentName: call.agentId ? names.get(call.agentId) ?? 'Deleted agent' : 'Workspace supervisor' }));
});

app.get('/analytics/calls/:callId', async (request) => {
  const auth = await requireAuth(request); const { callId } = z.object({ callId: z.string().uuid() }).parse(request.params);
  const [call] = await db.select().from(modelCalls).where(and(eq(modelCalls.id, callId), eq(modelCalls.workspaceId, auth.workspaceId))).limit(1);
  if (!call) throw Object.assign(new Error('Model call not found'), { statusCode: 404 });
  return call;
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
