import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';

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

export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createToken(userId: string, workspaceId: string) {
  return new SignJWT({ workspaceId }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('7d').sign(secret());
}

export async function requireAuth(request: FastifyRequest) {
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
