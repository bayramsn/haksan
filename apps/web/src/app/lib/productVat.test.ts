import { describe, expect, it } from 'vitest';
import { defaultVatRateForProductType } from './productVat';

describe('product VAT defaults', () => {
  it.each(['CNC_TORNA', 'cnc_yatay_torna_tezgahi', 'CNC_DIK_TORNA_TEZGAHI', 'UNIVERSAL_TORNA', 'cnc_lathe'])('defaults %s to 10%', (code) => {
    expect(defaultVatRateForProductType(code)).toBe('10');
  });
  it('recognizes custom lathe types by their label', () => {
    expect(defaultVatRateForProductType('custom-machine', 'Üniversal Torna')).toBe('10');
  });
  it('does not apply machine defaults to accessories', () => {
    expect(defaultVatRateForProductType('custom-accessory', 'Torna Aynası', false)).toBeNull();
    expect(defaultVatRateForProductType('CNC_TORNA', '', false)).toBeNull();
  });
  it('keeps machining centres at 20% and other defaults unchanged', () => {
    expect(defaultVatRateForProductType('CNC_DİK_İŞLEME_MERKEZİ')).toBe('20');
    expect(defaultVatRateForProductType('ABKANT')).toBeNull();
  });
});
