import { describe, expect, it } from 'vitest';
import { buildEvalScenarioTemplates, buildOfficialPromptTemplate } from './supervisor.js';

describe('supervisor fallbacks', () => {
  it('builds a complete prompt with grounding and injection guardrails', () => {
    const result = buildOfficialPromptTemplate({ name: 'Commercial agent', definition: 'Answer commercial questions about Project X.', guardrails: ['Never disclose discounts that are not documented.'] });
    expect(result.instructions).toContain('# Knowledge policy');
    expect(result.instructions).toContain('Never disclose discounts');
    expect(result.guardrails.length).toBeGreaterThanOrEqual(7);
  });

  it('turns user questions into scenarios and adds safety coverage', () => {
    const scenarios = buildEvalScenarioTemplates({ questions: ['What is the enterprise price?'], sourceTitles: ['Commercial policy'], count: 6 });
    expect(scenarios).toHaveLength(6);
    expect(scenarios[0]?.sourceQuestion).toBe('What is the enterprise price?');
    expect(scenarios.some((scenario) => scenario.category === 'safety')).toBe(true);
  });
});
