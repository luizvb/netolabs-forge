import { describe, expect, it } from 'vitest';
import { postAuthDestination } from './App';
import { authUrlForPath, tokenFromPayload } from './auth-client';

describe('OAuth return flow', () => {
  it('builds Neon Auth endpoints without duplicate slashes and validates token payloads', () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ exp: Math.floor(Date.now() / 1_000) + 60 })}.signature`;
    expect(authUrlForPath('https://example.neonauth.dev/auth/', '/token')).toBe('https://example.neonauth.dev/auth/token');
    expect(tokenFromPayload({ token })).toBe(token);
    expect(tokenFromPayload({ token: 123 })).toBeNull();
  });

  it('returns a guest draft to the authenticated agent publisher', () => {
    expect(postAuthDestination(true, '/auth')).toBe('/agents/new');
    expect(postAuthDestination(true, '/')).toBe('/agents/new');
  });

  it('returns an ordinary auth callback to the dashboard', () => {
    expect(postAuthDestination(false, '/auth')).toBe('/');
    expect(postAuthDestination(false, '/agents')).toBeNull();
  });
});
