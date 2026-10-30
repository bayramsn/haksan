import { downloadAndShare } from '@/src/native/files';

/** apps/web/src/lib/downloadExport.ts `exportService` ile aynı uçlar ve dosya adları. */
type Query = Record<string, string | number | undefined | null>;

export const exportService = {
  companies: (query?: Query) => downloadAndShare('/exports/companies', 'firmalar.xlsx', { query }),
  contacts: (query?: Query) => downloadAndShare('/exports/contacts', 'kontaklar.xlsx', { query }),
  opportunities: (query?: Query) => downloadAndShare('/exports/opportunities', 'satis-kartlari.xlsx', { query }),
  quotes: (query?: Query) => downloadAndShare('/exports/quotes', 'teklifler.xlsx', { query }),
  finance: () => downloadAndShare('/exports/finance', 'kasa-hareketleri.xlsx'),
  customerStatement: (companyId: string, query?: Query) =>
    downloadAndShare(`/exports/customer-statement/${companyId}`, `cari-ekstre-${companyId}.xlsx`, { query }),
  customerStatementPdf: (companyId: string, query?: Query) =>
    downloadAndShare(`/exports/customer-statement/${companyId}`, `cari-ekstre-${companyId}.pdf`, {
      query: { format: 'pdf', ...query },
    }),
  customerBalances: () => downloadAndShare('/exports/customer-balances', 'cari-rapor.xlsx'),
  serviceTickets: () => downloadAndShare('/exports/service-tickets', 'servis-talepleri.xlsx'),
  serviceComplaints: () => downloadAndShare('/exports/service-complaints', 'sikayet-kutusu.xlsx'),
  inventory: (query?: Query) => downloadAndShare('/exports/inventory', 'stok.xlsx', { query }),
  shipments: () => downloadAndShare('/exports/shipments', 'sevkiyatlar.xlsx'),
  deliveries: () => downloadAndShare('/exports/deliveries', 'teslimatlar.xlsx'),
  purchaseOrders: (query?: Query) =>
    downloadAndShare('/exports/purchase-orders', 'satinalma-siparisleri.xlsx', { query }),
  documents: () => downloadAndShare('/exports/documents', 'dokumanlar.xlsx'),
  operational: (year: number, period: 'monthly' | 'yearly', filters?: { ownerUserId?: string; departmentId?: string }) =>
    downloadAndShare('/exports/operational', period === 'monthly' ? `rapor-${year}.xlsx` : 'rapor-yillik.xlsx', {
      query: { year, period, ...filters },
    }),
  yearEnd: (year: number) =>
    downloadAndShare('/reports/export/year-end', `karlilik-raporu-${year}.xlsx`, { query: { year } }),
  departmentPerformance: (period: string, departmentId?: string) =>
    downloadAndShare('/reports/export/department-performance', `departman-raporu-${period}.xlsx`, {
      query: { period, departmentId },
    }),
  pipelineSummary: () => downloadAndShare('/reports/export/pipeline-summary', 'pipeline-summary.xlsx'),
  stockSummary: () => downloadAndShare('/reports/export/stock-summary', 'stock-summary.xlsx'),
  /** Ürün içe aktarma şablonu (opsiyonel kategori/tip daraltması). */
  productImportTemplate: (query?: { categoryId?: string; productTypeId?: string; subcategoryId?: string }) =>
    downloadAndShare('/exports/product-import-template', 'urun-ice-aktarma-sablonu.xlsx', { query }),
};
