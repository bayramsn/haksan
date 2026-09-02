/**
 * Hedef temposu uyarısı: sabah brifingi tenant geneline "N kişi geride" derken
 * haftalık iş, eşiği aşan kişinin kendisine ve yöneticisine yazar. Eşik
 * 15 puan — bunun altındaki sapma gürültüdür, uyarı üretmez.
 */
import { describe, expect, it } from 'vitest';
import { subjectsBehindPace, targetRiskMessage } from '../src/modules/automation/automation.service';

const subjects = [
  { userId: 'u1', name: 'Ayşe Yılmaz', average: 80 },
  { userId: 'u2', name: 'Barış Demir', average: 44 },
  { userId: 'u3', name: 'Cem Kaya', average: 55 },
];

describe('hedef temposu risk seçimi', () => {
  it('yalnız eşiği aşan kadar geride kalanları seçer', () => {
    // Beklenen %70: Ayşe 10 puan geride (eşik altı), Barış 26, Cem 15 puan geride.
    const behind = subjectsBehindPace(subjects, 70, 15);
    expect(behind.map((row) => row.userId)).toEqual(['u2']);
    expect(behind[0].gap).toBe(26);
  });

  it('en geriden başlayarak sıralar', () => {
    const behind = subjectsBehindPace(subjects, 90, 15);
    // Ayşe 10 puan geride: eşiğin altında kaldığı için listede yok.
    expect(behind.map((row) => row.userId)).toEqual(['u2', 'u3']);
    expect(behind.map((row) => row.gap)).toEqual([46, 35]);
  });

  it('kimse eşiği aşmıyorsa uyarı üretmez', () => {
    expect(subjectsBehindPace(subjects, 50, 15)).toEqual([]);
  });

  it('mesaj tempoyu ve farkı açıkça yazar', () => {
    const [row] = subjectsBehindPace(subjects, 70, 15);
    expect(targetRiskMessage(row, 70)).toBe("Ayın %70'i geçti, hedef ortalaman %44. 26 puan geridesin.");
  });
});
