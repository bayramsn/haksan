import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const provider = (process.env.DB_PROVIDER ?? 'postgres') as 'postgres' | 'mysql' | 'sqlite';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set before running Drizzle commands.');
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: provider === 'mysql' ? 'mysql' : provider === 'sqlite' ? 'sqlite' : 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
