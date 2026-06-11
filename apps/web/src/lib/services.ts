/**
 * Thin domain service wrappers around the API client. These are the only
 * place in the frontend that talks to backend endpoints.
 */
import { api, getAccessToken } from './apiClient';

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export type ProductImportStatus = 'create' | 'update' | 'error' | 'skip';

export interface ProductImportRow {
  rowNumber: number;
  brandName: string;
  modelCode: string;
  modelName?: string;
  fullName: string;
  productGroupCode?: string;
  categoryCode?: string;
  subcategoryCode?: string;
  productTypeCode?: string;
  currencyCode: string;
  listPrice?: number;
  cashPrice?: number;
  vatRate: number;
  originCountry?: string;
  hsCode?: string;
  stockCode?: string;
  description?: string;
  specs: Array<{ specGroupCode?: string; specKey: string; specValue: string; specUnit?: string; sortOrder: number }>;
  equipment: Array<{ equipmentTypeCode: string; title: string; description?: string; isPromotion: boolean; sortOrder: number }>;
  status: ProductImportStatus;
  errors: string[];
  warnings: string[];
}

export interface ProductImportSummary {
  total: number;
  create: number;
  update: number;
  skip: number;
  error: number;
}

export interface ProductImportPreview {
  fileName: string;
  sheetName: string;
  headerRowNumber: number;
  totalRows: number;
  rows: ProductImportRow[];
  summary: ProductImportSummary;
}

// ───── Companies ─────
export interface CompanyDTO {
  id: string;
  legalTitle: string;
  shortName?: string | null;
  sector?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  website?: string | null;
  notes?: string | null;
  relationTypeId?: string | null;
  customerStatusId?: string | null;
  createdAt: string;
}

export const companyService = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<Paginated<CompanyDTO>>(`/companies${qs(params)}`),
  get: (id: string) => api.get<CompanyDTO & { addresses: any[]; phones: any[]; emails: any[] }>(`/companies/${id}`),
  create: (body: any) => api.post<CompanyDTO>('/companies', body),
  update: (id: string, body: any) => api.patch<CompanyDTO>(`/companies/${id}`, body),
  remove: (id: string) => api.delete(`/companies/${id}`),
};

// ───── Contacts ─────
export const contactService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/contacts${qs(params)}`),
  get: (id: string) => api.get<any>(`/contacts/${id}`),
  create: (body: any) => api.post<any>('/contacts', body),
  update: (id: string, body: any) => api.patch<any>(`/contacts/${id}`, body),
  remove: (id: string) => api.delete(`/contacts/${id}`),
};

// ───── Opportunities ─────
export const opportunityService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/opportunities${qs(params)}`),
  get: (id: string) => api.get<any>(`/opportunities/${id}`),
  create: (body: any) => api.post<any>('/opportunities', body),
  update: (id: string, body: any) => api.patch<any>(`/opportunities/${id}`, body),
  remove: (id: string) => api.delete(`/opportunities/${id}`),
  changeStage: (id: string, body: any) => api.patch<any>(`/opportunities/${id}/stage`, body),
};

