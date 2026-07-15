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
  name: text('name').notNull(), passwordHash: text('password_hash'), ...timestamps,
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export const externalIdentities = pgTable('external_identities', {
  id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), issuer: text('issuer').notNull(), subject: text('subject').notNull(), emailAtLink: text('email_at_link'), ...timestamps,
}, (t) => [uniqueIndex('external_identities_issuer_subject_uq').on(t.issuer, t.subject), index('external_identities_user_idx').on(t.userId)]);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull(), slug: text('slug').notNull(), ...timestamps,
}, (t) => [uniqueIndex('workspaces_slug_uq').on(t.slug)]);

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }), role: text('role').notNull().default('owner'), ...timestamps,
}, (t) => [uniqueIndex('memberships_user_workspace_uq').on(t.userId, t.workspaceId)]);

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  lineageId: uuid('lineage_id').notNull().defaultRandom(),
  name: text('name').notNull(), slug: text('slug').notNull(), description: text('description').notNull().default(''),
  instructions: text('instructions').notNull(), model: text('model').notNull().default('gemini-2.5-flash'),
  reasoningEffort: text('reasoning_effort').notNull().default('none'),
  promptDefinition: text('prompt_definition').notNull().default(''), guardrails: jsonb('guardrails').$type<string[]>().notNull().default([]),
  promptVersion: integer('prompt_version').notNull().default(1), promptGeneratedAt: timestamp('prompt_generated_at', { withTimezone: true }),
  templateKey: text('template_key'), templateVersion: integer('template_version'),
  templateConfig: jsonb('template_config').$type<Record<string, unknown>>().notNull().default({}),
  isPublic: boolean('is_public').notNull().default(false), publicId: uuid('public_id').notNull().defaultRandom(), publishedAt: timestamp('published_at', { withTimezone: true }),
  status: agentStatus('status').notNull().default('ready'), ...timestamps,
}, (t) => [uniqueIndex('agents_workspace_slug_uq').on(t.workspaceId, t.slug), uniqueIndex('agents_lineage_uq').on(t.lineageId), uniqueIndex('agents_public_id_uq').on(t.publicId), index('agents_workspace_idx').on(t.workspaceId)]);

export const qualificationSessions = pgTable('qualification_sessions', {
  id: uuid('id').primaryKey().defaultRandom(), publicId: uuid('public_id').notNull().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('collecting'), currentQuestionKey: text('current_question_key').notNull().default('name'),
  answers: jsonb('answers').$type<Record<string, string>>().notNull().default({}), score: integer('score').notNull().default(0),
  outcome: text('outcome'), consentAcceptedAt: timestamp('consent_accepted_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }), ...timestamps,
}, (t) => [uniqueIndex('qualification_sessions_public_id_uq').on(t.publicId), index('qualification_sessions_agent_idx').on(t.agentId, t.createdAt), index('qualification_sessions_workspace_idx').on(t.workspaceId, t.createdAt)]);

export const qualificationEvents = pgTable('qualification_events', {
  id: uuid('id').primaryKey().defaultRandom(), sessionId: uuid('session_id').notNull().references(() => qualificationSessions.id, { onDelete: 'cascade' }),
  requestId: text('request_id').notNull(), questionKey: text('question_key').notNull(), answer: text('answer').notNull(),
  result: jsonb('result').$type<Record<string, unknown>>().notNull(), ...timestamps,
}, (t) => [uniqueIndex('qualification_events_session_request_uq').on(t.sessionId, t.requestId), index('qualification_events_session_idx').on(t.sessionId, t.createdAt)]);

export const scheduledBookings = pgTable('scheduled_bookings', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => qualificationSessions.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(), status: text('status').notNull().default('confirmed'),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(), endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  timeZone: text('time_zone').notNull().default('America/Sao_Paulo'), contactName: text('contact_name').notNull(),
  contact: text('contact').notNull(), company: text('company').notNull(), notes: text('notes').notNull().default(''), ...timestamps,
  externalProvider: text('external_provider'), externalEventId: text('external_event_id'), externalEventUrl: text('external_event_url'),
  externalConferenceUrl: text('external_conference_url'), externalSyncStatus: text('external_sync_status').notNull().default('not_required'),
  externalSyncError: text('external_sync_error'),
}, (t) => [uniqueIndex('scheduled_bookings_agent_start_uq').on(t.agentId, t.startAt), uniqueIndex('scheduled_bookings_session_uq').on(t.sessionId), uniqueIndex('scheduled_bookings_workspace_idempotency_uq').on(t.workspaceId, t.idempotencyKey), index('scheduled_bookings_workspace_idx').on(t.workspaceId, t.createdAt)]);

