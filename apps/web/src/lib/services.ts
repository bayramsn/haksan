/**
 * Thin domain service wrappers around the API client. These are the only
 * place in the frontend that talks to backend endpoints.
 */
import { api, getAccessToken } from './apiClient';
import { exportService } from './downloadExport';

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
  createCustomerDevice: (body: {
    companyId: string;
    inventoryItemId?: string;
    opportunityId?: string;
    quoteId?: string;
    installationDate?: string;
    warrantyStartDate?: string;
    warrantyEndDate?: string;
    deliveryDate?: string;
    notes?: string;
  }) => api.post<any>('/customer-devices', body),
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
  /**
   * Teklif PDF'ini backend'den (PDFKit) indirir. Endpoint binary döndürdüğü için
   * api client yerine token'lı ham fetch + blob indirmesi kullanılır.
   */
  downloadPdf: async (id: string, documentNo?: string): Promise<void> => {
    const base = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000/api/v1';
    const token = getAccessToken();
    const res = await fetch(`${base}/quotes/${id}/generate-pdf`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`PDF indirilemedi (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teklif-${documentNo ?? id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  /**
   * Teklif PDF'ini yeni sekmede açar (tarayıcı PDF görüntüleyicisi). Blob URL
   * hemen iptal edilmez; sekme açıldıktan sonra GC ile temizlenir.
   */
  openPdf: async (id: string): Promise<void> => {
    const base = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000/api/v1';
    const token = getAccessToken();
    const res = await fetch(`${base}/quotes/${id}/generate-pdf`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`PDF oluşturulamadı (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const win = window.open(url, '_blank', 'noopener');
    if (!win) {
      // Pop-up engellendi → indirmeye düş
      const a = document.createElement('a');
      a.href = url;
      a.download = `teklif-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
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

export const authService = {
  forgotPassword: (email: string) => api.post<{ ok: boolean; token?: string }>('/auth/forgot-password', { email }),
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
  updatePaymentStatus: (id: string, status: string) => api.patch<any>(`/payments/${id}/status`, { status }),
  updateReceivableStatus: (id: string, status: string) => api.patch<any>(`/receivables/${id}/status`, { status }),
  companySummary: (companyId: string) => api.get<any>(`/companies/${companyId}/finance-summary`),
  companyStatement: (companyId: string, params?: Record<string, string>) =>
    api.get<any[]>(`/companies/${companyId}/statement${qs(params)}`),
  customerBalances: () => api.get<any[]>('/reports/customer-balances'),
  dueDates: (params?: Record<string, string>) => api.get<any[]>(`/reports/due-dates${qs(params)}`),
  accountingInvoices: (params?: Record<string, string | number | undefined>) =>
    api.get<any>(`/accounting-invoices${qs(params)}`),
  accountingInvoice: (id: string) => api.get<any>(`/accounting-invoices/${id}`),
  createAccountingInvoice: (body: any) => api.post<any>('/accounting-invoices', body),
};

// ───── Service / Installation / Shipment ─────
export const serviceService = {
  tickets: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/service-tickets${qs(params)}`),
  createTicket: (body: any) => api.post<any>('/service-tickets', body),
  update: (id: string, body: any) => api.patch<any>(`/service-tickets/${id}`, body),
  updateTicketStatus: (id: string, statusCode: string) =>
    api.patch<any>(`/service-tickets/${id}/status`, { statusCode }),
  installations: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/installations${qs(params)}`),
  createInstallation: (body: any) => api.post<any>('/installations', body),
  shipments: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/shipments${qs(params)}`),
  shipment: (id: string) => api.get<any>(`/shipments/${id}`),
  createShipment: (body: any) => api.post<any>('/shipments', body),
  updateShipmentStatus: (id: string, statusCode: string) =>
    api.patch<any>(`/shipments/${id}/status`, { statusCode }),
  deliveries: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/deliveries${qs(params)}`),
  createDelivery: (body: any) => api.post<any>('/deliveries', body),
  updateDelivery: (id: string, body: any) => api.patch<any>(`/deliveries/${id}`, body),
  updateDeliveryStatus: (id: string, status: 'pending' | 'completed') =>
    api.patch<any>(`/deliveries/${id}/status`, { status }),
};

// ───── Machine lifecycle: passports, CPQ, service radar ─────
export const lifecycleService = {
  passports: () => api.get<any[]>('/lifecycle/passports'),
  publishPassport: (deviceId: string, body: { publicTitle?: string; publicNotes?: string }) =>
    api.post<any>(`/lifecycle/passports/${deviceId}/publish`, body),
  rotatePassport: (passportId: string) => api.post<any>(`/lifecycle/passports/${passportId}/rotate-token`),
  revokePassport: (passportId: string) => api.patch<any>(`/lifecycle/passports/${passportId}/revoke`, {}),
  cpqPreview: (body: any) => api.post<any>('/lifecycle/cpq/preview', body),
  cpqCreateQuote: (body: any) => api.post<any>('/lifecycle/cpq/create-quote', body),
  serviceRadar: () => api.get<any>('/lifecycle/service-radar'),
  publicPassport: (slug: string, token: string) =>
    api.get<any>(`/public/passports/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`),
  publicServiceTicket: (slug: string, token: string, body: { subject: string; description?: string; severity?: string }) =>
    api.post<any>(`/public/passports/${encodeURIComponent(slug)}/${encodeURIComponent(token)}/service-tickets`, body),
};

// ───── Files ─────
export const fileService = {
  signedUpload: (body: any) =>
    api.post<{ fileId: string; bucket: string; objectKey: string; uploadUrl: string; expiresInSeconds: number }>('/files/signed-upload-url', body),
  signedDownload: (fileId: string) => api.post<{ downloadUrl: string; filename: string; mimeType: string }>('/files/signed-download-url', { fileId }),
  link: (body: any) => api.post('/files/link', body),
  links: (params?: Record<string, string | number | undefined>) => api.get<Paginated<any>>(`/files/links${qs(params)}`),
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
  weeklyVisits: (params?: Record<string, string>) => api.get<any[]>(`/reports/weekly-visits${qs(params)}`),
  monthlyVisits: (params?: Record<string, string>) => api.get<any[]>(`/reports/monthly-visits${qs(params)}`),
  yearlyVisits: (params?: Record<string, string>) => api.get<any[]>(`/reports/yearly-visits${qs(params)}`),
  weeklyQuotes: (params?: Record<string, string>) => api.get<any[]>(`/reports/weekly-quotes-by-product${qs(params)}`),
  monthlyQuotes: (params?: Record<string, string>) => api.get<any[]>(`/reports/monthly-quotes-by-product${qs(params)}`),
  stockSummary: () => api.get<any[]>('/reports/stock-summary'),
  pipelineSummary: () => api.get<any[]>('/reports/pipeline-summary'),
  departmentPerformance: (params: Record<string, string>) => api.get<any>(`/reports/department-performance${qs(params)}`),
  expectedReceivables: () => api.get<any[]>('/reports/expected-receivables'),
  completedPayments: (params?: Record<string, string>) => api.get<any[]>(`/reports/completed-payments${qs(params)}`),
  warrantyExpiring: (params?: Record<string, string | number>) => api.get<any[]>(`/reports/warranty-expiring${qs(params)}`),
  yearEnd: (year: number) => api.get<YearEndReport>(`/reports/year-end?year=${year}`),
  downloadYearEnd: (year: number) => exportService.yearEnd(year),
};

// ───── Admin (users, roles, departments) ─────
export const adminService = {
  users: () => api.get<any[]>('/users'),
  createUser: (body: any) => api.post<any>('/users', body),
  updateUser: (id: string, body: any) => api.patch<any>(`/users/${id}`, body),
  userTargets: (params?: Record<string, string | number | undefined>) => api.get<any[]>(`/user-targets${qs(params)}`),
  myTargets: (params?: Record<string, string | number | undefined>) => api.get<any[]>(`/me/targets${qs(params)}`),
  saveUserTarget: (userId: string, body: any) => api.post<any>(`/users/${userId}/targets`, body),
  departmentTargets: (params?: Record<string, string | number | undefined>) => api.get<any[]>(`/department-targets${qs(params)}`),
  saveDepartmentTarget: (departmentId: string, body: any) => api.post<any>(`/departments/${departmentId}/targets`, body),
  updateDept: (id: string, body: any) => api.patch<any>(`/departments/${id}`, body),
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
