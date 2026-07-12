import { describe, expect, it } from 'vitest';
import { aggregateEvalRuns, buildEvalCsv, promptFingerprint, runDeterministicChecks } from './evals.js';

describe('eval domain', () => {
  it('fingerprints every behavior-changing prompt input', () => {
    const base = { name: 'Support', description: 'Answers', instructions: 'Only answer from context', model: 'gemini-flash-latest' };
    expect(promptFingerprint(base, 'v1').hash).toBe(promptFingerprint(base, 'v1').hash);
    expect(promptFingerprint(base, 'v1').hash).not.toBe(promptFingerprint({ ...base, instructions: 'Changed' }, 'v1').hash);
    expect(promptFingerprint(base, 'v1').hash).not.toBe(promptFingerprint(base, 'v2').hash);
  });

  it('forces explicit deterministic assertions', () => {
    const checks = runDeterministicChecks('This answer contains secret', 1500, { mustContain: ['answer'], mustNotContain: ['secret'], maxLatencyMs: 1000, minLength: 10 });
    expect(checks.filter((check) => !check.passed).map((check) => check.id)).toEqual(['latency', 'excludes-secret']);
    expect(checks.find((check) => check.id === 'excludes-secret')?.severity).toBe('critical');
  });

  it('aggregates dimensions and exports safe CSV', () => {
    const summary = aggregateEvalRuns([{ status: 'passed', score: 9, latencyMs: 100, dimensionScores: { factuality: 9, relevance: 8, completeness: 9, safety: 10, style: 8 }, failureTags: [], metadata: { totalTokens: 42 } }]);
    expect(summary.overallScore).toBe(9); expect(summary.passRate).toBe(1); expect(summary.totalTokens).toBe(42);
    expect(buildEvalCsv([{ scenario: 'A, B', response: 'said "yes"' }])).toContain('"A, B"');
  });
});
