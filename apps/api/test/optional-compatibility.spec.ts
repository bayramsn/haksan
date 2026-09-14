import { describe, expect, it } from 'vitest';
import { matchesOptionalCompatibility } from '../src/modules/products/optional-compatibility';

// Canlıdaki gerçek kayıt: HAXAN "Fener Mili 15.000 dv/dk", beş boyutu beş ayrı
// satırda tutuyor.
const FENER_MILI = [
  { productGroupId: 'g-cnc', categoryId: null, subcategoryId: null, productTypeId: null, brandId: null },
  { productGroupId: null, categoryId: 'c-tezgah', subcategoryId: null, productTypeId: null, brandId: null },
  { productGroupId: null, categoryId: null, subcategoryId: 's-isleme', productTypeId: null, brandId: null },
  { productGroupId: null, categoryId: null, subcategoryId: null, productTypeId: 't-dik', brandId: null },
  { productGroupId: null, categoryId: null, subcategoryId: null, productTypeId: null, brandId: 'b-lk' },
];

const LK_DIK = {
  productGroupId: 'g-cnc', categoryId: 'c-tezgah', subcategoryId: 's-isleme',
  productTypeId: 't-dik', brandId: 'b-lk',
};
const ECOCA_TORNA = {
  productGroupId: 'g-cnc', categoryId: 'c-tezgah', subcategoryId: 's-torna',
  productTypeId: 't-torna', brandId: 'b-ecoca',
};

describe('opsiyonel donanım uyumluluğu', () => {
  it('tüm kısıtları sağlayan tezgahta çıkar', () => {
    expect(matchesOptionalCompatibility(FENER_MILI, LK_DIK)).toBe(true);
  });

  it('ECOCA tornada ÇIKMAZ — grup ve kategori eşleşse bile', () => {
    // Eski VEYA mantığı burada true dönüyordu: "grup CNC" ve "kategori Tezgah"
    // eşleşiyor, ama alt kategori/tip/marka tutmuyor.
    expect(matchesOptionalCompatibility(FENER_MILI, ECOCA_TORNA)).toBe(false);
  });

  it('aynı boyuttaki birden fazla değer VEYA olarak çalışır', () => {
    const ikiMarka = [
      { productGroupId: null, categoryId: null, subcategoryId: null, productTypeId: null, brandId: 'b-lk' },
      { productGroupId: null, categoryId: null, subcategoryId: null, productTypeId: null, brandId: 'b-ecoca' },
    ];
    expect(matchesOptionalCompatibility(ikiMarka, ECOCA_TORNA)).toBe(true);
    expect(matchesOptionalCompatibility(ikiMarka, { ...ECOCA_TORNA, brandId: 'b-haxan' })).toBe(false);
  });

  it('kısıtlanmamış boyut serbesttir', () => {
    const yalnizMarka = [
      { productGroupId: null, categoryId: null, subcategoryId: null, productTypeId: null, brandId: 'b-ecoca' },
    ];
    expect(matchesOptionalCompatibility(yalnizMarka, ECOCA_TORNA)).toBe(true);
  });

  it('tezgahın kısıtlanan boyutu boşsa eşleşmez', () => {
    // Alt kategorisi girilmemiş tezgah, alt kategori kısıtı olan donanımı almaz.
    expect(matchesOptionalCompatibility(FENER_MILI, { ...LK_DIK, subcategoryId: null })).toBe(false);
  });

  it('hiç kısıt yoksa hiçbir tezgaha bağlanmaz', () => {
    expect(matchesOptionalCompatibility([], LK_DIK)).toBe(false);
  });
});
