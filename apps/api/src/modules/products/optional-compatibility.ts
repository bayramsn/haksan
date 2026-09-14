/**
 * Opsiyonel donanım ↔ tezgah uyumluluk kuralı.
 *
 * Uyumluluk kaydı tabloda BOYUT BAŞINA BİR SATIR tutuluyor: "grup CNC",
 * "kategori Tezgah", "alt kategori İşleme Merkezi", "tip CNC Dik İşleme",
 * "marka LK Machinery" beş ayrı satırdır. Bu satırlar tek bir kısıt kümesidir,
 * alternatif değil.
 *
 * Kural: **boyutlar arası VE, boyut içi VEYA.** Kayıtta geçen her boyut için
 * tezgahın o boyuttaki değeri, kayıttaki değerlerden biri olmalı; hiç
 * belirtilmeyen boyut serbesttir.
 *
 * Önceki sürüm satırları VEYA'lıyordu: LK Machinery marka bir dik işleme
 * merkezi için tanımlanmış fener mili, yalnız "grup CNC" ve "kategori Tezgah"
 * eşleştiği için ECOCA torna tezgahında da uyumlu görünüyordu.
 */
export type OptionalCompatibilityRow = {
  productGroupId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  productTypeId: string | null;
  brandId: string | null;
};

export type MachineTaxonomy = {
  productGroupId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  productTypeId?: string | null;
  brandId?: string | null;
};

const DIMENSIONS = ['productGroupId', 'categoryId', 'subcategoryId', 'productTypeId', 'brandId'] as const;

export function matchesOptionalCompatibility(
  rows: OptionalCompatibilityRow[],
  machine: MachineTaxonomy
): boolean {
  // Hiç kısıt yoksa donanım hiçbir tezgaha bağlanmamıştır.
  if (!rows.length) return false;

  return DIMENSIONS.every((dimension) => {
    const allowed = rows.map((row) => row[dimension]).filter((value): value is string => Boolean(value));
    if (!allowed.length) return true; // bu boyut kısıtlanmamış
    const actual = machine[dimension];
    return Boolean(actual) && allowed.includes(actual as string);
  });
}
