import { isMainMachineCategory, machineCategoryLabel, machineGroupCode } from "@haksan/shared";

export type ProductCategoryOption = { code: string; label: string; identityLabel?: string; productGroupCode?: string };
export type ScopedProductCategoryOption = ProductCategoryOption & { productGroupCode?: string };
type ProductOption = ProductCategoryOption;

const foldProductTypeCode = (code?: string | null) => (code ?? "")
  .toLocaleUpperCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const sameProductCode = (a?: string | null, b?: string | null) => foldProductTypeCode(a) === foldProductTypeCode(b);

export const PRODUCT_CATEGORIES: ProductOption[] = [
  { code: "TEZGAH", label: "Tezgah" },
  { code: "YEDEK_PARCA", label: "Yedek Parça" },
  { code: "OPSIYONEL_DONANIM", label: "Opsiyonel Donanım" },
  { code: "ISCILIK", label: "İşçilik" },
  { code: "AKSESUAR", label: "Aksesuar" },
];

export const displayProductCategoryOptions = <T extends ProductCategoryOption>(options: T[], groupCode?: string): T[] =>
  options.map((option) => ({ ...option, identityLabel: option.identityLabel ?? option.label,
    label: isMainMachineCategory(option.code) && machineGroupCode(option.productGroupCode ?? groupCode)
      ? machineCategoryLabel(option.productGroupCode ?? groupCode)
      : option.label,
  }));

const productCategoryLabelKey = (label: string) => {
  const key = foldProductTypeCode(label.trim().replace(/\s+/g, " "));
  return ["CNC TEZGAHLARI", "UNIVERSAL TEZGAHLAR", "SAC ISLEME TEZGAHLARI"].includes(key) ? "TEZGAH" : key;
};

export const productCategoriesForGroup = (options: ScopedProductCategoryOption[], groupCode: string) =>
  options.filter((option) => !option.productGroupCode || Boolean(groupCode && sameProductCode(option.productGroupCode, groupCode)));

export const productCategoryCodeForGroup = (options: ScopedProductCategoryOption[], groupCode: string, currentCode: string) => {
  const allowed = productCategoriesForGroup(options, groupCode);
  return allowed.find((option) => sameProductCode(option.code, currentCode))?.code
    ?? allowed.find((option) => sameProductCategory(options, option.code, currentCode))?.code
    ?? "";
};

// Aynı görünen kategorilerin eski kodları alt kategori/tip bağlarında kalabilir.
// Seçenekleri tekilleştirirken bu gerçek bağlantıları da aynı kategori say.
export const sameProductCategory = (options: ProductOption[], a?: string | null, b?: string | null) => {
  if (sameProductCode(a, b)) return true;
  // Kapsam dışındaki ithal makine kategorileri aynı "Tezgah" adını taşısa da
  // CNC/Üniversal/Sac ana kategorileriyle eşdeğer değildir.
  if ([a, b].some((code) => /^HM_(KAYNAK|HAVA|TASIMA)_/.test(foldProductTypeCode(code)))) return false;
  const labelFor = (code?: string | null) =>
    options.find((option) => sameProductCode(option.code, code))?.identityLabel ?? options.find((option) => sameProductCode(option.code, code))?.label ??
    PRODUCT_CATEGORIES.find((option) => sameProductCode(option.code, code))?.label;
  const aLabel = labelFor(a);
  const bLabel = labelFor(b);
  return Boolean(aLabel && bLabel && productCategoryLabelKey(aLabel) === productCategoryLabelKey(bLabel));
};

export const uniqueProductCategoryOptions = (options: ProductOption[], selectedCode?: string | string[]): ProductOption[] => {
  const selectedCodes = Array.isArray(selectedCode) ? selectedCode : selectedCode ? [selectedCode] : [];
  const byCode = new Map<string, ProductOption>();
  for (const option of options) {
    const code = `${foldProductTypeCode(option.productGroupCode)}:${foldProductTypeCode(option.code)}`;
    if (!byCode.has(code)) byCode.set(code, option);
  }
  const priority = (option: ProductOption) => {
    // Düzenlenen eski kodu koru; yeni ürünlerde bilinen kategori kodunu tercih et.
    if (selectedCodes.some((code) => sameProductCode(option.code, code))) return 2;
    const canonical = PRODUCT_CATEGORIES.find((category) => productCategoryLabelKey(category.label) === productCategoryLabelKey(option.label));
    return canonical && sameProductCode(option.code, canonical.code) ? 1 : 0;
  };
  const byLabel = new Map<string, ProductOption>();
  for (const option of byCode.values()) {
    const excluded = /^HM_(KAYNAK|HAVA|TASIMA)_/.test(foldProductTypeCode(option.code));
    const key = `${foldProductTypeCode(option.productGroupCode)}:${excluded ? foldProductTypeCode(option.code) : productCategoryLabelKey(option.identityLabel ?? option.label)}`;
    const current = byLabel.get(key);
    if (!current || priority(option) > priority(current)) byLabel.set(key, option);
  }
  return Array.from(byLabel.values());
};

// Çoklu seçimde görünür tek kategori, kayıtlı eski kodların tamamını temsil eder.
// Seçim değişince halen seçili kategorilerin gerçek kodlarını koru.
export const preserveProductCategorySelection = (options: ProductOption[], previous: string[], next: string[]) =>
  next.flatMap((code) => {
    const existing = previous.filter((selected) => sameProductCategory(options, selected, code));
    return existing.length ? existing : [code];
  });
