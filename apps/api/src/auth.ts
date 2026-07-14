import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, SignJWT, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { and, eq, externalIdentities, getDb, memberships, users, workspaces } from '@forge/db';

const scrypt = promisify(scryptCallback);
const secret = () => {
  if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) throw new Error('AUTH_SECRET is required in production');
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? 'development-only-change-this-secret-32');
};

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createToken(userId: string, workspaceId: string) {
  return new SignJWT({ workspaceId }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('7d').sign(secret());
}

export function legacyAuthAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== 'production' || !env.NEON_AUTH_ISSUER || env.ALLOW_LEGACY_AUTH === 'true';
}

export function assertLegacyAuthAllowed(env: NodeJS.ProcessEnv = process.env) {
  if (!legacyAuthAllowed(env)) throw Object.assign(new Error('Use o Google para entrar.'), { statusCode: 404, code: 'LEGACY_AUTH_DISABLED' });
}

export function neonIdentityClaims(payload: JWTPayload) {
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : typeof payload.given_name === 'string' ? payload.given_name.trim() : '';
  if (!payload.iss || !payload.sub || !email) throw Object.assign(new Error('Neon Auth token is missing required identity claims'), { statusCode: 401, code: 'INVALID_NEON_CLAIMS' });
  return { issuer: payload.iss, subject: payload.sub, email, name: name || email.split('@')[0] || 'Forge user' };
}

let neonJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export async function verifyNeonJwt(token: string, config: { issuer: string; jwks: JWTVerifyGetKey; audience?: string }) {
  const { payload } = await jwtVerify(token, config.jwks, { issuer: config.issuer.replace(/\/$/, ''), ...(config.audience ? { audience: config.audience } : {}) });
  return neonIdentityClaims(payload);
}

async function verifyNeonToken(token: string) {
  const issuer = process.env.NEON_AUTH_ISSUER?.replace(/\/$/, '');
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
  if (!issuer || !jwksUrl) throw Object.assign(new Error('Neon Auth is not configured'), { statusCode: 503, code: 'NEON_AUTH_NOT_CONFIGURED' });
  neonJwks ??= createRemoteJWKSet(new URL(jwksUrl));
  return verifyNeonJwt(token, { issuer, jwks: neonJwks, audience: process.env.NEON_AUTH_AUDIENCE });
}

const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 36) || 'workspace';

async function provisionNeonIdentity(claims: ReturnType<typeof neonIdentityClaims>) {
  const db = getDb();
  const [existing] = await db.select({ userId: externalIdentities.userId, workspaceId: memberships.workspaceId }).from(externalIdentities)
    .innerJoin(memberships, eq(memberships.userId, externalIdentities.userId))
    .where(and(eq(externalIdentities.issuer, claims.issuer), eq(externalIdentities.subject, claims.subject))).limit(1);
  if (existing) return existing;

  const [emailOwner] = await db.select({ id: users.id }).from(users).where(eq(users.email, claims.email)).limit(1);
  if (emailOwner) throw Object.assign(new Error('Este email já pertence a outra forma de acesso. Entre com ela para vincular o Google com segurança.'), { statusCode: 409, code: 'ACCOUNT_LINK_REQUIRED' });

  return db.transaction(async (tx) => {
    const [raced] = await tx.select({ userId: externalIdentities.userId, workspaceId: memberships.workspaceId }).from(externalIdentities)
      .innerJoin(memberships, eq(memberships.userId, externalIdentities.userId))
      .where(and(eq(externalIdentities.issuer, claims.issuer), eq(externalIdentities.subject, claims.subject))).limit(1);
    if (raced) return raced;
    const [user] = await tx.insert(users).values({ email: claims.email, name: claims.name, passwordHash: null }).returning();
    const [workspace] = await tx.insert(workspaces).values({ name: `${claims.name} workspace`, slug: `${slugify(claims.name)}-${user.id.slice(0, 8)}` }).returning();
    await tx.insert(memberships).values({ userId: user.id, workspaceId: workspace.id, role: 'owner' });
    await tx.insert(externalIdentities).values({ userId: user.id, provider: 'neon_google', issuer: claims.issuer, subject: claims.subject, emailAtLink: claims.email });
    return { userId: user.id, workspaceId: workspace.id };
  });
}

export async function requireAuth(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    try {
      return await provisionNeonIdentity(await verifyNeonToken(authorization.slice(7)));
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode) throw error;
      throw Object.assign(new Error('Invalid or expired Neon Auth session'), { statusCode: 401, code: 'INVALID_NEON_SESSION' });
    }
  }
  if (!legacyAuthAllowed()) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const token = request.cookies.forge_session;
  if (!token) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.workspaceId !== 'string') throw new Error('Invalid claims');
    return { userId: payload.sub, workspaceId: payload.workspaceId };
  } catch {
    throw Object.assign(new Error('Invalid or expired session'), { statusCode: 401 });
  }
}
