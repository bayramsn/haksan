import { request, type Paginated } from '@/src/api/client';
import type { InventoryItem, PriceList, ProductModel, Warehouse } from '@/src/api/endpoints';

/**
 * Ürün listesi/detayının tam gövdesi (products.service.ts `list`/`get`).
 * `endpoints.ts` içindeki `ProductModel` bu alanların bir kısmını taşımıyor.
 */
export type CatalogProduct = ProductModel & {
  divisionId?: string | null;
  compatibleMachineType?: { id: string; code: string; name: string } | null;
  muadilProductIds?: string[];
  supplierCompanyId?: string | null;
};

export type Brand = {
  id: string;
  name: string;
  country: string | null;
  divisionId: string | null;
  isOwned: boolean;
  logoUrl: string | null;
  technicalCatalogCode: string | null;
  supplierCompanyId: string | null;
};

/** `/lookups/product-*` satırları; üst bağlantı kolonları kaskad seçim içindir. */
export type TaxonomyRow = {
  id: string;
  code: string;
  name: string;
  divisionId: string | null;
  productGroupId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
};

export type ProductSpecRow = {
  spec: { id: string; specKey: string; specValue: string; specUnit: string | null; sortOrder: number };
  group: { id: string; code: string; name: string } | null;
};

export type ProductSpecTemplate = {
  id: string;
  productTypeCode: string;
  specGroupCode: string | null;
  specKey: string;
  specUnit: string | null;
  defaultValue: string | null;
  sortOrder: number;
};

export type ProductEquipmentRow = {
  item: { id: string; title: string; description: string | null; isPromotion: boolean; sortOrder: number };
  type: { id: string; code: string; name: string } | null;
  currency: { id: string; code: string } | null;
};

/** products.service.ts `listOptionSets` (değer alanı `value`). */
export type OptionValue = {
  id: string;
  value: string;
  priceDelta: string | null;
  currencyCode: string | null;
  sortOrder: number;
};

export type OptionSet = {
  id: string;
  name: string;
  configurationKind: 'table' | 'power' | 'cabin' | null;
  sortOrder: number;
  values: OptionValue[];
};

export type ProductCreateBody = {
  divisionId?: string;
  brandId: string;
  series?: string;
  productGroupCode?: string;
  categoryCode?: string;
  subcategoryCode?: string;
  productTypeCode?: string;
  supplierCompanyId?: string;
  modelCode: string;
  modelName?: string;
  fullName: string;
  currencyCode: string;
  listPrice?: number;
  cashPrice?: number;
  vatRate: number;
  originCountry?: string;
  hsCode?: string;
  stockCode?: string;
  description?: string;
  muadilProductIds?: string[];
};

export type ProductSpecInput = {
  specGroupCode: string;
  specKey: string;
  specValue: string;
  specUnit?: string;
  sortOrder: number;
};

export type ProductEquipmentInput = {
  equipmentTypeCode: string;
  title: string;
  description?: string;
  isPromotion: boolean;
  sortOrder: number;
};

export type ImportTemplateOption = {
  divisionId: string;
  categoryCode: string | null;
  categoryName: string;
  subcategoryCode: string | null;
  subcategoryName: string;
  productTypeCode: string;
  productTypeName: string;
  productCount: number;
};

export type ImportStatus = 'create' | 'update' | 'error' | 'skip';

export type ImportPreviewRow = {
  rowNumber: number;
  brandName: string;
  modelCode: string;
  fullName?: string;
  listPrice?: number;
  currencyCode?: string;
  status: ImportStatus;
  errors: string[];
  warnings: string[];
} & Record<string, unknown>;

export type ImportSummary = { total: number; create: number; update: number; skip: number; error: number };

export type ImportPreview = {
  divisionId: string;
  fileName: string;
  sheetName: string;
  headerRowNumber: number;
  totalRows: number;
  rows: ImportPreviewRow[];
  summary: ImportSummary;
};

export type PriceListBody = {
  code: string;
  name: string;
  description?: string;
  divisionId?: string;
  currencyCode: string;
  validFrom?: string;
  validUntil?: string;
  isActive: boolean;
};

