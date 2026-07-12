import { boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const agentStatus = pgEnum('agent_status', ['draft', 'ready', 'disabled']);
export const knowledgeStatus = pgEnum('knowledge_status', ['processing', 'ready', 'failed']);
export const knowledgeJobStatus = pgEnum('knowledge_job_status', ['queued', 'processing', 'completed', 'failed', 'canceled']);
export const evalRunStatus = pgEnum('eval_run_status', ['queued', 'running', 'passed', 'failed', 'error', 'canceled']);
export const evalBatchStatus = pgEnum('eval_batch_status', ['queued', 'running', 'completed', 'completed_with_errors', 'canceling', 'canceled']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(), email: text('email').notNull(),
  name: text('name').notNull(), passwordHash: text('password_hash').notNull(), ...timestamps,
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull(), slug: text('slug').notNull(), ...timestamps,
}, (t) => [uniqueIndex('workspaces_slug_uq').on(t.slug)]);

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }), role: text('role').notNull().default('owner'), ...timestamps,
}, (t) => [uniqueIndex('memberships_user_workspace_uq').on(t.userId, t.workspaceId)]);

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), slug: text('slug').notNull(), description: text('description').notNull().default(''),
  instructions: text('instructions').notNull(), model: text('model').notNull().default('gemini-2.5-flash'),
  promptDefinition: text('prompt_definition').notNull().default(''), guardrails: jsonb('guardrails').$type<string[]>().notNull().default([]),
  promptVersion: integer('prompt_version').notNull().default(1), promptGeneratedAt: timestamp('prompt_generated_at', { withTimezone: true }),
  status: agentStatus('status').notNull().default('ready'), ...timestamps,
}, (t) => [uniqueIndex('agents_workspace_slug_uq').on(t.workspaceId, t.slug), index('agents_workspace_idx').on(t.workspaceId)]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }), userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull().default('New conversation'), ...timestamps,
}, (t) => [index('conversations_workspace_idx').on(t.workspaceId), index('conversations_agent_idx').on(t.agentId)]);

export const knowledgeSources = pgTable('knowledge_sources', {
  id: uuid('id').primaryKey().defaultRandom(), agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), title: text('title').notNull(), url: text('url'), rawText: text('raw_text').notNull(),
  status: knowledgeStatus('status').notNull().default('processing'), active: boolean('active').notNull().default(true), error: text('error'),
  version: integer('version').notNull().default(1), contentHash: text('content_hash'), characterCount: integer('character_count').notNull().default(0),
  chunkCount: integer('chunk_count').notNull().default(0), processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
  lastProcessedAt: timestamp('last_processed_at', { withTimezone: true }), metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}), ...timestamps,
}, (t) => [index('knowledge_agent_idx').on(t.agentId)]);

export const knowledgeJobs = pgTable('knowledge_jobs', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }), sourceId: uuid('source_id').notNull().references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  status: knowledgeJobStatus('status').notNull().default('queued'), step: text('step').notNull().default('queued'), progress: integer('progress').notNull().default(0),
  attempts: integer('attempts').notNull().default(0), maxAttempts: integer('max_attempts').notNull().default(3), payload: jsonb('payload').$type<{ rawText?: string }>().notNull().default({}),
  lockedAt: timestamp('locked_at', { withTimezone: true }), lockedBy: text('locked_by'), startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }), error: text('error'), ...timestamps,
}, (t) => [index('knowledge_jobs_status_idx').on(t.status, t.createdAt), index('knowledge_jobs_source_idx').on(t.sourceId), index('knowledge_jobs_agent_idx').on(t.agentId)]);

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().defaultRandom(), sourceId: uuid('source_id').notNull().references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }), position: integer('position').notNull(), content: text('content').notNull(), ...timestamps,
}, (t) => [index('chunks_agent_idx').on(t.agentId)]);

export const evalScenarios = pgTable('eval_scenarios', {
  id: uuid('id').primaryKey().defaultRandom(), agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), input: text('input').notNull(), expectedBehavior: text('expected_behavior').notNull(),
  category: text('category').notNull().default('quality'), weight: real('weight').notNull().default(1), active: boolean('active').notNull().default(true),
  generatedBy: text('generated_by').notNull().default('manual'), sourceQuestion: text('source_question'), generationMetadata: jsonb('generation_metadata').$type<Record<string, unknown>>().notNull().default({}),
  assertions: jsonb('assertions').$type<{ mustContain?: string[]; mustNotContain?: string[]; maxLatencyMs?: number; minLength?: number }>().notNull().default({}), ...timestamps,
}, (t) => [index('eval_scenarios_agent_idx').on(t.agentId)]);

export const evalBatches = pgTable('eval_batches', {
  id: uuid('id').primaryKey().defaultRandom(), agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  status: evalBatchStatus('status').notNull().default('queued'), promptHash: text('prompt_hash').notNull(), promptSnapshot: text('prompt_snapshot').notNull(),
  candidateModel: text('candidate_model').notNull(), supervisorModel: text('supervisor_model').notNull(),
  config: jsonb('config').$type<{ scenarioIds: string[] }>().notNull(), summary: jsonb('summary').$type<Record<string, unknown>>(),
  promptReview: jsonb('prompt_review').$type<Record<string, unknown>>(), startedAt: timestamp('started_at', { withTimezone: true }), completedAt: timestamp('completed_at', { withTimezone: true }), ...timestamps,
}, (t) => [index('eval_batches_agent_idx').on(t.agentId)]);

export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(), scenarioId: uuid('scenario_id').notNull().references(() => evalScenarios.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull().references(() => evalBatches.id, { onDelete: 'cascade' }), agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }), status: evalRunStatus('status').notNull().default('queued'),
  score: real('score'), passed: boolean('passed'), response: text('response'), reasoning: text('reasoning'), latencyMs: integer('latency_ms'), metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}), ...timestamps,
  dimensionScores: jsonb('dimension_scores').$type<Record<string, number>>(), deterministicChecks: jsonb('deterministic_checks').$type<Array<{ id: string; label: string; passed: boolean; severity: string; detail: string }>>(),
  strengths: jsonb('strengths').$type<string[]>(), improvements: jsonb('improvements').$type<string[]>(), failureTags: jsonb('failure_tags').$type<string[]>(),
}, (t) => [index('eval_runs_agent_idx').on(t.agentId), index('eval_runs_scenario_idx').on(t.scenarioId), index('eval_runs_batch_idx').on(t.batchId)]);

export const modelCalls = pgTable('model_calls', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }), conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  evalRunId: uuid('eval_run_id').references(() => evalRuns.id, { onDelete: 'set null' }), kind: text('kind').notNull(), model: text('model').notNull(),
  status: text('status').notNull().default('succeeded'), input: text('input').notNull(), output: text('output'),
  inputTokens: integer('input_tokens').notNull().default(0), outputTokens: integer('output_tokens').notNull().default(0), totalTokens: integer('total_tokens').notNull().default(0),
  estimatedCostUsd: real('estimated_cost_usd').notNull().default(0), latencyMs: integer('latency_ms').notNull().default(0), error: text('error'),
  pricing: jsonb('pricing').$type<{ inputPerMillion: number; outputPerMillion: number; currency: string; source: string }>().notNull().default({ inputPerMillion: 0, outputPerMillion: 0, currency: 'USD', source: 'unknown' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}), ...timestamps,
}, (t) => [index('model_calls_workspace_idx').on(t.workspaceId, t.createdAt), index('model_calls_agent_idx').on(t.agentId, t.createdAt), index('model_calls_conversation_idx').on(t.conversationId)]);
