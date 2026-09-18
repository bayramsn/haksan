/**
 * Demo seed kaynakta sabit parolalı bir super-admin hesabı açar (dev/CI için
 * gerekli). Koruma çalışma anındadır: ortam açıkça dev/test değilse komut
 * reddedilir, böylece yanlışlıkla üretim veritabanında çalıştırılamaz.
 */
import { describe, expect, it } from 'vitest';
import { assertDemoSeedAllowed } from '../src/db/seed/demo';

describe('demo seed guard', () => {
  it('dev ve test ortamında çalışır', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('production ortamında reddeder', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/reddedildi/);
  });

  it('NODE_ENV tanımsızsa reddeder', () => {
    expect(() => assertDemoSeedAllowed({} as NodeJS.ProcessEnv)).toThrow(/reddedildi/);
  });

  it('açık ALLOW_DEMO_SEED kapısıyla çalışır', () => {
    expect(() =>
      assertDemoSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });
});
