import { describe, expect, it } from 'vitest';
import { estimateModelCost, pricingForModel } from './usage.js';

describe('model usage pricing', () => {
  it('estimates Gemini 2.5 Flash input and output independently', () => {
    const result = estimateModelCost('gemini-2.5-flash', { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 });
    expect(result.costUsd).toBe(2.8);
  });

  it('supports an environment override without exposing credentials', () => {
    const pricing = pricingForModel('custom-model', { GOOGLE_PRICING_JSON: JSON.stringify({ 'custom-model': { inputPerMillion: 2, outputPerMillion: 4, source: 'test' } }) });
    expect(pricing).toMatchObject({ inputPerMillion: 2, outputPerMillion: 4, source: 'test' });
  });

  it('marks unknown models as unpriced', () => {
    expect(pricingForModel('unknown')).toMatchObject({ inputPerMillion: 0, outputPerMillion: 0 });
  });
});
