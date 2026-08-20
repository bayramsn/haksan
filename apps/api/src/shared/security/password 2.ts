import * as argon2 from 'argon2';

/**
 * Sabitlenmiş Argon2id parametreleri (OWASP Password Storage Cheat Sheet, 2024):
 * m=19 MiB, t=2, p=1. Kütüphane varsayılanına bağlı kalmak yerine açıkça pinlenir
 * ki sürüm yükseltmeleri maliyeti sessizce değiştirmesin. (CLAUDE.md #4)
 *
 * Not: argon2.verify() parametreleri hash'in kendisinden okur; eski hash'ler bu
 * değer değişse de doğrulanmaya devam eder.
 */
export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}
