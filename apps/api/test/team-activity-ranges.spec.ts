/**
 * Kıyas dönemi adil olmalı: çarşamba günü bakan biri bu haftanın 2 gününü
 * geçen haftanın 7 gününe karşı görmemeli. Önceki aralık, içinde bulunulan
 * dönemde geçen kadar süreyi kapsar.
 *
 * Çapalar ofsetli ISO ile verilir, sınırlar İstanbul takviminde okunur: sonuç
 * sunucunun saat diliminden (CI'da UTC, yerelde İstanbul) bağımsız olmalı.
 */
import { describe, expect, it } from 'vitest';
import { teamActivityRanges } from '../src/modules/reports/reports.service';

const hours = (ms: number) => Math.round(ms / 3_600_000);
/** Bir anın İstanbul duvar saati: `2026-09-14 00:00`. */
const ist = (date: Date) =>
  date.toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 16);
const istWeekday = (date: Date) =>
  date.toLocaleDateString('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short' });

describe('ekip aktivitesi dönem aralıkları', () => {
  it('hafta: geçen haftanın yalnız aynı kadarlık kısmını alır', () => {
    // Çarşamba 12:00 → haftanın 2.5 günü geçti.
    const anchor = new Date('2026-09-02T12:00:00+03:00');
    const range = teamActivityRanges('week', anchor);

    expect(istWeekday(range.from)).toBe('Mon');
    expect(hours(range.to.getTime() - range.from.getTime())).toBe(24 * 7);
    // Önceki pencere de aynı uzunlukta: 2.5 gün.
    expect(hours(range.prevTo.getTime() - range.prevFrom.getTime()))
      .toBe(hours(anchor.getTime() - range.from.getTime()));
    expect(hours(range.from.getTime() - range.prevFrom.getTime())).toBe(24 * 7);
  });

  it('dönem tamamlandığında önceki pencere tam döneme eşitlenir', () => {
    // Pazar 23:59 → hafta bitmek üzere; önceki pencere de neredeyse 7 gün.
    const anchor = new Date('2026-09-06T23:59:00+03:00');
    const range = teamActivityRanges('week', anchor);
    const previousLength = range.prevTo.getTime() - range.prevFrom.getTime();
    expect(previousLength).toBeLessThanOrEqual(range.to.getTime() - range.from.getTime());
    expect(hours(previousLength)).toBe(24 * 7);
  });

  it('ay: geçen ayın aynı gününe kadar bakar', () => {
    const anchor = new Date('2026-09-03T09:00:00+03:00'); // 3 Eylül 09:00
    const range = teamActivityRanges('month', anchor);
    expect(ist(range.from)).toBe('2026-09-01 00:00');
    expect(ist(range.prevFrom)).toBe('2026-08-01 00:00');
    // Ağustosun 2 gün 9 saati.
    expect(hours(range.prevTo.getTime() - range.prevFrom.getTime())).toBe(24 * 2 + 9);
  });

  it('dönemin ilk anında önceki pencere boş kalmaz, tam döneme düşer', () => {
    const anchor = new Date('2026-09-07T00:00:00+03:00'); // pazartesi 00:00
    const range = teamActivityRanges('week', anchor);
    expect(range.prevTo.getTime()).toBe(range.from.getTime());
    expect(hours(range.prevTo.getTime() - range.prevFrom.getTime())).toBe(24 * 7);
  });

  it('gün sınırı İstanbul gece yarısıdır, sunucunun UTC olması sonucu değiştirmez', () => {
    // 17 Eylül 01:30 İstanbul = 16 Eylül 22:30 UTC. UTC takviminde hâlâ "dün".
    const anchor = new Date('2026-09-17T01:30:00+03:00');
    const day = teamActivityRanges('day', anchor);
    expect(ist(day.from)).toBe('2026-09-17 00:00');
    expect(ist(day.to)).toBe('2026-09-18 00:00');
    expect(day.from.toISOString()).toBe('2026-09-16T21:00:00.000Z');

    const week = teamActivityRanges('week', anchor);
    expect(ist(week.from)).toBe('2026-09-14 00:00');
    expect(ist(week.to)).toBe('2026-09-21 00:00');

    const year = teamActivityRanges('year', anchor);
    expect(ist(year.from)).toBe('2026-01-01 00:00');
    expect(ist(year.prevFrom)).toBe('2025-01-01 00:00');
  });

  it('saatsiz (00:00Z) girilen kayıt kendi İstanbul gününde kalır', () => {
    // Web formu "2026-09-16" tarihini 00:00Z olarak gönderir (İstanbul 03:00).
    const recorded = new Date('2026-09-16T00:00:00Z');
    const { from, to } = teamActivityRanges('day', new Date('2026-09-16T15:00:00+03:00'));
    expect(recorded >= from && recorded < to).toBe(true);
    // Yarına tarihlenmiş kayıt bugünün dışında kalır.
    const tomorrow = new Date('2026-09-17T00:00:00Z');
    expect(tomorrow < to).toBe(false);
  });
});
