import { describe, expect, it } from 'vitest';
import { BENCHLINE_CONSENT_SCOPES, forgeAgentPayload } from './benchline.js';

describe('Benchline privacy allowlist', () => {
  it('sends agent definition fields but never knowledge, conversations or model calls', () => {
    const payload = forgeAgentPayload({ id: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222', lineageId: '33333333-3333-4333-8333-333333333333', name: 'Support', slug: 'support', description: 'Safe', instructions: 'Only official data', model: 'gemini', reasoningEffort: 'none', promptDefinition: 'private drafting context', guardrails: ['No secrets'], promptVersion: 2, promptGeneratedAt: null, isPublic: false, publicId: '44444444-4444-4444-8444-444444444444', publishedAt: null, status: 'ready', createdAt: new Date(), updatedAt: new Date() });
    expect(Object.keys(payload).sort()).toEqual(['description', 'externalAgentId', 'guardrails', 'instructions', 'model', 'name', 'promptVersion', 'status'].sort());
    expect(JSON.stringify(payload)).not.toContain('promptDefinition');
    expect(JSON.stringify(payload)).not.toContain('knowledge');
  });

  it('uses the versioned explicit consent scope allowlist', () => {
    expect(BENCHLINE_CONSENT_SCOPES).toEqual(['account_profile', 'workspace_profile', 'agent_definition', 'eval_summary']);
  });
});
