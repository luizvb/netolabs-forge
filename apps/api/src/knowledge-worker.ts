import { createHash, randomUUID } from 'node:crypto';
import { agents, and, asc, eq, getDb, knowledgeChunks, knowledgeJobs, knowledgeSources, lt } from '@forge/db';
import { chunkText, fetchPublicPage } from './knowledge.js';

const db = getDb();
const MAX_TEXT_LENGTH = 500_000;

export async function enqueueKnowledgeJob(input: { workspaceId: string; agentId: string; sourceId: string }) {
  await db.update(knowledgeSources).set({ status: 'processing', error: null, processingStartedAt: null, updatedAt: new Date() }).where(and(eq(knowledgeSources.id, input.sourceId), eq(knowledgeSources.agentId, input.agentId)));
  const [job] = await db.insert(knowledgeJobs).values({ ...input, status: 'queued', step: 'queued', progress: 0 }).returning();
  return job;
}

async function requeueStaleJobs() {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  await db.update(knowledgeJobs).set({ status: 'queued', step: 'recovered', progress: 0, lockedAt: null, lockedBy: null, updatedAt: new Date() }).where(and(eq(knowledgeJobs.status, 'processing'), lt(knowledgeJobs.lockedAt, staleBefore)));
}

async function claimJob(workerId: string, onlyJobId?: string) {
  return db.transaction(async (tx) => {
    const condition = onlyJobId ? and(eq(knowledgeJobs.id, onlyJobId), eq(knowledgeJobs.status, 'queued')) : eq(knowledgeJobs.status, 'queued');
    const [job] = await tx.select().from(knowledgeJobs).where(condition).orderBy(asc(knowledgeJobs.createdAt)).limit(1).for('update', { skipLocked: true });
    if (!job) return null;
    const [claimed] = await tx.update(knowledgeJobs).set({ status: 'processing', step: 'reading', progress: 10, attempts: job.attempts + 1, lockedAt: new Date(), lockedBy: workerId, startedAt: job.startedAt ?? new Date(), error: null, updatedAt: new Date() }).where(eq(knowledgeJobs.id, job.id)).returning();
    return claimed;
  });
}

async function processClaimedJob(job: typeof knowledgeJobs.$inferSelect) {
  try {
    const [source] = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, job.sourceId), eq(knowledgeSources.agentId, job.agentId))).limit(1);
    if (!source) throw new Error('Knowledge source no longer exists');
    const [agent] = await db.select({ workspaceId: agents.workspaceId }).from(agents).where(eq(agents.id, job.agentId)).limit(1);
    if (!agent || agent.workspaceId !== job.workspaceId) throw new Error('Knowledge job ownership mismatch');

    await db.update(knowledgeSources).set({ status: 'processing', processingStartedAt: new Date(), error: null, updatedAt: new Date() }).where(eq(knowledgeSources.id, source.id));
    await db.update(knowledgeJobs).set({ step: source.type === 'url' ? 'fetching' : 'normalizing', progress: 30, updatedAt: new Date() }).where(eq(knowledgeJobs.id, job.id));

    const candidate = source.type === 'url' && source.url ? await fetchPublicPage(source.url) : source.rawText;
    const rawText = candidate.trim().slice(0, MAX_TEXT_LENGTH);
    if (!rawText) throw new Error('Knowledge source has no extractable text');

    await db.update(knowledgeJobs).set({ step: 'chunking', progress: 60, updatedAt: new Date() }).where(eq(knowledgeJobs.id, job.id));
    const chunks = chunkText(rawText);
    await db.transaction(async (tx) => {
      await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id));
      if (chunks.length) await tx.insert(knowledgeChunks).values(chunks.map((content, position) => ({ sourceId: source.id, agentId: source.agentId, content, position })));
    });

    const completedAt = new Date();
    const contentHash = createHash('sha256').update(rawText).digest('hex');
    await db.update(knowledgeJobs).set({ status: 'completed', step: 'completed', progress: 100, completedAt, lockedAt: null, lockedBy: null, updatedAt: completedAt }).where(eq(knowledgeJobs.id, job.id));
    await db.update(knowledgeSources).set({ status: 'ready', rawText, contentHash, characterCount: rawText.length, chunkCount: chunks.length, lastProcessedAt: completedAt, processingStartedAt: null, error: null, updatedAt: completedAt }).where(eq(knowledgeSources.id, source.id));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown knowledge worker error';
    const exhausted = job.attempts >= job.maxAttempts;
    await db.update(knowledgeJobs).set({ status: exhausted ? 'failed' : 'queued', step: exhausted ? 'failed' : 'retrying', progress: 0, error: message.slice(0, 10_000), completedAt: exhausted ? new Date() : null, lockedAt: null, lockedBy: null, updatedAt: new Date() }).where(eq(knowledgeJobs.id, job.id));
    if (exhausted) await db.update(knowledgeSources).set({ status: 'failed', error: message.slice(0, 10_000), processingStartedAt: null, updatedAt: new Date() }).where(eq(knowledgeSources.id, job.sourceId));
    return false;
  }
}

export async function drainKnowledgeJobs(input: { limit?: number; onlyJobId?: string; workerId?: string } = {}) {
  await requeueStaleJobs();
  const workerId = input.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const limit = Math.max(1, Math.min(20, input.limit ?? 5));
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const job = await claimJob(workerId, input.onlyJobId);
    if (!job) break;
    await processClaimedJob(job);
    processed += 1;
    if (input.onlyJobId) break;
  }
  return { processed, workerId };
}
