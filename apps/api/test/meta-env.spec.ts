import { afterEach, describe, expect, it, vi } from 'vitest';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://haksan:test@127.0.0.1:5432/haksan_test',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  S3_PROVIDER: 'supabase',
};

async function loadWith(overrides: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) vi.stubEnv(key, value);
  return import('../src/config/env');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Meta environment gates', () => {
  it('kısmi Meta secret yapılandırmasını reddeder', async () => {
    const { loadEnv } = await loadWith({ META_APP_ID: 'app-1' });
    expect(() => loadEnv()).toThrow(/META_APP_ID.*must be configured together/s);
  });

  it('tam ve 32-byte anahtarlı Meta yapılandırmasını kabul eder', async () => {
    const { loadEnv } = await loadWith({
      META_APP_ID: 'app-1',
      META_APP_SECRET: 'meta-app-secret',
      META_WEBHOOK_VERIFY_TOKEN: 'meta-verify-token',
      META_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      META_GRAPH_API_VERSION: 'v25.0',
    });

    expect(loadEnv()).toMatchObject({
      META_APP_ID: 'app-1',
      META_GRAPH_API_VERSION: 'v25.0',
    });
  });
});
