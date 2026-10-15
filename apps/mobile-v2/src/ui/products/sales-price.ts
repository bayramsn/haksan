/**
 * Satış Fiyat Listesi — web `salesPriceFilters.ts`, `priceListValues.ts`,
 * `quoteCatalogScope.ts` ve `SalesPriceListPage` kurallarının birebir taşıması.
 * Paylaşılan taksonomi fonksiyonları (`isMainMachineCategory`, `machineFamilyForType`)
 * parametreyle verilir; dosyada çalışma zamanı importu yok.
 */

export type SalesPriceProduct = {
  id: string;
  divisionId: string | null;
  modelCode: string;
  modelName: string | null;
  fullName: string;
  series: string | null;
  stockCode: string | null;
  listPrice: string | null;
  cashPrice: string | null;
  compatibleMachineTypeCode: string | null;
  brand: { id: string; name: string } | null;
  currency: { code: string } | null;
  productGroup: { code: string; name: string } | null;
  category: { code: string; name: string } | null;
  subcategory: { code: string; name: string } | null;
  productType: { code: string; name: string } | null;
};

export type SalesPriceFilterField = 'group' | 'category' | 'subcategory' | 'type' | 'brand';
export type SalesPriceFilters = Record<SalesPriceFilterField, string>;

export const SALES_PRICE_FILTER_LABELS: Record<SalesPriceFilterField, string> = {
  group: 'Grup',
  category: 'Kategori',
  subcategory: 'Alt kategori',
  type: 'Ürün tipi',
  brand: 'Marka',
};

export const emptySalesPriceFilters = (): SalesPriceFilters => ({ group: '', category: '', subcategory: '', type: '', brand: '' });

export function changeSalesPriceFilter(current: SalesPriceFilters, field: SalesPriceFilterField, value: string): SalesPriceFilters {
  const next = { ...current, [field]: value };
  if (field === 'group') next.category = next.subcategory = next.type = '';
  if (field === 'category') next.subcategory = next.type = '';
  if (field === 'subcategory') next.type = '';
  return next;
}

export function salesPriceFilterLabel(product: SalesPriceProduct, field: SalesPriceFilterField): string {
  switch (field) {
    case 'group':
      return product.productGroup?.name || product.productGroup?.code || '';
    case 'category':
      return product.category?.name || product.category?.code || '';
    case 'subcategory':
      return product.subcategory?.name || product.subcategory?.code || '';
    case 'type':
      return product.productType?.name || product.productType?.code || '';
    case 'brand':
      return product.brand?.name || '';
  }
}

export function salesPriceFilterValue(product: SalesPriceProduct, field: SalesPriceFilterField): string {
  const group = product.productGroup?.code || product.productGroup?.name || product.divisionId || '';
  const category = product.category?.code || product.category?.name || '';
  const subcategory = product.subcategory?.code || product.subcategory?.name || '';
  const type = product.productType?.code || product.productType?.name || '';
  switch (field) {
    case 'group':
      return salesPriceFilterLabel(product, field) ? group : '';
    case 'category':
      return category ? JSON.stringify([group, category]) : '';
    case 'subcategory':
      return subcategory ? JSON.stringify([group, category, subcategory]) : '';
    case 'type':
      return type ? JSON.stringify([group, category, subcategory, type]) : '';
    case 'brand':
      return product.brand?.name ? product.brand.id || product.brand.name : '';
  }
}

export function salesPriceFilterOptions(products: readonly SalesPriceProduct[], field: SalesPriceFilterField) {
  const options = new Map<string, string>();
  for (const product of products) {
    const value = salesPriceFilterValue(product, field);
    if (value) options.set(value, salesPriceFilterLabel(product, field));
  }
  return [...options]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }));
}

const searchText = (value: string) =>
  value.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');

