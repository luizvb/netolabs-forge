import { getDb, modelCalls } from '@forge/db';
import type { ModelUsage } from './adk.js';
import { estimateModelCost } from './usage.js';

const db = getDb();

export async function recordModelCall(input: {
  workspaceId: string;
  agentId?: string;
  conversationId?: string;
  evalRunId?: string;
  kind: string;
  model: string;
  status?: 'succeeded' | 'failed';
  request: string;
  response?: string;
  usage?: ModelUsage;
  latencyMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const usage = input.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const estimate = usage.costUsd != null
    ? { costUsd: usage.costUsd, pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' as const, source: 'OpenRouter response' } }
    : estimateModelCost(input.model, usage);
  const [call] = await db.insert(modelCalls).values({
    workspaceId: input.workspaceId, agentId: input.agentId, conversationId: input.conversationId, evalRunId: input.evalRunId,
    kind: input.kind, model: input.model, status: input.status ?? 'succeeded', input: input.request.slice(0, 100_000), output: input.response?.slice(0, 200_000),
    inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens, estimatedCostUsd: estimate.costUsd,
    latencyMs: Math.max(0, Math.round(input.latencyMs)), error: input.error?.slice(0, 10_000), pricing: estimate.pricing, metadata: input.metadata ?? {},
  }).returning();
  return call;
}