// ───── Activities ─────
export const activityService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/activities${qs(params)}`),
  create: (body: any) => api.post<any>('/activities', body),
  createVisit: (body: any) => api.post<any>('/visits', body),
  createCall: (body: any) => api.post<any>('/calls', body),
};

// ───── Products / Brands ─────
export const productService = {
  listBrands: () => api.get<any[]>('/brands'),
  createBrand: (body: any) => api.post<any>('/brands', body),
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/products${qs(params)}`),
  get: (id: string) => api.get<any>(`/products/${id}`),
  create: (body: any) => api.post<any>('/products', body),
  update: (id: string, body: any) => api.patch<any>(`/products/${id}`, body),
  remove: (id: string) => api.delete(`/products/${id}`),
  previewImport: (body: { fileName: string; fileBase64: string }) =>
    api.post<ProductImportPreview>('/products/import/preview', body),
  commitImport: (body: { rows: ProductImportRow[]; mode?: 'upsert' | 'create_only'; replaceDetails?: boolean }) =>
    api.post<{ rows: ProductImportRow[]; summary: ProductImportSummary }>('/products/import/commit', body),
  specs: (id: string) => api.get<any[]>(`/products/${id}/specs`),
  options: (id: string) => api.get<any[]>(`/products/${id}/options`),
  addSpec: (id: string, body: any) => api.post<any>(`/products/${id}/specs`, body),
  equipment: (id: string) => api.get<any[]>(`/products/${id}/equipment`),
  media: (id: string) =>
    api.get<Array<{ fileId: string; mediaType: 'image' | 'document'; title: string | null; mimeType: string; sizeBytes: number; url: string }>>(
      `/products/${id}/media`
    ),
  addEquipment: (id: string, body: any) => api.post<any>(`/products/${id}/equipment`, body),
  replaceDetails: (id: string, body: any) => api.put<any>(`/products/${id}/details`, body),
  listPriceLists: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/price-lists${qs(params)}`),
  createPriceList: (body: any) => api.post<any>('/price-lists', body),
  updatePriceList: (id: string, body: any) => api.patch<any>(`/price-lists/${id}`, body),
  listPriceListItems: (id: string) => api.get<any[]>(`/price-lists/${id}/items`),
  createPriceListItem: (id: string, body: any) => api.post<any>(`/price-lists/${id}/items`, body),
  updatePriceListItem: (id: string, itemId: string, body: any) => api.patch<any>(`/price-lists/${id}/items/${itemId}`, body),
};

// ───── Competitors ─────
export const competitorService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/competitors${qs(params)}`),
  create: (body: any) => api.post<any>('/competitors', body),
  update: (id: string, body: any) => api.patch<any>(`/competitors/${id}`, body),
  products: (id: string) => api.get<any[]>(`/competitors/${id}/products`),
  createProduct: (id: string, body: any) => api.post<any>(`/competitors/${id}/products`, body),
};

// ───── Inventory ─────
export const inventoryService = {
  listWarehouses: () => api.get<any[]>('/warehouses'),
  createWarehouse: (body: any) => api.post<any>('/warehouses', body),
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/inventory${qs(params)}`),
  get: (id: string) => api.get<any>(`/inventory/${id}`),
  create: (body: any) => api.post<any>('/inventory', body),
  update: (id: string, body: any) => api.patch<any>(`/inventory/${id}`, body),
  bySerial: (s: string) => api.get<any>(`/inventory/serial/${encodeURIComponent(s)}`),
  reserve: (id: string, body: any) => api.patch<any>(`/inventory/${id}/reserve`, body),
  sell: (id: string, body: any) => api.patch<any>(`/inventory/${id}/sell`, body),
  customerDevices: (params?: Record<string, string | number | undefined>) =>
    api.get<Paginated<any>>(`/customer-devices${qs(params)}`),
};

// ───── Quotes ─────
export const quoteService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/quotes${qs(params)}`),
  get: (id: string) => api.get<any>(`/quotes/${id}`),
  create: (body: any) => api.post<any>('/quotes', body),
  update: (id: string, body: any) => api.patch<any>(`/quotes/${id}`, body),
  remove: (id: string) => api.delete(`/quotes/${id}`),
  addItem: (id: string, body: any) => api.post<any>(`/quotes/${id}/items`, body),
  updateItem: (id: string, itemId: string, body: any) => api.patch<any>(`/quotes/${id}/items/${itemId}`, body),
  deleteItem: (id: string, itemId: string) => api.delete(`/quotes/${id}/items/${itemId}`),
  terms: (id: string, body: any) => api.put<any>(`/quotes/${id}/terms`, body),
  approve: (id: string) => api.post(`/quotes/${id}/approve`),
  reject: (id: string) => api.post(`/quotes/${id}/reject`),
  send: (id: string) => api.post(`/quotes/${id}/send`),
};

