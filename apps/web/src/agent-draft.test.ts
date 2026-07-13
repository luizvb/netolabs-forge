import { describe, expect, it } from 'vitest';
import { buildDraftPrompt } from './agent-draft';

describe('guest agent draft', () => {
  it('builds a safe publishable prompt without calling the API', () => {
    const result = buildDraftPrompt({
      name: 'Agente Comercial',
      description: 'Qualifica leads',
      definition: 'Consultar o histórico no CRM e escalar decisões sensíveis para uma pessoa.',
      guardrails: 'Nunca confirmar desconto sem aprovação',
      instructions: '',
      model: 'gemini-2.5-flash',
    });

    expect(result.source).toBe('forge-template');
    expect(result.instructions).toContain('Agente Comercial');
    expect(result.instructions).toContain('Nunca confirmar desconto sem aprovação');
    expect(result.instructions).toContain('Escalonamento');
    expect(result.guardrails.length).toBeGreaterThanOrEqual(6);
  });
});
