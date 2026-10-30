import { collectPaginated } from './pagination';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { inventoryApi, orders, productsApi, reportsExtra } from './endpoints';
import type { ProductUpdateInput } from '@haksan/shared';
import { stockApi, type InventoryItemBody, type StockRow } from './products.api';

const PAGE_SIZE = 50;

export const inventoryKeys = {
  list: (query: { search?: string; statusCode?: string }): QueryKey => ['inventory', 'list', query],
  detail: (id: string): QueryKey => ['inventory', 'detail', id],
  warehouses: ['inventory', 'warehouses'] as const,
  stockSummary: ['inventory', 'stock-summary'] as const,
  products: (query: { search?: string; categoryCode?: string }): QueryKey => ['products', 'list', query],
  product: (id: string): QueryKey => ['products', 'detail', id],
  priceLists: ['price-lists'] as const,
  priceListItems: (id: string): QueryKey => ['price-lists', id, 'items'],
  salesOrders: (query: { search?: string; statusCode?: string; quoteId?: string }): QueryKey => ['sales-orders', query],
  purchaseOrders: (query: { search?: string; statusCode?: string }): QueryKey => ['purchase-orders', query],
  salesOrder: (id: string): QueryKey => ['sales-orders', 'detail', id],
  purchaseOrder: (id: string): QueryKey => ['purchase-orders', 'detail', id],
};

export function useInventoryList(query: { search?: string; statusCode?: string; categoryCode?: string }, enabled = true) {
  return useInfiniteQuery({
    enabled,
    queryKey: inventoryKeys.list(query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => inventoryApi.list({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

export function useInventoryItem(id: string) {
  return useQuery({
    queryKey: inventoryKeys.detail(id),
    queryFn: () => inventoryApi.get(id),
    enabled: Boolean(id),
  });
}

function settleInventory(qc: ReturnType<typeof useQueryClient>) {
  return () => {
    void qc.invalidateQueries({ queryKey: ['inventory'] });
  };
}

/** Stok kartını firmaya rezerve eder (web StockPage ile aynı uç). */
export function useReserveInventoryItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { companyId: string; opportunityId?: string; quoteId?: string; notes?: string }) =>
      inventoryApi.reserve(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(inventoryKeys.detail(id), updated);
      settleInventory(qc)();
    },
  });
}

/** Durum değişikliği (serbest bırakma dahil). */
export function useUpdateInventoryItemStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { stockStatusCode?: string; notes?: string }) => inventoryApi.update(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(inventoryKeys.detail(id), updated);
      settleInventory(qc)();
    },
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: inventoryKeys.warehouses,
    queryFn: () => inventoryApi.warehouses(),
    staleTime: 60 * 60 * 1000,
  });
}