// ───── Note templates (reusable quote notes) ─────
export const noteTemplateService = {
  list: (scope = 'quote') => api.get<any[]>(`/note-templates${qs({ scope })}`),
  create: (body: { title: string; body: string; scope?: string }) => api.post<any>('/note-templates', body),
  remove: (id: string) => api.delete(`/note-templates/${id}`),
};

// ───── Sales / Purchase Orders ─────
export const salesOrderService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/sales-orders${qs(params)}`),
  get: (id: string) => api.get<any>(`/sales-orders/${id}`),
  create: (body: any) => api.post<any>('/sales-orders', body),
  createFromQuote: (quoteId: string, body: any) => api.post<any>(`/sales-orders/from-quote/${quoteId}`, body),
  update: (id: string, body: any) => api.patch<any>(`/sales-orders/${id}`, body),
  remove: (id: string) => api.delete(`/sales-orders/${id}`),
  addItem: (id: string, body: any) => api.post<any>(`/sales-orders/${id}/items`, body),
  approve: (id: string) => api.post(`/sales-orders/${id}/approve`),
  reserve: (id: string) => api.post(`/sales-orders/${id}/reserve`),
  setStatus: (id: string, body: any) => api.patch(`/sales-orders/${id}/status`, body),
};

export const purchaseOrderService = {
  list: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/purchase-orders${qs(params)}`),
  get: (id: string) => api.get<any>(`/purchase-orders/${id}`),
  create: (body: any) => api.post<any>('/purchase-orders', body),
  update: (id: string, body: any) => api.patch<any>(`/purchase-orders/${id}`, body),
  remove: (id: string) => api.delete(`/purchase-orders/${id}`),
  addItem: (id: string, body: any) => api.post<any>(`/purchase-orders/${id}/items`, body),
  send: (id: string) => api.post(`/purchase-orders/${id}/send`),
  approve: (id: string) => api.post(`/purchase-orders/${id}/approve`),
  setStatus: (id: string, body: any) => api.patch(`/purchase-orders/${id}/status`, body),
};

// ───── Commercial documents ─────
export const documentService = {
  proformas: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/proformas${qs(params)}`),
  createProforma: (body: any) => api.post<any>('/proformas', body),
  updateProforma: (id: string, body: any) => api.patch<any>(`/proformas/${id}`, body),
  contracts: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/contracts${qs(params)}`),
  createContract: (body: any) => api.post<any>('/contracts', body),
  updateContract: (id: string, body: any) => api.patch<any>(`/contracts/${id}`, body),
  commercialInvoices: (params?: Record<string, string | number | undefined>) =>
    api.get<Paginated<any>>(`/commercial-invoices${qs(params)}`),
  createCommercialInvoice: (body: any) => api.post<any>('/commercial-invoices', body),
  updateCommercialInvoice: (id: string, body: any) => api.patch<any>(`/commercial-invoices/${id}`, body),
};

// ───── Finance ─────
export const financeService = {
  receivables: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/receivables${qs(params)}`),
  createReceivable: (body: any) => api.post<any>('/receivables', body),
  payments: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/payments${qs(params)}`),
  createPayment: (body: any) => api.post<any>('/payments', body),
};

