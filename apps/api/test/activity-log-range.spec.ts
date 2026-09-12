import { describe, expect, it } from 'vitest';

/**
 * Rapor gün sınırları İstanbul takviminde kurulmalı. Konteyner UTC çalıştığı
 * için `new Date('2026-09-01T00:00')` İstanbul'da 03:00'a denk geliyordu.
 */
const istanbulDayStart = (day: string) => new Date(`${day}T00:00:00+03:00`);

describe('aktivite raporu gün sınırları', () => {
  it('gün başlangıcını İstanbul gece yarısına kurar', () => {
    // 1 Eylül 00:00 İstanbul = 31 Ağustos 21:00 UTC.
    expect(istanbulDayStart('2026-09-01').toISOString()).toBe('2026-08-31T21:00:00.000Z');
  });

  it('bitiş gününün tamamını kapsar', () => {
    const to = istanbulDayStart('2026-09-12');
    to.setUTCDate(to.getUTCDate() + 1);
    // 13 Eylül 00:00 İstanbul; 12 Eylül 23:59 İstanbul hâlâ aralıkta.
    expect(to.toISOString()).toBe('2026-09-12T21:00:00.000Z');
    expect(new Date('2026-09-12T23:59:00+03:00') < to).toBe(true);
    expect(new Date('2026-09-13T00:01:00+03:00') < to).toBe(false);
  });

  it('gün başındaki kayıtları dışarıda bırakmaz', () => {
    const from = istanbulDayStart('2026-09-01');
    // Sunucu yerel saatiyle kurulan eski sınır bu kaydı atlıyordu.
    expect(new Date('2026-09-01T01:30:00+03:00') >= from).toBe(true);
  });
});