export function useProductList(query: { search?: string; categoryCode?: string }) {
  return useInfiniteQuery({
    queryKey: inventoryKeys.products(query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => productsApi.list({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

export function useProduct(id: string) {
  return useQuery({ queryKey: inventoryKeys.product(id), queryFn: () => productsApi.get(id), enabled: Boolean(id) });
}

/** Broşür/doküman, opsiyon setleri ve uyumlu opsiyonel donanım — ayrı uçlar. */
export function useProductMedia(id: string) {
  return useQuery({ queryKey: ['products', 'media', id], queryFn: () => productsApi.media(id), enabled: Boolean(id) });
}

export function useProductOptions(id: string) {
  return useQuery({ queryKey: ['products', 'options', id], queryFn: () => productsApi.options(id), enabled: Boolean(id) });
}

export function useCompatibleOptionalEquipment(id: string, enabled = true) {
  return useQuery({
    queryKey: ['products', 'compatible-optional', id],
    queryFn: () => productsApi.compatibleOptionalEquipment(id),
    enabled: Boolean(id) && enabled,
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProductUpdateInput) => productsApi.update(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(inventoryKeys.product(id), updated);
      void qc.invalidateQueries({ queryKey: ['products', 'list'] });
    },
  });
}

export function usePriceLists() {
  return useQuery({
    queryKey: inventoryKeys.priceLists,
    queryFn: () => collectPaginated((page) => productsApi.priceLists({ page, pageSize: 50 })),
    select: (page) => page.data,
  });
}

export function usePriceListItems(id: string) {
  return useQuery({
    queryKey: inventoryKeys.priceListItems(id),
    queryFn: () => productsApi.priceListItems(id),
    enabled: Boolean(id),
  });
}

export function useSalesOrders(query: { search?: string; statusCode?: string; quoteId?: string }, enabled = true) {
  return useInfiniteQuery({
    queryKey: inventoryKeys.salesOrders(query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => orders.sales({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
    enabled,
  });
}

export function usePurchaseOrders(query: { search?: string; statusCode?: string }) {
  return useInfiniteQuery({
    queryKey: inventoryKeys.purchaseOrders(query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => orders.purchases({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

export function useSalesOrder(id: string) {
  return useQuery({ queryKey: inventoryKeys.salesOrder(id), queryFn: () => orders.salesGet(id), enabled: Boolean(id) });
}

const quoteKeysAll = ['quotes'] as const;

/** Fiyat listesi kalemi güncelleme (liste/peşin/kampanya fiyatı). */
export function useUpdatePriceListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      listId,
      itemId,
      body,
    }: {
      listId: string;
      itemId: string;
      body: Parameters<typeof productsApi.updatePriceListItem>[2];
    }) => productsApi.updatePriceListItem(listId, itemId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['price-lists'] }),
  });
}

/** Onaylı tekliften satış siparişi üretir; teklif + sipariş listelerini tazeler. */
export function useCreateSalesOrderFromQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      quoteId,
      ...body
    }: {
      quoteId: string;
      copyItems?: boolean;
      reserveStock?: boolean;
      notes?: string;
    }) => orders.createFromQuote(quoteId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sales-orders'] });
      void qc.invalidateQueries({ queryKey: quoteKeysAll });
    },
  });
}



export function usePurchaseOrder(id: string) {
  return useQuery({ queryKey: inventoryKeys.purchaseOrder(id), queryFn: () => orders.purchaseGet(id), enabled: Boolean(id) });
}

type OrderAction = 'approve' | 'reserve' | 'fulfilled' | 'cancelled' | 'send' | 'in_transit' | 'received';

export function useOrderAction(kind: 'sales' | 'purchase', id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: OrderAction) => {
      if (kind === 'sales') {
        if (action === 'approve') return orders.salesApprove(id);
        if (action === 'reserve') return orders.salesReserve(id);
        return orders.salesStatus(id, action);
      }
      if (action === 'send') return orders.purchaseSend(id);
      if (action === 'approve') return orders.purchaseApprove(id);
      return orders.purchaseStatus(id, action);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: kind === 'sales' ? inventoryKeys.salesOrder(id) : inventoryKeys.purchaseOrder(id),
        }),
        qc.invalidateQueries({ queryKey: [kind === 'sales' ? 'sales-orders' : 'purchase-orders'] }),
      ]);
    },
  });
}

/**
 * Web Stok sayfası KPI, depo/marka dağılımı, kritik stok ve bağlı opsiyonel
 * donanımı tüm stok kalemleri üzerinden hesaplar; mobil de hepsini yükler.
 */
export function useAllInventory() {
  return useQuery({
    queryKey: ['inventory', 'all'],
    queryFn: async () => {
      const rows: StockRow[] = [];
      for (let page = 1; ; page += 1) {
        const result = await stockApi.listPage({ page, pageSize: 200 });
        rows.push(...result.data);
        if (page >= result.meta.totalPages) break;
      }
      return rows;
    },
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: stockApi.createWarehouse,
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.warehouses }),
  });
}

export function useCreateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InventoryItemBody) => stockApi.create(body),
    onSuccess: () => settleInventory(qc)(),
  });
}

/** `EditStockDialog` alan düzenlemesi. */
export function useUpdateInventoryFields(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<InventoryItemBody>) => stockApi.updateFields(id, body),
    onSuccess: () => settleInventory(qc)(),
  });
}

/**
 * /reports/stock-summary: envanter durumuna göre ADET dökümü
 * (available / reserved / in_transit / ...). Panelde "Üretim & Stok Durumu"
 * kartını besliyor. Tutar veya minimum stok eşiği bu uçtan gelmiyor.
 */
export function useStockSummary() {
  return useQuery({
    queryKey: inventoryKeys.stockSummary,
    queryFn: () => reportsExtra.stockSummary(),
    staleTime: 60_000,
  });
}