// ───── Service / Installation / Shipment ─────
export const serviceService = {
  tickets: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/service-tickets${qs(params)}`),
  createTicket: (body: any) => api.post<any>('/service-tickets', body),
  updateTicketStatus: (id: string, statusCode: string) =>
    api.patch<any>(`/service-tickets/${id}/status`, { statusCode }),
  installations: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/installations${qs(params)}`),
  createInstallation: (body: any) => api.post<any>('/installations', body),
  shipments: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/shipments${qs(params)}`),
  createShipment: (body: any) => api.post<any>('/shipments', body),
};

// ───── Files ─────
export const fileService = {
  signedUpload: (body: any) =>
    api.post<{ fileId: string; bucket: string; objectKey: string; uploadUrl: string; expiresInSeconds: number }>('/files/signed-upload-url', body),
  signedDownload: (fileId: string) => api.post<{ downloadUrl: string; filename: string; mimeType: string }>('/files/signed-download-url', { fileId }),
  link: (body: any) => api.post('/files/link', body),
  remove: (id: string) => api.delete(`/files/${id}`),
};

// ───── Reports ─────

/** Yıl sonu / karlılık raporu (GET /reports/year-end). Tüm parasal alanlar string döner. */
export interface YearEndReport {
  year: number;
  summary: {
    total: number;
    won: number;
    lost: number;
    open: number;
    wonValue: string;
    lostValue: string;
    openValue: string;
    winRate: number;
    lossRate: number;
    avgWonValue: string;
    avgLostValue: string;
    avgQuoteValue: string;
  };
  lostReasons: Array<{ code: string | null; name: string | null; count: number; value: string }>;
  competitors: Array<{ id: string; name: string; count: number; value: string }>;
  wonReasons: Array<{ reason: string | null; count: number; value: string }>;
  monthly: Array<{ month: string; won: number; lost: number; wonValue: string; lostValue: string }>;
  byUser: Array<{ userId: string | null; name: string | null; won: number; lost: number; total: number; wonValue: string }>;
  quotes: { count: number; value: string };
  quotesByStatus: Array<{ code: string | null; name: string | null; count: number; totalValue: string; avgValue: string }>;
}

export const reportService = {
  weeklyVisits: () => api.get<any[]>('/reports/weekly-visits'),
  monthlyVisits: () => api.get<any[]>('/reports/monthly-visits'),
  weeklyQuotes: () => api.get<any[]>('/reports/weekly-quotes-by-product'),
  monthlyQuotes: () => api.get<any[]>('/reports/monthly-quotes-by-product'),
  stockSummary: () => api.get<any[]>('/reports/stock-summary'),
  pipelineSummary: () => api.get<any[]>('/reports/pipeline-summary'),
  expectedReceivables: () => api.get<any[]>('/reports/expected-receivables'),
  completedPayments: () => api.get<any[]>('/reports/completed-payments'),
  warrantyExpiring: () => api.get<any[]>('/reports/warranty-expiring'),
  yearEnd: (year: number) => api.get<YearEndReport>(`/reports/year-end?year=${year}`),
  /**
   * Çok sayfalı .xlsx raporunu backend'den indirir. api client JSON/metin
   * döndürdüğü için burada token'lı ham fetch + blob indirmesi yapılır.
   */
  downloadYearEnd: async (year: number): Promise<void> => {
    const base = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000/api/v1';
    const token = getAccessToken();
    const res = await fetch(`${base}/reports/export/year-end?year=${year}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Excel indirilemedi (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karlilik-raporu-${year}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// ───── Admin (users, roles, departments) ─────
export const adminService = {
  users: () => api.get<any[]>('/users'),
  createUser: (body: any) => api.post<any>('/users', body),
  updateUser: (id: string, body: any) => api.patch<any>(`/users/${id}`, body),
  roles: () => api.get<any[]>('/roles'),
  createRole: (body: any) => api.post<any>('/roles', body),
  updateRole: (id: string, body: any) => api.patch<any>(`/roles/${id}`, body),
  permissions: () => api.get<any[]>('/permissions'),
  departments: () => api.get<any[]>('/departments'),
  createDept: (body: any) => api.post<any>('/departments', body),
  auditLogs: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/audit-logs${qs(params)}`),
};

// ───── Lookups ─────
export const lookupService = {
  byName: (name: string) => api.get<any[]>(`/lookups/${name}`),
};

// ───── helpers ─────
function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}
