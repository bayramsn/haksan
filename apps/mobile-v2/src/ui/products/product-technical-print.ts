import { HEX2026_REVISION, hex2026TechnicalFields } from '@haksan/shared';
import type { BaseModelConfiguration, LaserBaseConfiguration, LaserTechnicalConfiguration } from '@haksan/shared';
import type { ProductModel } from '../../api/endpoints';
import type { PrintSection } from '../../native/print-document';

export type TechnicalProduct = ProductModel & {
  technicalConfiguration?: LaserTechnicalConfiguration | null;
  laserBaseConfiguration?: LaserBaseConfiguration | null;
  baseModelConfiguration?: BaseModelConfiguration | null;
};
type OptionSet = { name: string; values: Array<{ value?: string; name?: string; powerKw?: number | string | null }> };
const hasValue = (value: unknown) => Boolean(String(value ?? '').trim()) && !/^[-–—]+$/.test(String(value).trim());
const specValue = (spec: { value: string; unit?: string | null }) => [spec.value.trim(), spec.unit?.trim()].filter(Boolean).join(' ');

/** Web ürün teknik belgesi: ticari fiyatlar ve maliyetler bu veri seçimine alınmaz. */
export function productTechnicalPrintInput(product: TechnicalProduct, options: {
  image?: string;
  optionSets?: OptionSet[];
  compatibleOptional?: Array<{ product: { fullName: string } }>;
} = {}): { title: string; subtitle: string; sections: PrintSection[]; image?: string } {
  const sections: PrintSection[] = [{ title: 'Ürün Bilgileri', rows: [
    { label: 'Ürün', value: product.fullName }, { label: 'Marka', value: product.brand?.name },
    { label: 'Seri', value: product.series }, { label: 'Model', value: product.modelName || product.modelCode },
    { label: 'Model Kodu', value: product.modelCode }, { label: 'Stok Kodu', value: product.stockCode },
    { label: 'Ürün Grubu', value: product.productGroup?.name }, { label: 'Kategori', value: product.category?.name },
    { label: 'Alt Kategori', value: product.subcategory?.name }, { label: 'Ürün Tipi', value: product.productType?.name },
    { label: 'Menşe', value: product.originCountry }, { label: 'GTİP', value: product.hsCode },
    { label: 'KDV Oranı', value: product.vatRate == null ? null : `%${product.vatRate}` },
  ] }];
  if (product.description?.trim()) sections.push({ title: 'Açıklama', lines: [product.description] });
  const technical = product.technicalConfiguration;
  if (technical) {
    sections.push({ title: 'Kaydedilmiş Lazer Konfigürasyonu', rows: [
      { label: 'Kaynak Model', value: technical.selection.sourceModelCode },
      { label: 'Seri', value: technical.selection.series },
      { label: 'Lazer Gücü', value: `${technical.selection.powerKw} kW` },
      { label: 'Kabin Tipi', value: technical.selection.cabinType === 'open' ? 'Açık' : 'Kapalı' },
      { label: 'Ölçü / Kapasite', value: technical.sizeLabel },
    ] });
  }
  const specs = technical ? technical.specs : product.specs ?? [];
  const grouped = new Map<string, Array<{ label: string; value: string }>>();
  for (const spec of specs) {
    if (!spec.key.trim() || !hasValue(spec.value) || spec.key.trim().toLocaleLowerCase('tr-TR') === 'standart donanım') continue;
    const group = ('groupName' in spec ? spec.groupName : undefined) || ('group' in spec ? spec.group : undefined) || 'Teknik Özellikler';
    const rows = grouped.get(group) ?? [];
    rows.push({ label: spec.key, value: specValue(spec) }); grouped.set(group, rows);
  }
  for (const [title, rows] of grouped) sections.push({ title, rows });
  // Webde olduğu gibi yalnız sabit profil taşımayan baz kartlarda kaynak model verileri kullanılır.
  if (!technical && !product.specs?.length) {
    const base = product.laserBaseConfiguration;
    if (base) {
      sections.push({ title: 'Baz Kart Modelleri', lines: [...base.sourceModelCodes] });
      if (base.sourceRevision === HEX2026_REVISION) for (const code of base.sourceModelCodes) {
        const fields = hex2026TechnicalFields(base.series, code)
          .filter((field) => ['verified', 'aore_excel'].includes(field.verification) && hasValue(field.rawValue));
        if (fields.length) sections.push({ title: `${code} — Teknik Bilgiler`, rows: fields.map((field) => ({ label: field.key, value: field.rawValue })) });
      }
    }
  }
  if (product.baseModelConfiguration) for (const model of product.baseModelConfiguration.configurations) {
    sections.push({ title: `${model.sourceModelCode} — Teknik Bilgiler`, rows: model.specs.filter((spec) => hasValue(spec.value)).map((spec) => ({ label: spec.key, value: specValue(spec) })) });
  }
  for (const set of options.optionSets ?? []) {
    const lines = set.values.map((value) => value.value || value.name || (value.powerKw == null ? '' : `${value.powerKw} kW`)).filter(Boolean);
    if (lines.length) sections.push({ title: `Seçenekler — ${set.name}`, lines });
  }
  if (product.standardEquipment?.length) sections.push({ title: 'Standart Donanım', lines: [...product.standardEquipment] });
  const optional = [...new Set([...(product.optionalEquipment ?? []), ...(options.compatibleOptional ?? []).map((row) => row.product.fullName)].filter(Boolean))];
  if (optional.length) sections.push({ title: 'Opsiyonel Donanım', lines: optional });
  return { title: `${product.fullName} — Teknik Bilgiler`, subtitle: [product.brand?.name, product.series, product.modelName || product.modelCode].filter(Boolean).join(' · '), sections, ...(options.image ? { image: options.image } : {}) };
}