export type PriceListItemCreateBody = {
  productModelId: string;
  listPrice?: number;
  cashPrice?: number;
  campaignPrice?: number;
  campaignValidFrom?: string;
  campaignValidUntil?: string;
  campaignIsActive: boolean;
  notes?: string;
};

export type ScopedPriceList = PriceList & { divisionId?: string | null };

/** price-lists.service.ts `listItems` satırı (kampanya tarihleri dahil). */
export type PriceListItemFull = {
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
  product: { id: string; modelCode: string; fullName: string } | null;
};

export type CampaignBody = {
  productModelId: string;
  campaignPrice?: number;
  campaignValidFrom?: string;
  campaignValidUntil?: string;
  campaignIsActive: boolean;
};

/** Genel katalog kütüphanesi (`files/links` entityType `catalog`). */
export type CatalogFileLink = {
  id: string;
  fileId: string;
  createdAt: string;
  file: { id: string; originalFilename: string; mimeType: string; sizeBytes: number; createdAt: string } | null;
};

export const productsExtraApi = {
  listAll: (query: { page: number; pageSize: number; search?: string }) =>
    request<Paginated<CatalogProduct>>('/products', { query }),
  get: (id: string) => request<CatalogProduct>(`/products/${id}`),
  brands: (divisionId?: string) => request<Brand[]>('/brands', { query: { divisionId } }),
  createBrand: (body: { name: string; country?: string; isOwned: boolean; companyId?: string; divisionId?: string }) =>
    request<Brand>('/brands', { method: 'POST', body }),
  productGroups: () => request<TaxonomyRow[]>('/lookups/product-groups'),
  productCategories: () => request<TaxonomyRow[]>('/lookups/product-categories'),
  productSubcategories: () => request<TaxonomyRow[]>('/lookups/product-subcategories'),
  productTypes: () => request<TaxonomyRow[]>('/lookups/product-types'),
  create: (body: ProductCreateBody) => request<CatalogProduct>('/products', { method: 'POST', body }),
  remove: (id: string) => request<{ ok: true }>(`/products/${id}`, { method: 'DELETE' }),
  importTemplateOptions: (divisionId?: string) =>
    request<ImportTemplateOption[]>('/products/import/template-options', { query: { divisionId } }),
  previewImport: (body: { divisionId?: string; fileName: string; fileBase64: string }) =>
    request<ImportPreview>('/products/import/preview', { method: 'POST', body, timeoutMs: 120_000 }),
  commitImport: (body: {
    divisionId?: string;
    rows: Record<string, unknown>[];
    mode: 'upsert' | 'create_only';
    replaceDetails: boolean;
  }) =>
    request<{ summary: ImportSummary }>('/products/import/commit', { method: 'POST', body, timeoutMs: 180_000 }),
  specs: (id: string) => request<ProductSpecRow[]>(`/products/${id}/specs`),
  specTemplates: (productTypeCode?: string, divisionId?: string) =>
    request<ProductSpecTemplate[]>('/product-spec-templates', { query: { productTypeCode, divisionId } }),
  addSpec: (id: string, body: ProductSpecInput) => request<{ id: string }>(`/products/${id}/specs`, { method: 'POST', body }),
  equipment: (id: string) => request<ProductEquipmentRow[]>(`/products/${id}/equipment`),
  addEquipment: (id: string, body: ProductEquipmentInput) =>
    request<{ id: string }>(`/products/${id}/equipment`, { method: 'POST', body }),
  replaceDetails: (id: string, body: { specs: ProductSpecInput[]; equipment: ProductEquipmentInput[] }) =>
    request<{ ok: true }>(`/products/${id}/details`, { method: 'PUT', body }),
  updateStandardEquipment: (id: string, body: { standardEquipment: string[]; supplierCompanyId?: string | null }) =>
    request<{ ok: true }>(`/products/${id}/standard-equipment`, { method: 'PUT', body }),
  optionSets: (id: string) => request<OptionSet[]>(`/products/${id}/options`),
  addOptionSet: (id: string, body: { name: string; sortOrder: number }) =>
    request<OptionSet>(`/products/${id}/options`, { method: 'POST', body }),
  updateOptionSet: (setId: string, body: { name?: string; sortOrder?: number }) =>
    request<OptionSet>(`/products/options/${setId}`, { method: 'PATCH', body }),
  archiveOptionSet: (setId: string) => request<{ ok: true }>(`/products/options/${setId}`, { method: 'DELETE' }),
  addOptionValue: (setId: string, body: { value: string; priceDelta?: number; currencyCode?: string; sortOrder: number }) =>
    request<OptionValue>(`/products/options/${setId}/values`, { method: 'POST', body }),
  updateOptionValue: (valueId: string, body: { value?: string; priceDelta?: number; currencyCode?: string; sortOrder?: number }) =>
    request<OptionValue>(`/products/options/values/${valueId}`, { method: 'PATCH', body }),
  archiveOptionValue: (valueId: string) =>
    request<{ ok: true }>(`/products/options/values/${valueId}`, { method: 'DELETE' }),
  createPriceList: (body: PriceListBody) => request<ScopedPriceList>('/price-lists', { method: 'POST', body }),
  updatePriceList: (id: string, body: Partial<PriceListBody>) =>
    request<ScopedPriceList>(`/price-lists/${id}`, { method: 'PATCH', body }),
  createPriceListItem: (listId: string, body: PriceListItemCreateBody) =>
    request<{ id: string }>(`/price-lists/${listId}/items`, { method: 'POST', body }),
  priceLists: () => request<Paginated<ScopedPriceList>>('/price-lists', { query: { page: 1, pageSize: 50 } }),
  priceListItems: (listId: string) => request<PriceListItemFull[]>(`/price-lists/${listId}/items`),
  updateCampaign: (listId: string, itemId: string, body: CampaignBody) =>
    request<{ id: string }>(`/price-lists/${listId}/items/${itemId}`, { method: 'PATCH', body }),
  createCampaign: (listId: string, body: CampaignBody) =>
    request<{ id: string }>(`/price-lists/${listId}/items`, { method: 'POST', body }),
  catalogFiles: (tenantId: string) =>
    request<Paginated<CatalogFileLink>>('/files/links', {
      query: { entityType: 'catalog', entityId: tenantId, page: 1, pageSize: 100 },
    }),
  /** Web CatalogMailButton: katalog PDF'i `fileIds` ile eklenir. */
  sendCatalogMail: (body: { to: string; subject: string; body: string; fileIds: string[] }) =>
    request<{ delivered: true; messageId: string; sentAt: string }>('/mail/send', { method: 'POST', body }),
};

