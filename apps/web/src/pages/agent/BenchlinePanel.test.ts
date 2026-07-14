import { describe, expect, it } from 'vitest';
import { benchlinePanelMode } from './BenchlinePanel';

describe('Benchline panel states', () => {
  it.each(['connected', 'partial', 'syncing', 'error', 'revocation_pending', 'revoked', 'unavailable'])('keeps %s distinct', (status) => {
    expect(benchlinePanelMode(status)).toBe(status);
  });

  it('uses consent only for a disconnected or unknown state', () => {
    expect(benchlinePanelMode('disconnected')).toBe('consent');
  });
});
