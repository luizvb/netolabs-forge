import { describe, expect, it } from 'vitest';
import { hashPassword, legacyAuthAllowed, verifyPassword } from './auth.js';

describe('password security', () => {
  it('accepts the original password and rejects a different one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).not.toContain('correct-horse-battery');
    await expect(verifyPassword('correct-horse-battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('fails closed for legacy password auth in production', () => {
    expect(legacyAuthAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(legacyAuthAllowed({ NODE_ENV: 'production', NEON_AUTH_ISSUER: '', ALLOW_LEGACY_AUTH: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(legacyAuthAllowed({ NODE_ENV: 'production', ALLOW_LEGACY_AUTH: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(legacyAuthAllowed({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
  });
});
