import { describe, expect, it } from 'vitest';
import { applyVatRateToNotes, matchQuoteNoteVariantKey, QUOTE_NOTE_VARIANTS, resolveProformaNotes } from './notes';

describe('document VAT terms', () => {
  it('uses the selected lathe VAT rate in quote and proforma terms', () => {
    const quoteTerms = applyVatRateToNotes([
      "Teklifimize tezgâhın cari orandaki %20 K.D.V.'si dahil edilmemiştir, Leasing K.D.V oranı %1'dir.",
    ], 10);
    const proformaTerms = resolveProformaNotes('isletme-teslim', { alici: 'Alıcı', yil: 2026, kdvOrani: 10 });

    expect(quoteTerms[0]).toContain('%10 K.D.V.');
    expect(quoteTerms[0]).toContain("%1'dir");
    expect(proformaTerms?.join(' ')).toContain('%10 K.D.V.');
    expect(proformaTerms?.join(' ')).not.toContain('{{KDV_ORANI}}');
  });

  it('still recognizes a saved variant after its VAT rate changes', () => {
    const variant = QUOTE_NOTE_VARIANTS.find((item) => item.key === 'millilestirilmis')!;
    const payment = applyVatRateToNotes(variant.odeme, 10).join('\n');

    expect(matchQuoteNoteVariantKey(payment, variant.teslimat.join('\n'), variant.garanti.join('\n')))
      .toBe('millilestirilmis');
  });
});
