import { describe, expect, it } from 'vitest';
import { hasGoogleCredentials } from './adk.js';

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
