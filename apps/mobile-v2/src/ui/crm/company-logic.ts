/** Web Customers.tsx ile aynı liste kuralları; saf mantık (RN bağımlılığı yok). */

export type CompanySortMode = 'default' | 'name_asc' | 'name_desc' | 'created_desc' | 'created_asc';
export type FirmType = 'customer' | 'supplier_customer' | 'supplier' | 'competitor';
export type SalesStatusTab = 'all' | 'potential' | 'active_customer';

export const COMPANY_SORT_OPTIONS: { value: CompanySortMode; label: string }[] = [
  { value: 'default', label: 'Varsayılan sıralama' },
  { value: 'name_asc', label: 'Firma adı A–Z' },
  { value: 'name_desc', label: 'Firma adı Z–A' },
  { value: 'created_desc', label: 'Oluşturma: yeni → eski' },
  { value: 'created_asc', label: 'Oluşturma: eski → yeni' },
];

export const FIRM_TYPE_LABELS: Record<FirmType, string> = {
  customer: 'Müşteri',
  supplier_customer: 'Tedarikçi + Müşteri',
  supplier: 'Tedarikçi',
  competitor: 'Rakip',
};

export const SUPPLIER_CATEGORY_OPTIONS = [
  { value: 'manufacturer', label: 'Makine üreticisi', helper: 'Makine ve ekipman üretimi' },
  { value: 'transportation', label: 'Nakliye', helper: 'Karayolu, deniz veya hava taşımacılığı' },
  { value: 'logistics', label: 'Lojistik', helper: 'Kargo, depolama ve dağıtım hizmeti' },
] as const;

export const ADDRESS_TYPE_OPTIONS = [
  { value: 'office', label: 'Ofis' },
  { value: 'factory', label: 'Fabrika' },
  { value: 'work_area', label: 'Çalışma Alanı' },
  { value: 'shipping', label: 'Sevkiyat' },
  { value: 'billing', label: 'Fatura' },
  { value: 'other', label: 'Diğer' },
] as const;

/** Liste rozeti: web yalnız Nakliye/Lojistik etiketini gösterir. */
export function supplierCategoryLabel(code: string | null | undefined): string {
  return code === 'transportation' ? 'Nakliye' : code === 'logistics' ? 'Lojistik' : '';
}

export function sortModeToQuery(mode: CompanySortMode): { sortBy: 'name' | 'createdAt'; sortDir: 'asc' | 'desc' } {
  switch (mode) {
    case 'name_asc':
      return { sortBy: 'name', sortDir: 'asc' };
    case 'name_desc':
      return { sortBy: 'name', sortDir: 'desc' };
    case 'created_asc':
      return { sortBy: 'createdAt', sortDir: 'asc' };
    default:
      return { sortBy: 'createdAt', sortDir: 'desc' };
  }
}

export function salesStatusToCode(tab: SalesStatusTab): 'active' | 'potential' | undefined {
  return tab === 'active_customer' ? 'active' : tab === 'potential' ? 'potential' : undefined;
}

/** Yalnız satış/servis rolündeki kullanıcıların görünürlüğü (web ile birebir). */
export function companyVisibility(roles: readonly string[]) {
  const restricted = roles.length > 0 && roles.every((role) => role === 'sales' || role === 'service');
  const hasSales = roles.includes('sales');
  return {
    restricted,
    canSeeSuppliers: !restricted,
    canSeeCompetitors: !restricted || hasSales,
    canSeePotential: !restricted || hasSales,
  };
}

export type CompanyListFilters = {
  search?: string;
  tab: 'all' | FirmType;
  salesTab: SalesStatusTab;
  divisionId: string;
  city?: string;
  sector?: string;
  supplierCategory: 'all' | 'transportation' | 'logistics';
  sortMode: CompanySortMode;
};

/** Liste ve Excel aynı parametreleri kullanır (web exportParams). */
export function buildCompanyQuery(filters: CompanyListFilters) {
  const search = filters.search?.trim();
  return {
    ...(search ? { search } : {}),
    ...(filters.tab !== 'all' ? { relationTypeCode: filters.tab } : {}),
    ...(salesStatusToCode(filters.salesTab) ? { customerStatusCode: salesStatusToCode(filters.salesTab) } : {}),
    ...(filters.divisionId !== 'all' ? { divisionId: filters.divisionId } : {}),
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.sector ? { sector: filters.sector } : {}),
    ...(filters.supplierCategory !== 'all' ? { supplierCategoryCode: filters.supplierCategory } : {}),
    ...sortModeToQuery(filters.sortMode),
  };
}

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

/** Firma/kontak içe aktarma: yalnız .xlsx kabul edilir (sunucu şeması ile aynı). */
export function validateImportFile(file: { name: string; size?: number | null }): string | null {
  if (!/\.xlsx$/i.test(file.name)) return 'Yalnızca .xlsx dosyası seçebilirsiniz.';
  if (file.size != null && file.size > IMPORT_MAX_BYTES) return 'Dosya 10 MB sınırını aşıyor.';
  if (file.size === 0) return 'Dosya boş.';
  return null;
}
