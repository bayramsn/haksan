import { afterEach, describe, expect, it, vi } from 'vitest';

const productionBase = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://haksan:password@127.0.0.1:5432/haksan',
  DATABASE_ALLOW_PLAINTEXT: 'true',
  CORS_ORIGINS: 'https://staging.example.com',
  COOKIE_DOMAIN: 'staging.example.com',
  COOKIE_SECURE: 'true',
  COOKIE_SAMESITE: 'strict',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  METRICS_TOKEN: 'metrics-token-for-test',
  S3_PROVIDER: 'minio',
  S3_ENDPOINT: 'https://storage.example.com',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  APP_PUBLIC_URL: 'https://staging.example.com',
  AUTH_DEV_RESET_TOKEN_RESPONSE: 'false',
  USER_MAIL_ENABLED: 'false',
};

async function loadWith(overrides: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...productionBase, ...overrides })) {
    vi.stubEnv(key, value);
  }
  return import('../src/config/env');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('deployment profile environment gates', () => {
  it('rejects an implicit local profile in production', async () => {
    const { loadEnv } = await loadWith({
      DEPLOYMENT_PROFILE: 'local',
      DB_BACKUP_ENABLED: 'false',
      DB_BACKUP_REQUIRED: 'false',
    });

    expect(() => loadEnv()).toThrow(/DEPLOYMENT_PROFILE.*explicit staging or production deployment profile/s);
  });

  it('allows disposable staging only without production backup claims', async () => {
    const { loadEnv } = await loadWith({
      DEPLOYMENT_PROFILE: 'staging',
      DB_BACKUP_ENABLED: 'false',
      DB_BACKUP_REQUIRED: 'false',
    });

    expect(loadEnv()).toMatchObject({
      DEPLOYMENT_PROFILE: 'staging',
      DB_BACKUP_ENABLED: false,
      DB_BACKUP_REQUIRED: false,
    });
  });

  it('rejects a production profile without mandatory backups', async () => {
    const { loadEnv } = await loadWith({
      DEPLOYMENT_PROFILE: 'production',
      DB_BACKUP_ENABLED: 'false',
      DB_BACKUP_REQUIRED: 'false',
    });

    expect(() => loadEnv()).toThrow(/DB_BACKUP_REQUIRED.*requires enabled and mandatory database backups/s);
  });

  it('accepts a production profile with mandatory backups', async () => {
    const { loadEnv } = await loadWith({
      DEPLOYMENT_PROFILE: 'production',
      DB_BACKUP_ENABLED: 'true',
      DB_BACKUP_REQUIRED: 'true',
    });

    expect(loadEnv()).toMatchObject({
      DEPLOYMENT_PROFILE: 'production',
      DB_BACKUP_ENABLED: true,
      DB_BACKUP_REQUIRED: true,
    });
  });
});
