/**
 * Ürün oluşturma/düzenleme kuralları — web `ProductDialog` + store
 * `productDetailsPayload` ile aynı. Çalışma zamanı importu yok.
 */

export const PRODUCT_VAT_RATES = ['0', '1', '10', '20'] as const;

export type SpecDraft = { key: string; value: string; unit: string; groupCode: string | null };
export type EquipmentDraft = { title: string; description: string | null; isPromotion: boolean };

export type ProductFormState = {
  productGroupCode: string;
  categoryCode: string;
  subcategoryCode: string;
  productTypeCode: string;
  brandId: string;
  series: string;
  fullName: string;
  modelCode: string;
  modelName: string;
  supplierCompanyId: string | null;
  currencyCode: string;
  listPrice: string;
  cashPrice: string;
  vatRate: string;
  originCountry: string;
  hsCode: string;
  stockCode: string;
  description: string;
  muadilProductIds: string[];
};

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  productGroupCode: '',
  categoryCode: '',
  subcategoryCode: '',
  productTypeCode: '',
  brandId: '',
  series: '',
  fullName: '',
  modelCode: '',
  modelName: '',
  supplierCompanyId: null,
  currencyCode: 'USD',
  listPrice: '',
  cashPrice: '',
  vatRate: '20',
  originCountry: '',
  hsCode: '',
  stockCode: '',
  description: '',
  muadilProductIds: [],
};

/** "1.234,50" / "1234.5" / "1 234" → sayı; boş veya geçersizse `undefined`. */
export function parseMoney(text: string): number | undefined {
  const raw = text.replace(/\s/g, '');
  if (!raw) return undefined;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Web `compactProductCode`: model boşsa ürün adından kısa kod. */
export function compactProductCode(name: string): string {
  return name
    .toLocaleUpperCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export const isLaborCategory = (categoryCode: string) => categoryCode.toUpperCase() === 'ISCILIK';
export const isMachineCategory = (categoryCode: string) => categoryCode.toUpperCase() === 'TEZGAH';
export const isOptionalEquipmentCategory = (categoryCode: string) => categoryCode.toUpperCase() === 'OPSIYONEL_DONANIM';

export function validateProductForm(form: ProductFormState): { ok: true } | { ok: false; title: string } {
  if (!form.productTypeCode) return { ok: false, title: 'Ürün tipi seçin' };
  if (!form.productGroupCode) return { ok: false, title: 'Ürün grubu seçin' };
  const labor = isLaborCategory(form.categoryCode);
  if ((!labor && !form.brandId) || !form.fullName.trim()) {
    return { ok: false, title: labor ? 'Ürün adı zorunludur' : 'Marka ve ürün adı zorunludur' };
  }
  for (const [label, value] of [
    ['Liste Fiyatı', form.listPrice],
    ['Peşin Fiyatı', form.cashPrice],
  ] as const) {
    if (value.trim() && parseMoney(value) === undefined) return { ok: false, title: `${label} geçersiz` };
  }
  return { ok: true };
}

/** API `productCreateSchema` gövdesi (düzenlemede de aynı alanlar PATCH edilir). */
export function buildProductBody(form: ProductFormState) {
  const modelCode =
    form.modelCode.trim() || form.modelName.trim() || form.stockCode.trim() || compactProductCode(form.fullName) || 'URUN';
  const muadil = isOptionalEquipmentCategory(form.categoryCode) ? [] : form.muadilProductIds.filter(Boolean);
  return {
    brandId: form.brandId,
    series: isMachineCategory(form.categoryCode) ? form.series.trim() : '',
    productGroupCode: form.productGroupCode,
    categoryCode: form.categoryCode || undefined,
    subcategoryCode: form.subcategoryCode || undefined,
    productTypeCode: form.productTypeCode,
    supplierCompanyId: form.supplierCompanyId,
    modelCode,
    modelName: form.modelName.trim(),
    fullName: form.fullName.trim(),
    currencyCode: form.currencyCode,
    listPrice: parseMoney(form.listPrice) ?? null,
    cashPrice: parseMoney(form.cashPrice) ?? null,
    vatRate: Number(form.vatRate),
    originCountry: form.originCountry.trim(),
    hsCode: form.hsCode.trim(),
    stockCode: form.stockCode.trim(),
    description: form.description.trim(),
    muadilProductIds: muadil,
    muadilProductId: muadil[0] ?? null,
  };
}

/** Her satır bir donanım kalemi; mevcut kalemin açıklama/promosyon bilgisi korunur. */
export function equipmentFromLines(text: string, previous: readonly EquipmentDraft[]): EquipmentDraft[] {
  const byTitle = new Map(previous.map((item) => [item.title, item]));
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title) => byTitle.get(title) ?? { title, description: null, isPromotion: false });
}

/** Web `productDetailsPayload`: boş anahtar atlanır, boş değer "-" yazılır. */
export function buildDetailsPayload(input: {
  specs: readonly SpecDraft[];
  standard: readonly EquipmentDraft[];
  optional: readonly EquipmentDraft[];
}) {
  const specs = input.specs
    .filter((spec) => spec.key.trim())
    .map((spec, index) => ({
      specGroupCode: spec.groupCode || 'GENEL',
      specKey: spec.key.trim(),
      specValue: spec.value.trim() || '-',
      ...(spec.unit.trim() ? { specUnit: spec.unit.trim() } : {}),
      sortOrder: index + 1,
    }));
  const equipment = (code: 'standart' | 'opsiyonel', items: readonly EquipmentDraft[]) =>
    items
      .filter((item) => item.title.trim())
      .map((item, index) => ({
        equipmentTypeCode: code,
        title: item.title.trim(),
        ...(item.description ? { description: item.description } : {}),
        isPromotion: item.isPromotion,
        sortOrder: index + 1,
      }));
  return { specs, equipment: [...equipment('standart', input.standard), ...equipment('opsiyonel', input.optional)] };
}

/** Taksonomi zinciri: üst seçimi olan alt satırlar, üst seçilmemişse hepsi. */
export function taxonomyChildren<T extends { id: string; code: string; name: string }>(
  rows: readonly T[],
  parentId: string | null | undefined,
  parentOf: (row: T) => string | null | undefined,
): T[] {
  return rows
    .filter((row) => !parentId || !parentOf(row) || parentOf(row) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}
