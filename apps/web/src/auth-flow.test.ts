import { describe, expect, it } from 'vitest';
import { postAuthDestination } from './App';
import { authUrlForPath, tokenFromPayload } from './auth-client';

describe('OAuth return flow', () => {
  it('builds Neon Auth endpoints without duplicate slashes and validates token payloads', () => {
    expect(authUrlForPath('https://example.neonauth.dev/auth/', '/token')).toBe('https://example.neonauth.dev/auth/token');
    expect(tokenFromPayload({ token: 'signed.jwt.value' })).toBe('signed.jwt.value');
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
