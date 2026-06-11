import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const provider = (process.env.DB_PROVIDER ?? 'postgres') as 'postgres' | 'mysql' | 'sqlite';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: provider === 'mysql' ? 'mysql' : provider === 'sqlite' ? 'sqlite' : 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://haksan:haksan_dev_pwd@localhost:5432/haksan',
  },
  strict: true,
  verbose: true,
});
