import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { legacyAuthAllowed, neonIdentityClaims, verifyNeonJwt } from './auth.js';

describe('Neon Auth boundary', () => {
  it('keys identity by verified issuer and subject while normalizing display email', () => {
    expect(neonIdentityClaims({ iss: 'https://auth.example', sub: 'google-sub', email: 'LUIZ@EXAMPLE.COM', name: 'Luiz' })).toEqual({
      issuer: 'https://auth.example', subject: 'google-sub', email: 'luiz@example.com', name: 'Luiz',
    });
  });

  it('rejects tokens without durable identity claims', () => {
    expect(() => neonIdentityClaims({ sub: 'missing-issuer', email: 'a@example.com' })).toThrow('required identity claims');
    expect(() => neonIdentityClaims({ iss: 'issuer', sub: 'missing-email' })).toThrow('required identity claims');
  });

  it('keeps legacy auth only as an explicit production fallback', () => {
    expect(legacyAuthAllowed({ NODE_ENV: 'development', NEON_AUTH_ISSUER: 'issuer' } as NodeJS.ProcessEnv)).toBe(true);
    expect(legacyAuthAllowed({ NODE_ENV: 'production', NEON_AUTH_ISSUER: 'issuer' } as NodeJS.ProcessEnv)).toBe(false);
    expect(legacyAuthAllowed({ NODE_ENV: 'production', NEON_AUTH_ISSUER: 'issuer', ALLOW_LEGACY_AUTH: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('verifies the configured issuer and JWKS signature', async () => {
    const issuer = 'https://auth.example';
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'neon-key', alg: 'ES256' };
    const token = await new SignJWT({ email: 'luiz@example.com', name: 'Luiz' }).setProtectedHeader({ alg: 'ES256', kid: 'neon-key' }).setIssuer(issuer).setSubject('google-sub').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    await expect(verifyNeonJwt(token, { issuer, jwks: createLocalJWKSet({ keys: [jwk] }) })).resolves.toMatchObject({ issuer, subject: 'google-sub' });
    await expect(verifyNeonJwt(token, { issuer: 'https://attacker.example', jwks: createLocalJWKSet({ keys: [jwk] }) })).rejects.toThrow();
    const attacker = await generateKeyPair('ES256');
    const attackerJwk = { ...(await exportJWK(attacker.publicKey)), kid: 'neon-key', alg: 'ES256' };
    await expect(verifyNeonJwt(token, { issuer, jwks: createLocalJWKSet({ keys: [attackerJwk] }) })).rejects.toThrow();
  });
});
