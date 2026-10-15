import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  productsExtraApi,
  type CampaignBody,
  type CatalogProduct,
  type PriceListBody,
  type PriceListItemCreateBody,
  type ProductCreateBody,
  type ProductEquipmentInput,
  type ProductSpecInput,
} from './products.api';

const LOAD_ALL_PAGE_SIZE = 200;

export const productKeys = {
  all: ['products', 'list', 'all'] as const,
  brands: (divisionId?: string) => ['products', 'brands', divisionId ?? 'all'] as const,
  taxonomy: ['products', 'taxonomy'] as const,
  specs: (id: string) => ['products', 'specs', id] as const,
  specTemplates: (productTypeCode?: string, divisionId?: string) =>
    ['products', 'spec-templates', productTypeCode ?? '', divisionId ?? ''] as const,
  equipment: (id: string) => ['products', 'equipment', id] as const,
  optionSets: (id: string) => ['products', 'options', id] as const,
  importOptions: (divisionId?: string) => ['products', 'import-options', divisionId ?? ''] as const,
};

/**
 * Web ürün kataloğu, fiyat listesi ve stok sayfaları tüm ürünleri istemciye
 * alıp aile/seri/taksonomi süzmesini yerelde yapar; mobil aynı veriyi kullanır.
 */
export function useAllProducts(enabled = true) {
  return useQuery({
    queryKey: productKeys.all,
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const rows: CatalogProduct[] = [];
      for (let page = 1; ; page += 1) {
        const result = await productsExtraApi.listAll({ page, pageSize: LOAD_ALL_PAGE_SIZE });
        rows.push(...result.data);
        if (page >= result.meta.totalPages) break;
      }
      return rows;
    },
  });
}

export function useBrands(divisionId?: string, enabled = true) {
  return useQuery({
    queryKey: productKeys.brands(divisionId),
    queryFn: () => productsExtraApi.brands(divisionId),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Ürün grubu → kategori → alt kategori → tip zinciri (üst bağlantı kolonlarıyla). */
export function useProductTaxonomy() {
  return useQuery({
    queryKey: productKeys.taxonomy,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const [groups, categories, subcategories, types] = await Promise.all([
        productsExtraApi.productGroups(),
        productsExtraApi.productCategories(),
        productsExtraApi.productSubcategories(),
        productsExtraApi.productTypes(),
      ]);
      return { groups, categories, subcategories, types };
    },
  });
}

function useProductInvalidation() {
  const qc = useQueryClient();
  return (id?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['products'] }),
      qc.invalidateQueries({ queryKey: ['price-lists'] }),
      id ? qc.invalidateQueries({ queryKey: ['products', 'detail', id] }) : Promise.resolve(),
    ]);
}

export function useCreateProduct() {
  const invalidate = useProductInvalidation();
  return useMutation({
    mutationFn: (body: ProductCreateBody) => productsExtraApi.create(body),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteProduct() {
  const invalidate = useProductInvalidation();
  return useMutation({
    mutationFn: (id: string) => productsExtraApi.remove(id),
    onSuccess: () => invalidate(),
  });
}

export function useCreateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productsExtraApi.createBrand,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products', 'brands'] }),
  });
}

export function useImportTemplateOptions(divisionId?: string) {
  return useQuery({
    queryKey: productKeys.importOptions(divisionId),
    queryFn: () => productsExtraApi.importTemplateOptions(divisionId),
    enabled: Boolean(divisionId),
  });
}

export function usePreviewProductImport() {
  return useMutation({ mutationFn: productsExtraApi.previewImport });
}

export function useCommitProductImport() {
  const invalidate = useProductInvalidation();
  return useMutation({
    mutationFn: productsExtraApi.commitImport,
    onSuccess: () => invalidate(),
  });
}

export function useProductSpecs(id: string, enabled = true) {
  return useQuery({
    queryKey: productKeys.specs(id),
    queryFn: () => productsExtraApi.specs(id),
    enabled: Boolean(id) && enabled,
  });
}

export function useSpecTemplates(productTypeCode?: string, divisionId?: string) {
  return useQuery({
    queryKey: productKeys.specTemplates(productTypeCode, divisionId),
    queryFn: () => productsExtraApi.specTemplates(productTypeCode, divisionId),
    enabled: Boolean(productTypeCode),
    staleTime: 5 * 60_000,
  });
}

export function useProductEquipment(id: string, enabled = true) {
  return useQuery({
    queryKey: productKeys.equipment(id),
    queryFn: () => productsExtraApi.equipment(id),
    enabled: Boolean(id) && enabled,
  });
}

