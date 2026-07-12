import type { ModelUsage } from './adk.js';

export type ModelPricing = { inputPerMillion: number; outputPerMillion: number; currency: 'USD'; source: string };

const OFFICIAL_PRICING: Record<string, ModelPricing> = {
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5, currency: 'USD', source: 'Google Gemini standard pricing, 2026-07-12' },
  'gemini-2.5-flash-lite': { inputPerMillion: 0.1, outputPerMillion: 0.4, currency: 'USD', source: 'Google Gemini standard pricing, 2026-07-12' },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10, currency: 'USD', source: 'Google Gemini standard pricing, 2026-07-12' },
};

export function pricingForModel(model: string, env = process.env): ModelPricing {
  if (env.GOOGLE_PRICING_JSON) {
    try {
      const custom = JSON.parse(env.GOOGLE_PRICING_JSON) as Record<string, Partial<ModelPricing>>;
      const match = custom[model];
      if (match && Number.isFinite(match.inputPerMillion) && Number.isFinite(match.outputPerMillion)) {
        return { inputPerMillion: Number(match.inputPerMillion), outputPerMillion: Number(match.outputPerMillion), currency: 'USD', source: match.source ?? 'GOOGLE_PRICING_JSON' };
      }
    } catch {
      // Invalid overrides fall back to the reviewed public price table.
    }
  }
  return OFFICIAL_PRICING[model] ?? { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD', source: 'Unpriced model' };
}

export function estimateModelCost(model: string, usage: ModelUsage, env = process.env) {
  const pricing = pricingForModel(model, env);
  const cost = (usage.inputTokens * pricing.inputPerMillion + usage.outputTokens * pricing.outputPerMillion) / 1_000_000;
  return { costUsd: Number(cost.toFixed(8)), pricing };
}
