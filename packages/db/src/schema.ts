import { boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const agentStatus = pgEnum('agent_status', ['draft', 'ready', 'disabled']);
export const knowledgeStatus = pgEnum('knowledge_status', ['processing', 'ready', 'failed']);
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
  status: agentStatus('status').notNull().default('ready'), ...timestamps,
}, (t) => [uniqueIndex('agents_workspace_slug_uq').on(t.workspaceId, t.slug), index('agents_workspace_idx').on(t.workspaceId)]);

export const knowledgeSources = pgTable('knowledge_sources', {
  id: uuid('id').primaryKey().defaultRandom(), agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), title: text('title').notNull(), url: text('url'), rawText: text('raw_text').notNull(),
  status: knowledgeStatus('status').notNull().default('ready'), error: text('error'), ...timestamps,
}, (t) => [index('knowledge_agent_idx').on(t.agentId)]);

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().defaultRandom(), sourceId: uuid('source_id').notNull().references(() => knowledgeSources.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }), position: integer('position').notNull(), content: text('content').notNull(), ...timestamps,
}, (t) => [index('chunks_agent_idx').on(t.agentId)]);

export const evalScenarios = pgTable('eval_scenarios', {
  id: uuid('id').primaryKey().defaultRandom(), agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), input: text('input').notNull(), expectedBehavior: text('expected_behavior').notNull(),
  category: text('category').notNull().default('quality'), weight: real('weight').notNull().default(1), active: boolean('active').notNull().default(true),
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
