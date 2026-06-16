import { describe, expect, it } from 'vitest';
import { computeInstallationFee, roundBillableHours } from '@haksan/shared';

/**
 * Saha kurulum ücreti — saf fonksiyon birim testi (DB gerektirmez).
 * Kural: İlk saat tam; sonra 0–15 dk → tam, 16–45 dk → buçuk, 46–59 dk → üst saat.
 * Tarife: İstanbul içi 70$/saat, dışı 100$/saat.
 */
describe('roundBillableHours — saat yuvarlama', () => {
  it.each([
    [0, 0],
    [50, 1], // <1 saat → minimum 1 saat
    [60, 1], // 1:00
    [75, 1], // 1:15 → ilk 15 dk içinde
    [76, 1.5], // 1:16 → buçuğa
    [90, 1.5], // 1:30
    [104, 1.5], // 1:44
    [105, 1.5], // 1:45 → hâlâ buçuk
    [106, 2], // 1:46 → üst saat
    [120, 2], // 2:00
    [150, 2.5], // 2:30 → buçuğa
    [166, 3], // 2:46 → üst saate
  ])('%d dk → %s saat', (minutes, hours) => {
    expect(roundBillableHours(minutes)).toBe(hours);
  });
});

describe('computeInstallationFee — tarife', () => {
  it('İstanbul içi 70$/saat', () => {
    expect(computeInstallationFee(60, 'istanbul_ici').amount).toBe(70);
    expect(computeInstallationFee(76, 'istanbul_ici').amount).toBe(105); // 1.5 × 70
    expect(computeInstallationFee(106, 'istanbul_ici').amount).toBe(140); // 2 × 70
  });

  it('İstanbul dışı 100$/saat', () => {
    expect(computeInstallationFee(60, 'istanbul_disi').amount).toBe(100);
    expect(computeInstallationFee(76, 'istanbul_disi').amount).toBe(150); // 1.5 × 100
    expect(computeInstallationFee(106, 'istanbul_disi').amount).toBe(200); // 2 × 100
  });

  it('süre 0/negatif → ücret 0', () => {
    expect(computeInstallationFee(0, 'istanbul_ici').amount).toBe(0);
    expect(computeInstallationFee(-10, 'istanbul_disi').amount).toBe(0);
  });

  it('para birimi USD ve billedHours döner', () => {
    const fee = computeInstallationFee(90, 'istanbul_ici');
    expect(fee.currency).toBe('USD');
    expect(fee.billedHours).toBe(1.5);
    expect(fee.hourlyRate).toBe(70);
  });
});
