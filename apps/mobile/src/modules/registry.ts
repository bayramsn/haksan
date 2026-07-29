import type { NavKey } from '@/src/navigation/modules';
import {
  adminService,
  calendarService,
  callAssistantService,
  chatService,
  companyService,
  contactService,
  documentService,
  financeService,
  inventoryService,
  notificationService,
  opportunityService,
  productService,
  purchaseOrderService,
  quoteService,
  reportService,
  serviceService,
  type Paginated,
} from '@/src/api/services';

export type ModuleKind =
  | 'list'
  | 'kanban'
  | 'map'
  | 'calendar'
  | 'chat'
  | 'notifications'
  | 'call-assistant'
  | 'reports'
  | 'settings'
  | 'balances'
  | 'duedates'
  | 'pricelist'
  | 'admin-list';

export type ListResult = Paginated<Record<string, unknown>> | Record<string, unknown>[] | { data?: unknown[]; items?: unknown[] };

export type ModuleConfig = {
  kind: ModuleKind;
  fetchList: (params?: Record<string, string | number | undefined>) => Promise<ListResult>;
  fetchOne?: (id: string) => Promise<Record<string, unknown>>;
  titleField: string;
  subtitleField?: string;
  badgeField?: string;
  /** Sol baştaki kart ikonu — Ionicons adı */
  icon?: string;
  /** Renk kodlu durum rozeti için statü alanı ({code,name} nesnesi ya da kod) */
  statusField?: string;
  /** Kart altı meta için tarih alanı (ör. issueDate, signedDate) */
  dateField?: string;
  /** Sağdaki tutar alanı (noktalı yol, ör. quote.grandTotal) */
  amountField?: string;
  /** Tutar para birimi alanı (noktalı yol, ör. currency.code) */
  currencyField?: string;
  searchParam?: string;
  detailFields?: string[];
};

function asPaginated(res: ListResult): Record<string, unknown>[] {
  if (Array.isArray(res)) return res;
  if ('data' in res && Array.isArray(res.data)) return res.data as Record<string, unknown>[];
  if ('items' in res && Array.isArray(res.items)) return res.items as Record<string, unknown>[];
  return [];
}

export function normalizeList(res: ListResult): Record<string, unknown>[] {
  return asPaginated(res);
}


function toListResult<T>(promise: Promise<T>): Promise<ListResult> {
  return promise as unknown as Promise<ListResult>;
}

function toRecord(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  return promise as unknown as Promise<Record<string, unknown>>;
}

