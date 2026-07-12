import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './auth.js';

describe('password security', () => {
  it('accepts the original password and rejects a different one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).not.toContain('correct-horse-battery');
    await expect(verifyPassword('correct-horse-battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });
});
