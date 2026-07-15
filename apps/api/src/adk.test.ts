import { describe, expect, it } from 'vitest';
import { hasGoogleCredentials, hasOpenRouterCredentials, normalizeOpenRouterModel, runtimeProvider } from './adk.js';

describe('Google model authentication', () => {
  it('accepts an API key', () => {
    expect(hasGoogleCredentials({ GOOGLE_API_KEY: 'configured' })).toBe(true);
  });

  it('accepts a complete Vertex AI configuration', () => {
    expect(hasGoogleCredentials({
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
      GOOGLE_CLOUD_PROJECT: 'example-project',
      GOOGLE_CLOUD_LOCATION: 'global',
    })).toBe(true);
  });

  it('rejects incomplete model credentials', () => {
    expect(hasGoogleCredentials({})).toBe(false);
    expect(hasGoogleCredentials({ GOOGLE_GENAI_USE_VERTEXAI: 'true', GOOGLE_CLOUD_PROJECT: 'example-project' })).toBe(false);
  });
});

describe('multi-provider model runtime', () => {
  it('uses OpenRouter for provider-qualified models', () => {
    expect(hasOpenRouterCredentials({ OPENROUTER_API_KEY: 'configured' })).toBe(true);
    expect(runtimeProvider('openai/gpt-5.4', { OPENROUTER_API_KEY: 'configured' })).toBe('openrouter');
    expect(normalizeOpenRouterModel('gemini-2.5-flash')).toBe('google/gemini-2.5-flash');
  });

  it('uses OpenRouter for legacy Gemini models when Google is absent', () => {
    expect(runtimeProvider('gemini-2.5-flash', { OPENROUTER_API_KEY: 'configured' })).toBe('openrouter');
  });

  it('reports every supported credential path when none is configured', () => {
    expect(() => runtimeProvider('gemini-2.5-flash', {})).toThrow(/OPENROUTER_API_KEY/);
    expect(() => runtimeProvider('openai/gpt-5.4', { GOOGLE_API_KEY: 'configured' })).toThrow(/OPENROUTER_API_KEY/);
  });
});