function toQueryParams(p?: Record<string, string | number | undefined>): Record<string, string> | undefined {
  if (!p) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(p)) {
    if (value !== undefined) out[key] = String(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export const MODULE_REGISTRY: Partial<Record<NavKey, ModuleConfig>> = {
  customers: {
    kind: 'list',
    fetchList: (p) => companyService.list(p),
    fetchOne: (id) => toRecord(companyService.get(id)),
    titleField: 'legalTitle',
    subtitleField: 'sector',
    searchParam: 'q',
    detailFields: ['legalTitle', 'taxNumber', 'taxOffice', 'website', 'notes'],
  },
  contacts: {
    kind: 'list',
    fetchList: (p) => contactService.list(p),
    fetchOne: (id) => contactService.get(id),
    titleField: 'fullName',
    subtitleField: 'title',
    searchParam: 'q',
    detailFields: ['fullName', 'email', 'phone', 'title'],
  },
  'sales-cases': {
    kind: 'kanban',
    fetchList: (p) => opportunityService.list(p),
    fetchOne: (id) => opportunityService.get(id),
    titleField: 'title',
    subtitleField: 'stageCode',
    badgeField: 'estimatedValue',
  },
  offers: {
    kind: 'list',
    fetchList: (p) => quoteService.list(p),
    fetchOne: (id) => quoteService.get(id),
    titleField: 'documentNo',
    subtitleField: 'statusCode',
    detailFields: ['documentNo', 'statusCode', 'totalAmount', 'currencyCode'],
  },
  proformas: {
    kind: 'list',
    fetchList: (p) => documentService.proformas(p),
    fetchOne: (id) => apiGetProforma(id),
    titleField: 'documentNo',
    subtitleField: 'company.legalTitle',
    icon: 'document-text-outline',
    statusField: 'status',
    dateField: 'issueDate',
    amountField: 'quote.grandTotal',
    currencyField: 'currency.code',
  },
  contracts: {
    kind: 'list',
    fetchList: (p) => documentService.contracts(p),
    fetchOne: (id) => apiGetProforma(id),
    titleField: 'contractNo',
    subtitleField: 'company.legalTitle',
    icon: 'ribbon-outline',
    statusField: 'status',
    dateField: 'signedDate',
    amountField: 'quote.grandTotal',
    currencyField: 'currency.code',
  },
  documents: {
    kind: 'list',
    fetchList: async (p) => {
      const [pro, con] = await Promise.all([documentService.proformas(p), documentService.contracts(p)]);
      const contracts = normalizeList(con).map((c) => ({ ...c, documentNo: c.documentNo ?? c.contractNo }));
      return [...normalizeList(pro), ...contracts];
    },
    fetchOne: (id) => apiGetProforma(id),
    titleField: 'documentNo',
    subtitleField: 'company.legalTitle',
    icon: 'document-attach-outline',
    statusField: 'status',
    dateField: 'issueDate',
    amountField: 'quote.grandTotal',
    currencyField: 'currency.code',
  },
  'sales-price-list': { kind: 'pricelist', fetchList: () => productService.listPriceLists(), titleField: 'name', subtitleField: 'currencyCode' },
  products: {
    kind: 'list',
    fetchList: (p) => productService.list(p),
    fetchOne: (id) => productService.get(id),
    titleField: 'fullName',
    subtitleField: 'modelCode',
    searchParam: 'search',
  },
  stock: {
    kind: 'list',
    fetchList: (p) => inventoryService.list(p),
    fetchOne: (id) => inventoryService.get(id),
    titleField: 'serialNumber',
    subtitleField: 'statusCode',
    searchParam: 'q',
  },
  'purchase-orders': {
    kind: 'list',
    fetchList: (p) => purchaseOrderService.list(p),
    fetchOne: (id) => purchaseOrderService.get(id),
    titleField: 'documentNo',
    subtitleField: 'statusCode',
  },
  payments: {
    kind: 'list',
    fetchList: (p) => financeService.payments(p),
    titleField: 'description',
    subtitleField: 'amount',
    badgeField: 'status',
  },
  'accounting-invoices': {
    kind: 'list',
    fetchList: (p) => financeService.accountingInvoices(p).then(normalizeAccounting),
    fetchOne: (id) => financeService.accountingInvoice(id),
    titleField: 'invoiceNo',
    subtitleField: 'status',
  },
  'customer-balances': { kind: 'balances', fetchList: () => financeService.customerBalances(), titleField: 'legalTitle', subtitleField: 'balance' },
  'due-dates': { kind: 'duedates', fetchList: (p) => financeService.dueDates(toQueryParams(p)), titleField: 'companyName', subtitleField: 'dueDate' },
  shipments: {
    kind: 'list',
    fetchList: (p) => serviceService.shipments(p),
    fetchOne: (id) => serviceService.shipment(id),
    titleField: 'trackingNo',
    subtitleField: 'statusCode',
    searchParam: 'search',
  },
  deliveries: {
    kind: 'list',
    fetchList: (p) => serviceService.deliveries(p),
    titleField: 'deliveryNo',
    subtitleField: 'status',
  },
  installations: {
    kind: 'list',
    fetchList: (p) => serviceService.installations(p),
    titleField: 'installationNo',
    subtitleField: 'statusCode',
  },
  machines: {
    kind: 'list',
    fetchList: (p) => inventoryService.customerDevices(p),
    titleField: 'serialNumber',
    subtitleField: 'modelName',
  },
  'service-requests': {
    kind: 'list',
    fetchList: (p) => serviceService.tickets(p),
    titleField: 'ticketNo',
    subtitleField: 'statusCode',
  },
  'service-kanban': {
    kind: 'kanban',
    fetchList: (p) => serviceService.tickets(p),
    titleField: 'ticketNo',
    subtitleField: 'statusCode',
  },
  'service-price-list': { kind: 'pricelist', fetchList: () => productService.listPriceLists(), titleField: 'name' },
  reports: { kind: 'reports', fetchList: async () => reportService.pipelineSummary(), titleField: 'stage' },
  users: { kind: 'admin-list', fetchList: () => adminService.users(), titleField: 'fullName', subtitleField: 'email' },
  roles: { kind: 'admin-list', fetchList: () => adminService.roles(), titleField: 'name', subtitleField: 'code' },
  departments: { kind: 'admin-list', fetchList: () => adminService.departments(), titleField: 'name', subtitleField: 'code' },
  divisions: { kind: 'admin-list', fetchList: () => adminService.divisions(), titleField: 'name', subtitleField: 'code' },
  notifications: {
    kind: 'notifications',
    fetchList: () => notificationService.list({ pageSize: 50 }),
    titleField: 'title',
    subtitleField: 'body',
  },
  'call-assistant': {
    kind: 'call-assistant',
    fetchList: () => callAssistantService.suggestions({ status: 'pending' }),
    titleField: 'title',
    subtitleField: 'body',
  },
  calendar: {
    kind: 'calendar',
    fetchList: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      return toListResult(calendarService.events({ from, to }));
    },
    titleField: 'title',
    subtitleField: 'startsAt',
  },
  chat: { kind: 'chat', fetchList: () => toListResult(chatService.conversations()), titleField: 'title', subtitleField: 'lastMessage' },
  'sales-map': { kind: 'map', fetchList: (p) => companyService.list(p), titleField: 'legalTitle' },
  settings: { kind: 'settings', fetchList: async () => [], titleField: 'label' },
};

async function apiGetProforma(id: string) {
  const res = await documentService.proformas({ page: 1, pageSize: 200 });
  const row = normalizeList(res).find((r) => String(r.id) === id);
  if (row) return row;
  const contracts = await documentService.contracts({ page: 1, pageSize: 200 });
  return normalizeList(contracts).find((r) => String(r.id) === id) ?? { id };
}

function normalizeAccounting(res: unknown): Record<string, unknown>[] {
  if (Array.isArray(res)) return res as Record<string, unknown>[];
  if (res && typeof res === 'object' && 'data' in res) return (res as Paginated<Record<string, unknown>>).data;
  return [];
}

export function getModuleConfig(key: string): ModuleConfig | undefined {
  return MODULE_REGISTRY[key as NavKey];
}

export function fieldText(obj: Record<string, unknown>, path?: string): string {
  if (!path) return '';
  const v = path.includes('.') ? getByPath(obj, path) : obj[path];
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Noktalı yol çözümü — ör. `quote.documentNo`, `status.name`. */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}
