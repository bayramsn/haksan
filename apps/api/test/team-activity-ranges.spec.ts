/**
 * Kıyas dönemi adil olmalı: çarşamba günü bakan biri bu haftanın 2 gününü
 * geçen haftanın 7 gününe karşı görmemeli. Önceki aralık, içinde bulunulan
 * dönemde geçen kadar süreyi kapsar.
 */
import { describe, expect, it } from 'vitest';
import { teamActivityRanges } from '../src/modules/reports/reports.service';

const hours = (ms: number) => Math.round(ms / 3_600_000);

describe('ekip aktivitesi dönem aralıkları', () => {
  it('hafta: geçen haftanın yalnız aynı kadarlık kısmını alır', () => {
    // Çarşamba 12:00 → haftanın 2.5 günü geçti.
    const anchor = new Date(2026, 8, 2, 12, 0, 0);
    const range = teamActivityRanges('week', anchor);

    expect(range.from.getDay()).toBe(1); // pazartesi
    expect(hours(range.to.getTime() - range.from.getTime())).toBe(24 * 7);
    // Önceki pencere de aynı uzunlukta: 2.5 gün.
    expect(hours(range.prevTo.getTime() - range.prevFrom.getTime()))
      .toBe(hours(anchor.getTime() - range.from.getTime()));
    expect(hours(range.from.getTime() - range.prevFrom.getTime())).toBe(24 * 7);
  });

  it('dönem tamamlandığında önceki pencere tam döneme eşitlenir', () => {
    // Pazar 23:59 → hafta bitmek üzere; önceki pencere de neredeyse 7 gün.
    const anchor = new Date(2026, 8, 6, 23, 59, 0);
    const range = teamActivityRanges('week', anchor);
    const previousLength = range.prevTo.getTime() - range.prevFrom.getTime();
    expect(previousLength).toBeLessThanOrEqual(range.to.getTime() - range.from.getTime());
    expect(hours(previousLength)).toBe(24 * 7);
  });

  it('ay: geçen ayın aynı gününe kadar bakar', () => {
    const anchor = new Date(2026, 8, 3, 9, 0, 0); // 3 Eylül 09:00
    const range = teamActivityRanges('month', anchor);
    expect(range.from.getMonth()).toBe(8);
    expect(range.prevFrom.getMonth()).toBe(7); // ağustos
    // Ağustosun 2 gün 9 saati.
    expect(hours(range.prevTo.getTime() - range.prevFrom.getTime())).toBe(24 * 2 + 9);
  });

  it('dönemin ilk anında önceki pencere boş kalmaz, tam döneme düşer', () => {
    const anchor = new Date(2026, 8, 7, 0, 0, 0); // pazartesi 00:00
    const range = teamActivityRanges('week', anchor);
    expect(range.prevTo.getTime()).toBe(range.from.getTime());
    expect(hours(range.prevTo.getTime() - range.prevFrom.getTime())).toBe(24 * 7);
  });
});