export function filterSalesPrices<T extends SalesPriceProduct>(
  products: readonly T[],
  filters: Partial<SalesPriceFilters>,
  query = '',
): T[] {
  const terms = searchText(query.trim()).split(/\s+/).filter(Boolean);
  return products.filter(
    (product) =>
      Object.entries(filters).every(
        ([field, value]) => !value || salesPriceFilterValue(product, field as SalesPriceFilterField) === value,
      ) &&
      terms.every((term) =>
        searchText(
          [
            product.brand?.name,
            product.series,
            product.modelCode,
            product.modelName,
            product.productType?.name,
            product.fullName,
            product.stockCode,
            product.productGroup?.name,
            product.category?.name,
            product.subcategory?.name,
          ]
            .filter(Boolean)
            .join(' '),
        ).includes(term),
      ),
  );
}

/** Fiyat listesinin bölümüyle (veya aktif bölümle) eşleşen ürünler. */
export function productMatchesDivision(
  product: Pick<SalesPriceProduct, 'productGroup' | 'divisionId' | 'compatibleMachineTypeCode'>,
  group: string,
  divisionId: string | undefined,
  machineFamilyForType: (group: string, typeCode: string) => unknown,
): boolean {
  if (!group) return true;
  const ownGroup = product.productGroup?.code?.toUpperCase() ?? '';
  if (['CNC', 'UNIVERSAL', 'SAC_ISLEME'].includes(ownGroup)) return ownGroup === group;
  return Boolean(
    (divisionId && product.divisionId === divisionId) ||
      (product.compatibleMachineTypeCode && machineFamilyForType(group, product.compatibleMachineTypeCode)),
  );
}

const sortKey = (product: SalesPriceProduct) =>
  `${product.brand?.name ?? ''} ${product.modelName?.trim() || product.modelCode}`.trim();

export const sortProductsByName = <T extends SalesPriceProduct>(items: readonly T[]) =>
  [...items].sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'tr', { numeric: true, sensitivity: 'base' }));

export const sortPriceListsByName = <T extends { name: string; code: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'tr', { sensitivity: 'base' }));

/** Satış fiyat listesinde yalnız ana makineler; liste bölümüne göre süzülür. */
export function salesMachines<T extends SalesPriceProduct>(
  products: readonly T[],
  scope: { divisionId: string | undefined; divisionCode: string },
  deps: {
    isMainMachineCategory: (code?: string | null) => boolean;
    machineFamilyForType: (group: string, typeCode: string) => unknown;
  },
): T[] {
  return sortProductsByName(
    products.filter(
      (product) =>
        deps.isMainMachineCategory(product.category?.code ?? '') &&
        (!scope.divisionId ||
          productMatchesDivision(product, scope.divisionCode, scope.divisionId, deps.machineFamilyForType)),
    ),
  );
}

/* --------------------------------------------------------- fiyatlar ---- */

export type PriceOverride = {
  itemId?: string;
  listPrice?: number;
  cashPrice?: number;
  campaignPrice?: number;
  campaignValidFrom?: string;
  campaignValidUntil?: string;
  campaignIsActive?: boolean;
};

export const dateInput = (value?: string | null) => (value ? String(value).slice(0, 10) : '');

type PriceItemRow = {
  item: {
    id: string;
    productModelId?: string | null;
    listPrice: string | null;
    cashPrice: string | null;
    campaignPrice: string | null;
    campaignValidFrom?: string | null;
    campaignValidUntil?: string | null;
    campaignIsActive: boolean;
  };
  product: { id: string } | null;
};

export function priceOverrideMap(rows: readonly PriceItemRow[]): Record<string, PriceOverride> {
  const map: Record<string, PriceOverride> = {};
  for (const row of rows) {
    const productId = row.product?.id ?? row.item.productModelId;
    if (!productId) continue;
    map[productId] = {
      itemId: row.item.id,
      listPrice: row.item.listPrice != null ? Number(row.item.listPrice) : undefined,
      cashPrice: row.item.cashPrice != null ? Number(row.item.cashPrice) : undefined,
      campaignPrice: row.item.campaignPrice != null ? Number(row.item.campaignPrice) : undefined,
      campaignValidFrom: dateInput(row.item.campaignValidFrom),
      campaignValidUntil: dateInput(row.item.campaignValidUntil),
      campaignIsActive: Boolean(row.item.campaignIsActive),
    };
  }
  return map;
}

