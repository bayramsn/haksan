/**
 * Sabah brifingi tıklanamayan bir metin olmamalı: her satır bir ekrana gitmeli,
 * boş konular satır üretmemeli.
 */
import { describe, expect, it } from 'vitest';
import { buildMorningBriefingItems } from '../src/modules/automation/automation.service';

const counts = {
  leadBreaches: 27,
  overdueActions: 3,
  rotting: 35,
  overdueReceivables: 0,
  overdueReceivableTotal: '0 USD',
  staleQuotes: 0,
  staleQuoteDays: 7,
  openTickets: 1,
  expiringWarranties: 0,
  warrantyWindowDays: 30,
};

describe('buildMorningBriefingItems', () => {
  it('yalnız dolu konular için satır üretir', () => {
    const items = buildMorningBriefingItems(counts);
    expect(items.map((item) => item.label)).toEqual([
      '27 lead yanıt süresini aştı',
      '3 satış kartında takip tarihi geçti',
      '35 satış kartı aşamasında bekliyor',
      '1 açık servis kaydı',
    ]);
  });

  it('her satır bir ekran hedefi taşır', () => {
    for (const item of buildMorningBriefingItems(counts)) {
      expect(item.nav, item.label).toEqual(expect.any(String));
      expect(item.nav.length).toBeGreaterThan(0);
    }
  });

  it('bekleyen konu yoksa satır üretmez', () => {
    const empty = buildMorningBriefingItems({
      ...counts,
      leadBreaches: 0,
      overdueActions: 0,
      rotting: 0,
      openTickets: 0,
    });
    expect(empty).toEqual([]);
  });
});
