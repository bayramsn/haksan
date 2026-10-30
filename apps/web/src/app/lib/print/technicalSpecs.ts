import type { Product, ProductSpec } from "../mock";
import { specsForProductTypeStrict } from "../productSpecTemplates";
import type { QuotePrintData } from "./templates";

/**
 * CRM teknik alanlarını silmeden yalnız müşteri çıktısında gerçek değeri olan
 * satırları seçer. Katalogdaki `-` işareti "henüz kullanılmıyor" sentinelidir.
 */
export const hasPrintableTechnicalSpecValue = (value: unknown): boolean => {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized) && !/^[-–—]+$/.test(normalized);
};

export const printableTechnicalSpecs = <T extends { key?: unknown; value?: unknown }>(
  specs: readonly T[] | null | undefined,
): T[] => (specs ?? []).filter((spec) =>
  Boolean(String(spec.key ?? "").trim()) && hasPrintableTechnicalSpecValue(spec.value),
);

/** Undefined means legacy fallback; an explicit empty source list must stay empty. */
export function snapshotStandardEquipment(specs: readonly { key?: unknown; value?: unknown }[] | null | undefined): string[] | undefined {
  const source = specs?.find(spec => String(spec.key ?? '').trim().toLocaleLowerCase('tr-TR') === 'standart donanım');
  return source ? String(source.value ?? '').split(/\r?\n/).map(value => value.trim()).filter(Boolean) : undefined;
}

// Seçilen tezgahın TAM teknik özellik listesi (tip şablonu + üründe girilen
// değerler), teklifte kalem bazında girilen (customSpecs) değerlerle üzerine
// yazılır. Böylece teklif PDF'i eksik değil tam özellik tablosu basar. Ürün kartında
// olmayan teklif alanları (teklife eklenen satırlar, lazer/baz model konfigürasyonu)
// tablonun sonuna eklenir; teklif penceresinde görünen hiçbir alan çıktıdan düşmez.
export const fullProductSpecs = (
  product: Product | undefined,
  customSpecs: Array<{ key: string; value: string; unit?: string; specUnit?: string; groupCode?: string; groupName?: string }>,
): QuotePrintData["specs"] => {
  const base = product ? specsForProductTypeStrict(product.productTypeCode, (product.specs ?? []) as ProductSpec[]) : [];
  if (!base.length) return printableTechnicalSpecs(customSpecs.length ? customSpecs : product?.specs);
  const keyOf = (key: string) => key.trim().toLocaleLowerCase("tr-TR");
  const overrides = new Map(customSpecs.map((s) => [keyOf(s.key), s]));
  const baseKeys = new Set(base.map((s) => keyOf(s.key)));
  // Standart donanım teknik tabloda değil, kendi bölümünde basılır.
  const extras = customSpecs.filter((s) => !baseKeys.has(keyOf(s.key)) && keyOf(s.key) !== "standart donanım");
  return printableTechnicalSpecs([...base.map((s) => {
    const ov = overrides.get(keyOf(s.key));
    return ov && ov.value.trim() ? { ...s, value: ov.value } : s;
  }), ...extras]);
};

const normalizedLabel = (value?: string | null): string =>
  String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");

export const quoteMachineModel = (
  product: Product | undefined,
  itemStockCode?: string | null,
): string | undefined => {
  const model = product?.model?.trim() || "";
  const stockCode = String(itemStockCode ?? product?.stockCode ?? "").trim();
  if (model && (!stockCode || normalizedLabel(model) !== normalizedLabel(stockCode))) return model;

  const brand = product?.brand?.trim() || "";
  const type = product?.type?.trim() || "";
  for (const source of [product?.modelName, product?.shortDescription]) {
    let label = source?.trim() || "";
    if (!label) continue;
    if (brand && normalizedLabel(label).startsWith(`${normalizedLabel(brand)} `)) {
      label = label.slice(brand.length).trim();
    }
    if (type && normalizedLabel(label).endsWith(normalizedLabel(type))) {
      label = label.slice(0, Math.max(0, label.length - type.length)).trim();
    }
    if (label && normalizedLabel(label) !== normalizedLabel(stockCode)) return label;
  }

  // Model alanı stok kodu olarak kullanılmış eski ürünlerde iç kodu teklife
  // taşımaktansa model satırını boş bırakmak daha güvenlidir.
  return undefined;
};