const numberOrUndefined = (value: string | null) => {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Liste kalemi yoksa ürün fiyatı yalnız para birimi listeyle aynıysa gösterilir. */
export function displayPrices(product: SalesPriceProduct, override: PriceOverride | undefined, listCurrency: string | undefined) {
  const productCurrency = product.currency?.code;
  const currencyMatches = !listCurrency || listCurrency === productCurrency;
  return {
    cash: override?.cashPrice ?? (currencyMatches ? numberOrUndefined(product.cashPrice) : undefined),
    list: override?.listPrice ?? (currencyMatches ? numberOrUndefined(product.listPrice) : undefined),
    currency: listCurrency ?? productCurrency ?? 'USD',
  };
}

export function salesPriceCounts(machines: readonly SalesPriceProduct[], overrides: Record<string, PriceOverride>) {
  return {
    machines: machines.length,
    priced: machines.filter((product) => (overrides[product.id]?.listPrice ?? numberOrUndefined(product.listPrice) ?? 0) > 0).length,
    campaign: machines.filter(
      (product) => overrides[product.id]?.campaignIsActive && overrides[product.id]?.campaignPrice != null,
    ).length,
  };
}

/** Web `formatPrice`: boşsa "—", TRY "TL" olarak yazılır. */
export function formatPrice(value: number | null | undefined, currency = 'USD'): string {
  if (value === undefined || value === null || Number.isNaN(value) || value === 0) return '—';
  return `${value.toLocaleString('tr-TR')} ${currency === 'TRY' ? 'TL' : currency}`;
}

export type CampaignDraft = { price: string; from: string; until: string; active: boolean };

export type CampaignResult =
  | { ok: true; value: { campaignPrice?: number; campaignValidFrom?: string; campaignValidUntil?: string; campaignIsActive: boolean } }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Web `CampaignPriceCell.commit` doğrulaması. */
export function validateCampaign(draft: CampaignDraft): CampaignResult {
  const price = draft.price.trim();
  const parsed = Number(price.replace(/\./g, '').replace(',', '.'));
  if (price && Number.isNaN(parsed)) return { ok: false, error: 'Kampanya fiyatı geçersiz' };
  if (draft.active && (!price || parsed <= 0)) return { ok: false, error: 'Aktif kampanya için fiyat girin' };
  if ((draft.from && !DATE_RE.test(draft.from)) || (draft.until && !DATE_RE.test(draft.until))) {
    return { ok: false, error: 'Tarihleri YYYY-AA-GG biçiminde girin' };
  }
  if (draft.from && draft.until && draft.until < draft.from) {
    return { ok: false, error: 'Kampanya bitiş tarihi başlangıçtan önce olamaz' };
  }
  return {
    ok: true,
    value: {
      campaignPrice: price ? parsed : undefined,
      campaignValidFrom: draft.from || undefined,
      campaignValidUntil: draft.until || undefined,
      campaignIsActive: draft.active,
    },
  };
}

/** Web izinleri: kampanya yalnız super_admin + fiyat listesi yetkisi; ürün düzenleme admin/super_admin/products.update. */
export function salesPricePermissions(user: { roles: readonly string[]; permissions: readonly string[] } | null) {
  const roles = user?.roles ?? [];
  const permissions = user?.permissions ?? [];
  const isSuper = roles.includes('super_admin');
  const has = (code: string) => isSuper || permissions.includes(code);
  return {
    canManageCampaign: isSuper && (has('price_lists.update') || has('price_lists.create')),
    canEditProduct: isSuper || roles.includes('admin') || has('products.update'),
  };
}
