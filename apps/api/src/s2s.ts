import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const FORGE_S2S_HEADERS = {
  timestamp: 'x-forge-timestamp',
  idempotency: 'x-forge-idempotency-key',
  bodyHash: 'x-forge-body-sha256',
  signature: 'x-forge-signature',
} as const;

export const sha256 = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');

export function s2sCanonical(input: { method: string; path: string; timestamp: string; idempotencyKey: string; bodyHash: string }) {
  return [input.method.toUpperCase(), input.path, input.timestamp, input.idempotencyKey, input.bodyHash].join('\n');
}

export function signS2S(secret: string, input: { method: string; path: string; timestamp: string; idempotencyKey: string; body: string | Buffer }) {
  const bodyHash = sha256(input.body);
  const signature = createHmac('sha256', secret).update(s2sCanonical({ ...input, bodyHash })).digest('hex');
  return { bodyHash, signature };
}

export function verifyS2S(secret: string, input: { method: string; path: string; timestamp: string; idempotencyKey: string; body: string | Buffer; bodyHash: string; signature: string }, options: { now?: number; maxSkewSeconds?: number } = {}) {
  const now = options.now ?? Date.now();
  const maxSkew = (options.maxSkewSeconds ?? 300) * 1_000;
  const timestampMs = Number(input.timestamp) * 1_000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > maxSkew) return { ok: false as const, reason: 'stale' as const };
  const calculatedHash = sha256(input.body);
  if (!safeHexEqual(calculatedHash, input.bodyHash)) return { ok: false as const, reason: 'body_hash' as const };
  const expected = signS2S(secret, input).signature;
  if (!safeHexEqual(expected, input.signature)) return { ok: false as const, reason: 'signature' as const };
  return { ok: true as const };
}

function safeHexEqual(expected: string, actual: string) {
  if (!/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}