/** packages/shared `inventoryItemCreateSchema`. */
export type InventoryItemBody = {
  divisionId?: string;
  productModelId: string;
  parentInventoryItemId?: string | null;
  serialNumber: string;
  itemCondition: 'new' | 'used' | 'demo';
  controlUnit?: string;
  controlUnitSerialNumber?: string;
  loadingDate?: string;
  receivedDate?: string;
  arrivalDate?: string;
  locationStatusCode?: string;
  stockStatusCode?: string;
  warehouseId?: string;
  notes?: string;
};

/** Stok uçları (inventory.controller.ts). */
export const stockApi = {
  createWarehouse: (body: { name: string; type?: string; country?: string; province?: string; district?: string; address?: string }) =>
    request<Warehouse>('/warehouses', { method: 'POST', body }),
  create: (body: InventoryItemBody) => request<InventoryItem>('/inventory', { method: 'POST', body }),
  updateFields: (id: string, body: Partial<InventoryItemBody>) =>
    request<InventoryItem>(`/inventory/${id}`, { method: 'PATCH', body }),
  /** Sunucu "Satıldı" durumunu yalnız fatura akışına bırakır; web'de de UI yok. */
  sell: (id: string, body: { opportunityId?: string; quoteId?: string; companyId?: string; notes?: string }) =>
    request<InventoryItem>(`/inventory/${id}/sell`, { method: 'PATCH', body }),
  listPage: (query: { page: number; pageSize: number; search?: string; statusCode?: string; categoryCode?: string }) =>
    request<Paginated<StockRow>>('/inventory', { query }),
};

/** inventory.service.ts `list` satırı: endpoints `InventoryItem` + `inventory_items` kolonları. */
export type StockRow = InventoryItem & {
  divisionId?: string | null;
  productModelId?: string;
  parentInventoryItemId?: string | null;
  warehouseId?: string | null;
  reservedCompanyId?: string | null;
};