export function useAddProductSpec(id: string) {
  const invalidate = useProductInvalidation();
  return useMutation({
    mutationFn: (body: ProductSpecInput) => productsExtraApi.addSpec(id, body),
    onSuccess: () => invalidate(id),
  });
}

export function useAddProductEquipment(id: string) {
  const invalidate = useProductInvalidation();
  return useMutation({
    mutationFn: (body: ProductEquipmentInput) => productsExtraApi.addEquipment(id, body),
    onSuccess: () => invalidate(id),
  });
}

export function useReplaceProductDetails(id: string) {
  const invalidate = useProductInvalidation();
  return useMutation({
    mutationFn: (body: { specs: ProductSpecInput[]; equipment: ProductEquipmentInput[] }) =>
      productsExtraApi.replaceDetails(id, body),
    onSuccess: () => invalidate(id),
  });
}

export function useUpdateStandardEquipment(id: string) {
  const invalidate = useProductInvalidation();
  return useMutation({
    mutationFn: (body: { standardEquipment: string[]; supplierCompanyId?: string | null }) =>
      productsExtraApi.updateStandardEquipment(id, body),
    onSuccess: () => invalidate(id),
  });
}

export function useOptionSets(id: string, enabled = true) {
  return useQuery({
    queryKey: productKeys.optionSets(id),
    queryFn: () => productsExtraApi.optionSets(id),
    enabled: Boolean(id) && enabled,
  });
}

type OptionMutation =
  | { kind: 'addSet'; name: string; sortOrder: number }
  | { kind: 'updateSet'; setId: string; name: string }
  | { kind: 'archiveSet'; setId: string }
  | { kind: 'addValue'; setId: string; value: string; priceDelta?: number; currencyCode?: string; sortOrder: number }
  | { kind: 'updateValue'; valueId: string; value: string; priceDelta?: number }
  | { kind: 'archiveValue'; valueId: string };

/** Opsiyon seti / değer CRUD'u tek mutasyonda; her işlem sonrası set listesi tazelenir. */
export function useOptionMutation(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OptionMutation): Promise<unknown> => {
      switch (input.kind) {
        case 'addSet':
          return productsExtraApi.addOptionSet(productId, { name: input.name, sortOrder: input.sortOrder });
        case 'updateSet':
          return productsExtraApi.updateOptionSet(input.setId, { name: input.name });
        case 'archiveSet':
          return productsExtraApi.archiveOptionSet(input.setId);
        case 'addValue':
          return productsExtraApi.addOptionValue(input.setId, {
            value: input.value,
            priceDelta: input.priceDelta,
            currencyCode: input.currencyCode,
            sortOrder: input.sortOrder,
          });
        case 'updateValue':
          return productsExtraApi.updateOptionValue(input.valueId, { value: input.value, priceDelta: input.priceDelta });
        case 'archiveValue':
          return productsExtraApi.archiveOptionValue(input.valueId);
      }
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: productKeys.optionSets(productId) }),
        qc.invalidateQueries({ queryKey: ['products', 'options', productId] }),
      ]),
  });
}

export function useCreatePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PriceListBody) => productsExtraApi.createPriceList(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-lists'] }),
  });
}

export function useUpdatePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<PriceListBody> }) => productsExtraApi.updatePriceList(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-lists'] }),
  });
}

/** Bölüm alanıyla birlikte, ada göre sıralı fiyat listeleri. */
export function useScopedPriceLists() {
  return useQuery({
    queryKey: ['price-lists', 'scoped'],
    queryFn: () => productsExtraApi.priceLists(),
    select: (page) => [...page.data].sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'tr', { sensitivity: 'base' })),
  });
}

export function usePriceListItemsFull(listId: string) {
  return useQuery({
    queryKey: ['price-lists', listId, 'items', 'full'],
    queryFn: () => productsExtraApi.priceListItems(listId),
    enabled: Boolean(listId),
  });
}

/** Kalem varsa günceller, yoksa ürün için yeni kalem açar (web `saveCampaign`). */
export function useSaveCampaign(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId?: string; body: CampaignBody }) =>
      itemId ? productsExtraApi.updateCampaign(listId, itemId, body) : productsExtraApi.createCampaign(listId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-lists'] }),
  });
}

export function useCatalogFiles(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['files', 'catalog', tenantId ?? ''],
    queryFn: () => productsExtraApi.catalogFiles(tenantId ?? ''),
    enabled: Boolean(tenantId),
    select: (page) => page.data,
  });
}

export function useSendCatalogMail() {
  return useMutation({ mutationFn: productsExtraApi.sendCatalogMail });
}

export function useCreatePriceListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, body }: { listId: string; body: PriceListItemCreateBody }) =>
      productsExtraApi.createPriceListItem(listId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-lists'] }),
  });
}
