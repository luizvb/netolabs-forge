import { describe, expect, it } from 'vitest';
import { postAuthDestination } from './App';

describe('OAuth return flow', () => {
  it('returns a guest draft to the authenticated agent publisher', () => {
    expect(postAuthDestination(true, '/auth')).toBe('/agents/new');
    expect(postAuthDestination(true, '/')).toBe('/agents/new');
  });

  it('returns an ordinary auth callback to the dashboard', () => {
    expect(postAuthDestination(false, '/auth')).toBe('/');
    expect(postAuthDestination(false, '/agents')).toBeNull();
  });
});
