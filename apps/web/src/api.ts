export type Agent = {
  id: string; name: string; description: string; instructions: string; model: string; status: string; createdAt: string; updatedAt: string;
  promptDefinition: string; guardrails: string[]; promptVersion: number; promptGeneratedAt?: string | null;
  reasoningEffort: string; isPublic: boolean; publicId: string; publishedAt?: string | null;
  templateKey?: string | null; templateVersion?: number | null; templateConfig?: Record<string, unknown>;
};

export type AgentTemplate = { key: string; version: number; name: string; description: string; outcome: string; segments: readonly string[]; capabilities: readonly string[]; status: string };
export type QualificationConfig = { businessName: string; offerName: string; serviceArea: string; meetingTitle: string; minimumScore: number; timeZone: string; weekdays: number[]; startTime: string; endTime: string; meetingDurationMinutes: number; slotIntervalMinutes: number; bookingHorizonDays: number; minimumNoticeHours: number };
export type QualificationQuestion = { key: string; label: string; type: 'text' | 'long_text' | 'choice'; options?: Array<{ value: string; label: string }> };
export type AvailabilitySlot = { startAt: string; endAt: string; timeZone: string };
export type QualificationTurn = { sessionId?: string; status: 'collecting' | 'qualified' | 'disqualified' | 'booked'; message: string; question?: QualificationQuestion | null; slots?: AvailabilitySlot[]; booking?: { id: string; startAt: string; endAt: string; timeZone: string; status: string; conferenceUrl?: string | null } };
export type CalendarConnectionState = {
  configured: boolean;
  connection: null | { id: string; provider: 'google'; status: 'connected' | 'reauth_required'; calendarId: string; calendarName: string; calendarTimeZone: string; scopes: string[]; lastValidatedAt?: string | null; connectedAt: string };
};
export type GoogleCalendarItem = { id: string; summary: string; timeZone: string; primary: boolean; accessRole: string };
export type QualificationOperations = {
  agent: { id: string; name: string; status: string; isPublic: boolean }; config: QualificationConfig;
  metrics: { sessions: number; completed: number; qualified: number; booked: number; qualificationRate: number; bookingRate: number };
  leads: Array<{ id: string; publicId: string; status: string; score: number; outcome?: string | null; answers: Record<string, string>; createdAt: string; completedAt?: string | null }>;
  bookings: Array<{ id: string; sessionId: string; status: string; startAt: string; endAt: string; timeZone: string; contactName: string; contact: string; company: string; notes: string; externalProvider?: string | null; externalEventUrl?: string | null; externalConferenceUrl?: string | null; externalSyncStatus: string; createdAt: string }>;
};

export type KnowledgeJob = {
  id: string; status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled'; step: string; progress: number; attempts: number; maxAttempts: number;
  error?: string | null; createdAt: string; updatedAt: string; startedAt?: string | null; completedAt?: string | null;
};

export type Source = {
  id: string; title: string; type: string; url?: string | null; rawText?: string; status: 'processing' | 'ready' | 'failed'; active: boolean;
  version: number; characterCount: number; chunkCount: number; error?: string | null; contentHash?: string | null; createdAt: string; updatedAt: string;
  processingStartedAt?: string | null; lastProcessedAt?: string | null; metadata: Record<string, unknown>; latestJob?: KnowledgeJob | null;
};

export type KnowledgeDetail = Source & {
  chunks: Array<{ id: string; position: number; content: string; createdAt: string }>;
  jobs: KnowledgeJob[];
};

export type EvalSummary = { total: number; completed: number; passed: number; failed: number; errors: number; canceled: number; overallScore: number; passRate: number; dimensions: Record<string, number>; averageLatencyMs: number; totalTokens: number; failureTags: string[] };
export type Scenario = { id: string; name: string; input: string; expectedBehavior: string; category: string; generatedBy?: string; sourceQuestion?: string | null; assertions?: { mustContain?: string[]; mustNotContain?: string[]; maxLatencyMs?: number; minLength?: number }; latest: null | { status: string; score: number | null; reasoning: string | null; latencyMs: number | null } };
export type EvalCase = { id: string; status: string; score: number | null; passed: boolean | null; response: string | null; reasoning: string | null; latencyMs: number | null; dimensionScores: Record<string, number> | null; deterministicChecks: Array<{ id: string; label: string; passed: boolean; detail: string }> | null; strengths: string[] | null; improvements: string[] | null; failureTags: string[] | null; scenario: Scenario };
export type EvalBatch = { id: string; status: string; promptHash: string; candidateModel: string; supervisorModel: string; summary: EvalSummary | null; promptReview?: { summary: string; recurringStrengths: string[]; recurringFailures: string[]; adjustments: Array<{ priority: string; issue: string; change: string; expectedImpact: string }>; improvedPrompt: string; model: string; totalTokens: number; generatedAt: string } | null; createdAt: string; completedAt?: string | null; cases?: EvalCase[] };

export type ModelCall = {
  id: string; agentId?: string | null; agentName?: string; conversationId?: string | null; evalRunId?: string | null; kind: string; model: string;
  status: 'succeeded' | 'failed'; input: string; output?: string | null; inputTokens: number; outputTokens: number; totalTokens: number;
  estimatedCostUsd: number; latencyMs: number; error?: string | null; pricing: { inputPerMillion: number; outputPerMillion: number; currency: string; source: string };
  metadata: Record<string, unknown>; createdAt: string;
};

export type AnalyticsOverview = {
  rangeDays: number;
  totals: { agents: number; conversations: number; requests: number; inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number; averageLatencyMs: number; errorRate: number; evalPassRate: number };
  knowledge: { total: number; active: number; ready: number; processing: number; failed: number; queuedJobs: number; processingJobs: number };
  tests: { total: number; passed: number; failed: number };
  timeline: Array<{ date: string; requests: number; tokens: number; costUsd: number; errors: number }>;
  recentCalls: ModelCall[];
};

export type GeneratedPrompt = { instructions: string; summary: string; guardrails: string[]; assumptions: string[]; source: string; model: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } };

export const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> || {}) };
  const token = await neonAccessToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init?.body) headers['content-type'] = 'application/json';
  const response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? 'Não foi possível concluir a ação.');
  }
  return response.status === 204 ? undefined as T : response.json();
};

export class PublicApiError extends Error {
  code?: string;
  details?: Record<string, unknown>;
  constructor(message: string, code?: string, details?: Record<string, unknown>) { super(message); this.code = code; this.details = details; }
}

export const publicApi = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api${path}`, { ...init, headers: init?.body ? { 'content-type': 'application/json', ...(init.headers as Record<string, string> || {}) } : init?.headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new PublicApiError(body.message ?? 'Não foi possível concluir a ação.', body.code, body.details);
  return body as T;
};

export const apiForm = async <T,>(path: string, body: FormData): Promise<T> => {
  const token = await neonAccessToken();
  const response = await fetch(`/api${path}`, { method: 'POST', credentials: 'include', body, headers: token ? { authorization: `Bearer ${token}` } : undefined });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new Error(value.message ?? 'Não foi possível enviar o arquivo.');
  }
  return response.json();
};

export const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
export const formatDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Ainda não disponível';
export const formatMoney = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: value < 0.01 ? 4 : 2, maximumFractionDigits: value < 0.01 ? 6 : 2 }).format(value);
export const formatTokens = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : String(value);
export const formatDuration = (value: number) => value >= 1_000 ? `${(value / 1_000).toFixed(2)}s` : `${value}ms`;
import { neonAccessToken } from './auth-client';
