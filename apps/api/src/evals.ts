import { createHash } from 'node:crypto';

export const EVAL_DIMENSIONS = ['factuality', 'relevance', 'completeness', 'safety', 'style'] as const;
export type EvalDimension = typeof EVAL_DIMENSIONS[number];
export type EvalAssertions = { mustContain?: string[]; mustNotContain?: string[]; maxLatencyMs?: number; minLength?: number };
export type DeterministicCheck = { id: string; label: string; passed: boolean; severity: 'critical' | 'major' | 'minor'; detail: string };

export function promptFingerprint(agent: { name: string; description: string; instructions: string; model: string }, knowledgeVersion: string) {
  const snapshot = JSON.stringify({ agent: { name: agent.name, description: agent.description, instructions: agent.instructions, model: agent.model }, knowledgeVersion });
  return { snapshot, hash: createHash('sha256').update(snapshot).digest('hex') };
}

export function runDeterministicChecks(response: string, latencyMs: number, assertions: EvalAssertions = {}): DeterministicCheck[] {
  const normalized = response.toLocaleLowerCase();
  const checks: DeterministicCheck[] = [
    { id: 'non-empty', label: 'Resposta não vazia', passed: response.trim().length > 0, severity: 'critical', detail: `${response.trim().length} caracteres retornados.` },
  ];
  if (assertions.minLength != null) checks.push({ id: 'min-length', label: 'Comprimento mínimo', passed: response.trim().length >= assertions.minLength, severity: 'major', detail: `Esperado pelo menos ${assertions.minLength}; recebido ${response.trim().length}.` });
  if (assertions.maxLatencyMs != null) checks.push({ id: 'latency', label: 'Latência máxima', passed: latencyMs <= assertions.maxLatencyMs, severity: 'major', detail: `Limite ${assertions.maxLatencyMs}ms; recebido ${latencyMs}ms.` });
  for (const term of assertions.mustContain ?? []) checks.push({ id: `contains-${slug(term)}`, label: `Contém: ${term}`, passed: normalized.includes(term.toLocaleLowerCase()), severity: 'major', detail: normalized.includes(term.toLocaleLowerCase()) ? 'Termo encontrado.' : 'Termo obrigatório ausente.' });
  for (const term of assertions.mustNotContain ?? []) checks.push({ id: `excludes-${slug(term)}`, label: `Não contém: ${term}`, passed: !normalized.includes(term.toLocaleLowerCase()), severity: 'critical', detail: normalized.includes(term.toLocaleLowerCase()) ? 'Termo proibido encontrado.' : 'Termo proibido ausente.' });
  return checks;
}

export function aggregateEvalRuns(runs: Array<{ status: string; score: number | null; latencyMs: number | null; dimensionScores: Record<string, number> | null; failureTags: string[] | null; metadata?: Record<string, unknown> | null }>) {
  const terminal = runs.filter((run) => ['passed', 'failed', 'error', 'canceled'].includes(run.status));
  const scored = terminal.filter((run) => Number.isFinite(run.score));
  const dimensions = Object.fromEntries(EVAL_DIMENSIONS.map((dimension) => {
    const values = scored.map((run) => Number(run.dimensionScores?.[dimension])).filter(Number.isFinite);
    return [dimension, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0];
  }));
  return {
    total: runs.length, completed: terminal.length, passed: runs.filter((run) => run.status === 'passed').length,
    failed: runs.filter((run) => run.status === 'failed').length, errors: runs.filter((run) => run.status === 'error').length, canceled: runs.filter((run) => run.status === 'canceled').length,
    overallScore: scored.length ? scored.reduce((sum, run) => sum + Number(run.score), 0) / scored.length : 0,
    passRate: terminal.length ? runs.filter((run) => run.status === 'passed').length / terminal.length : 0,
    dimensions,
    averageLatencyMs: terminal.length ? terminal.reduce((sum, run) => sum + Number(run.latencyMs ?? 0), 0) / terminal.length : 0,
    totalTokens: terminal.reduce((sum, run) => sum + Number(run.metadata?.totalTokens ?? 0), 0),
    failureTags: [...new Set(terminal.flatMap((run) => run.failureTags ?? []))],
  };
}

export function buildEvalCsv(rows: Array<Record<string, unknown>>) {
  const columns = ['scenario', 'category', 'status', 'score', 'passed', 'latencyMs', ...EVAL_DIMENSIONS, 'reasoning', 'response', 'failureTags'];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30);
