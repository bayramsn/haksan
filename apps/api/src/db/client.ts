import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { loadEnv } from '../config/env';

let _pool: Pool | undefined;
let _db: NodePgDatabase<typeof schema> | undefined;

export function getPool(): Pool {
  if (!_pool) {
    const env = loadEnv();
    _pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      // Managed Postgres TLS (env.DATABASE_SSL=true). Sertifika doğrulaması
      // kapatılamaz; özel CA gereken kurulumlar CA'yı ortamdan sağlar.
      ssl: env.DATABASE_SSL
        ? {
            rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
            ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}),
          }
        : undefined,
    });
  }
  return _pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export type DbClient = NodePgDatabase<typeof schema>;
export { schema };

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
    _db = undefined;
  }
}