export const calendarConnections = pgTable('calendar_connections', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('google'), status: text('status').notNull().default('connected'),
  calendarId: text('calendar_id').notNull(), calendarName: text('calendar_name').notNull(), calendarTimeZone: text('calendar_time_zone').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token').notNull(), scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  connectedByUserId: uuid('connected_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }), tokenUpdatedAt: timestamp('token_updated_at', { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (t) => [uniqueIndex('calendar_connections_agent_provider_uq').on(t.agentId, t.provider), index('calendar_connections_workspace_idx').on(t.workspaceId, t.createdAt)]);

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

export const workspaceSubscriptions = pgTable('workspace_subscriptions', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  planKey: text('plan_key').notNull().default('trial'), status: text('status').notNull().default('trial_eligible'),
  stripeCustomerId: text('stripe_customer_id'), stripeSubscriptionId: text('stripe_subscription_id'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }), currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  trialStartedAt: timestamp('trial_started_at', { withTimezone: true }), trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false), graceUntil: timestamp('grace_until', { withTimezone: true }),
  providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }), ...timestamps,
}, (t) => [uniqueIndex('workspace_subscriptions_customer_uq').on(t.stripeCustomerId), uniqueIndex('workspace_subscriptions_subscription_uq').on(t.stripeSubscriptionId)]);

export const stripeEvents = pgTable('stripe_events', {
  eventId: text('event_id').primaryKey(), type: text('type').notNull(), payloadHash: text('payload_hash').notNull(),
  providerCreatedAt: timestamp('provider_created_at', { withTimezone: true }).notNull(), processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentUsageCounters = pgTable('agent_usage_counters', {
  lineageId: uuid('lineage_id').primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }), trialConsumed: integer('trial_consumed').notNull().default(0),
  trialReserved: integer('trial_reserved').notNull().default(0), paidConsumed: integer('paid_consumed').notNull().default(0), paidReserved: integer('paid_reserved').notNull().default(0),
  periodStart: timestamp('period_start', { withTimezone: true }), periodEnd: timestamp('period_end', { withTimezone: true }), ...timestamps,
}, (t) => [index('agent_usage_workspace_idx').on(t.workspaceId), index('agent_usage_agent_idx').on(t.agentId)]);

export const requestReservations = pgTable('request_reservations', {
  id: uuid('id').primaryKey().defaultRandom(), idempotencyKey: text('idempotency_key').notNull(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }), lineageId: uuid('lineage_id').notNull(), bucket: text('bucket').notNull(),
  status: text('status').notNull().default('reserved'), periodStart: timestamp('period_start', { withTimezone: true }), committedAt: timestamp('committed_at', { withTimezone: true }), releasedAt: timestamp('released_at', { withTimezone: true }), ...timestamps,
}, (t) => [uniqueIndex('request_reservations_workspace_key_uq').on(t.workspaceId, t.idempotencyKey), index('request_reservations_lineage_idx').on(t.lineageId, t.createdAt)]);

export const benchlineConnections = pgTable('benchline_connections', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }), status: text('status').notNull().default('disconnected'),
  consentVersion: text('consent_version'), consentedBy: uuid('consented_by').references(() => users.id, { onDelete: 'set null' }),
  consentScopes: jsonb('consent_scopes').$type<string[]>().notNull().default([]), consentedAt: timestamp('consented_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }), remoteWorkspaceId: text('remote_workspace_id'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }), lastError: text('last_error'), ...timestamps,
});

export const benchlineAgentMappings = pgTable('benchline_agent_mappings', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }), remoteAgentId: text('remote_agent_id'), remoteTwinId: text('remote_twin_id'),
  status: text('status').notNull().default('pending'), lastSyncAt: timestamp('last_sync_at', { withTimezone: true }), lastError: text('last_error'), ...timestamps,
}, (t) => [uniqueIndex('benchline_agent_mappings_agent_uq').on(t.agentId), index('benchline_agent_mappings_workspace_idx').on(t.workspaceId)]);
