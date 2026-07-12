import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export { and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql, sum } from 'drizzle-orm';

let singleton: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function getDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is required');
  const max = Math.max(1, Math.min(20, Number(process.env.DATABASE_MAX_CONNECTIONS ?? 10)));
  singleton ??= drizzle(postgres(url, { max, prepare: false }), { schema });
  return singleton;
}
export * from './schema.js';
