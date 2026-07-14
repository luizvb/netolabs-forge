import { describe, expect, it } from 'vitest';
import { signS2S, verifyS2S } from './s2s.js';

describe('Forge Benchline S2S signing', () => {
  const now = Date.parse('2026-07-13T12:00:00Z');
  const timestamp = String(Math.floor(now / 1_000));
  const base = { method: 'POST', path: '/partner/forge/v1/provision', timestamp, idempotencyKey: 'sync-1', body: '{"safe":true}' };

  it('accepts an intact request inside the replay window', () => {
    const signed = signS2S('shared-secret', base);
    expect(verifyS2S('shared-secret', { ...base, ...signed }, { now })).toEqual({ ok: true });
  });

  it('rejects stale, tampered and wrongly signed requests', () => {
    const signed = signS2S('shared-secret', base);
    expect(verifyS2S('shared-secret', { ...base, ...signed }, { now: now + 301_000 }).reason).toBe('stale');
    expect(verifyS2S('shared-secret', { ...base, ...signed, body: '{"safe":false}' }, { now }).reason).toBe('body_hash');
    expect(verifyS2S('another-secret', { ...base, ...signed }, { now }).reason).toBe('signature');
  });
});
