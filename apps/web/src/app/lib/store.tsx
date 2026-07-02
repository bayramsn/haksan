/**
 * StoreProvider — backwards-compatible interface used by all existing pages,
 * but it now talks to the NestJS backend instead of holding mock data.
 *
 * - Initial mount fetches companies / contacts / opportunities / quotes /
 *   inventory / products / service tickets via REST.
 * - DTOs are normalized into the legacy mock types (Customer, SalesCase, etc.)
 *   so pages don't need to change.
 * - Mutations call backend endpoints, then trigger a refetch.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../lib/queryClient';
import {
  companyService,
  contactService,
  opportunityService,
  productService,
  inventoryService,
  quoteService,
  serviceService,
  activityService,
  adminService,
  documentService,
  financeService,
  noteTemplateService,
  fileService,
  type Paginated,
} from '../../lib/services';
import { useAuth } from '../../lib/auth';
import { resolveMediaUrl } from '../../lib/apiClient';
import {
  activityTypeCodeFromLabel,
  STOCK_CATEGORY_LABELS,
  type PipelineStageCode,
  type ProductCreateInput,
  type ProductUpdateInput,
  type StockCategoryCode,
} from '@haksan/shared';
import {
  Customer,
  SalesCase,
  SalesStage,
  Contact,
  Product,
  StockItem,
  Offer,
  ServiceRequest,
  ServiceStage,
  ServiceWarrantyClaim,
  ServiceWarrantyPart,
  Activity,
  FirmType,
  CustomerSalesStatus,
  DocumentItem,
  Machine,
  Payment,
  User,
  Shipment,
  Delivery,
} from './mock';
import { allCatalogProductSpecs, productSpecGroupForKey } from './productSpecTemplates';
import { isServiceQuoteComplete, serviceQuoteMissingFields } from './serviceQuote';

const SERVICE_STAGES: ServiceStage[] = [
  'Request Opened',
  'Diagnosis',
  'Quote Needed',
  'Quote Sent',
  'Approval',
  'Scheduled',
  'Service In Progress',
  'Service Completed',
  'Signed Form',
  'Closed',
];

const persistedServiceStage = (value: unknown): ServiceStage | null =>
  typeof value === 'string' && SERVICE_STAGES.includes(value as ServiceStage) ? value as ServiceStage : null;

const loadAllPaginated = async <T,>(
  fetchPage: (page: number, pageSize: number) => Promise<Paginated<T>>,
  pageSize = 200
): Promise<Paginated<T>> => {
  const first = await fetchPage(1, pageSize);
  const totalPages = Math.max(1, Number(first.meta?.totalPages ?? 1));
  if (totalPages <= 1) return first;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2, pageSize))
  );
  const data = [first, ...rest].flatMap((page) => page.data);
  return {
    data,
    meta: {
      ...first.meta,
      page: 1,
      pageSize: data.length,
      total: first.meta?.total ?? data.length,
      totalPages: 1,
    },
  };
};

// pipeline stage code → UI stage key. Legacy names are still accepted for old mock rows.
const STAGE_BY_CODE: Record<string, SalesStage> = {
  lead: 'lead',
  sales: 'sales',
  call: 'call',
  visit: 'visit',
  cancelled: 'cancelled',
  quote: 'quote',
  proforma: 'proforma',
  contract: 'contract',
  payment_plan: 'payment_plan',
  commercial_invoice: 'commercial_invoice',
  customs_approved: 'customs_approved',
  stock_picking: 'stock_picking',
  shipping: 'shipping',
  installation: 'installation',
  delivered: 'delivered',
};

const CODE_BY_STAGE: Partial<Record<SalesStage, PipelineStageCode>> = {
  lead: 'lead',
  sales: 'sales',
  call: 'call',
  visit: 'visit',
  cancelled: 'cancelled',
  quote: 'quote',
  proforma: 'proforma',
  contract: 'contract',
  payment_plan: 'payment_plan',
  commercial_invoice: 'commercial_invoice',
  customs_approved: 'customs_approved',
  stock_picking: 'stock_picking',
  shipping: 'shipping',
  installation: 'installation',
  delivered: 'delivered',
  Lead: 'lead',
  'Initial Contact': 'sales',
  'Requirement Analysis': 'visit',
  'Offer Preparing': 'quote',
  'Offer Sent': 'quote',
  'Follow-up': 'quote',
  'Offer Approved': 'proforma',
  'Proforma / Contract': 'contract',
  Customs: 'customs_approved',
  Shipment: 'shipping',
  Installation: 'installation',
  Completed: 'delivered',
  Lost: 'cancelled',
};

const cleanString = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text || undefined;
};

const toOptionalNumber = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const DEFAULT_PRODUCT_VAT_RATE = 20;
const normalizeProductVatRate = (value: unknown) => {
  const rate = toOptionalNumber(value);
  return rate === undefined || rate === 1 ? DEFAULT_PRODUCT_VAT_RATE : rate;
};

const toNullableNumber = (value: unknown) => {
  const number = toOptionalNumber(value);
  return number === undefined ? null : number;
};

const toOptionalDate = (value: string | Date | null | undefined) => (value ? new Date(value) : undefined);

const deliveryFormDataPayload = (formData: Delivery['formData'] | undefined) =>
  formData
    ? {
        ...formData,
        kurulumTarihi: toOptionalDate(formData.kurulumTarihi),
      }
    : undefined;

const normalizeWarrantyPart = (part: any): ServiceWarrantyPart => ({
  id: part.id,
  productModelId: part.productModelId ?? null,
  inventoryItemId: part.inventoryItemId ?? null,
  description: part.description ?? '',
  quantity: Number(part.quantity ?? 1),
  actionType: part.actionType ?? 'replace',
  source: part.source ?? 'stock',
  supplierRmaStatus: part.supplierRmaStatus ?? null,
  chargeToCustomer: Boolean(part.chargeToCustomer),
  unitCost: toNullableNumber(part.unitCost),
  currency: (part.currency as 'USD' | 'EUR' | 'TRY') ?? 'USD',
  notes: part.notes ?? null,
  product: part.product ?? null,
  inventory: part.inventory ?? null,
});

const normalizeWarrantyClaim = (claim: any): ServiceWarrantyClaim | null => {
  if (!claim?.id) return null;
  return {
    id: claim.id,
    serviceTicketId: claim.serviceTicketId ?? '',
    companyId: claim.companyId ?? '',
    customerDeviceId: claim.customerDeviceId ?? null,
    warrantyStartSnapshot: claim.warrantyStartSnapshot ?? null,
    warrantyEndSnapshot: claim.warrantyEndSnapshot ?? null,
    status: claim.status ?? 'draft',
    coverageSuggestion: claim.coverageSuggestion ?? 'unknown',
    coverageDecision: claim.coverageDecision ?? 'pending',
    failureCategory: claim.failureCategory ?? null,
    technicianAssessment: claim.technicianAssessment ?? null,
    managerDecisionNote: claim.managerDecisionNote ?? null,
    decidedByUserId: claim.decidedByUserId ?? null,
    decidedAt: claim.decidedAt ?? null,
    rmaNo: claim.rmaNo ?? null,
    supplierName: claim.supplierName ?? null,
    supplierRmaStatus: claim.supplierRmaStatus ?? null,
    costAmount: toNullableNumber(claim.costAmount),
    costCurrency: (claim.costCurrency as 'USD' | 'EUR' | 'TRY') ?? 'USD',
    customerChargeAmount: toNullableNumber(claim.customerChargeAmount),
    customerChargeCurrency: (claim.customerChargeCurrency as 'USD' | 'EUR' | 'TRY') ?? 'USD',
    parts: Array.isArray(claim.parts) ? claim.parts.map(normalizeWarrantyPart) : [],
  };
};

const compactProductCode = (value: string) =>
  value
    .trim()
    .toLocaleUpperCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const productModelCode = (p: Partial<Product>) =>
  cleanString(p.model) ??
  cleanString(p.stockCode) ??
  (compactProductCode(`${p.brand ?? ''} ${p.shortDescription ?? ''}`) || 'URUN');

const productApiPayload = (p: Partial<Product>, brandId?: string): ProductUpdateInput => {
  const modelCode = productModelCode(p);
  const fullName = cleanString(p.shortDescription) ?? [p.brand, modelCode].filter(Boolean).join(' ');
  return {
    ...(brandId ? { brandId } : {}),
    productGroupCode: cleanString(p.productGroupCode),
    categoryCode: cleanString(p.categoryCode),
    subcategoryCode: cleanString(p.subcategoryCode),
    productTypeCode: cleanString(p.productTypeCode),
    compatibleMachineTypeCode: cleanString(p.compatibleMachineTypeCode),
    modelCode,
    modelName: cleanString(p.modelName),
    fullName,
    currencyCode: p.currency,
    listPrice: toOptionalNumber(p.listPrice),
    cashPrice: toOptionalNumber(p.cashPrice),
    vatRate: normalizeProductVatRate(p.vatRate),
    originCountry: cleanString(p.originCountry),
    hsCode: cleanString(p.hsCode),
    stockCode: cleanString(p.stockCode),
    imageUrl: cleanString(p.imageUrl),
    description: cleanString(p.description),
    ...(p.supplierCompanyId !== undefined ? { supplierCompanyId: cleanString(p.supplierCompanyId) ?? null } : {}),
    ...(p.optionalCompatibilityGroupCodes !== undefined ? { optionalCompatibilityGroupCodes: p.optionalCompatibilityGroupCodes ?? [] } : {}),
    ...(p.optionalCompatibilityCategoryCodes !== undefined ? { optionalCompatibilityCategoryCodes: p.optionalCompatibilityCategoryCodes ?? [] } : {}),
    ...(p.optionalCompatibilitySubcategoryCodes !== undefined ? { optionalCompatibilitySubcategoryCodes: p.optionalCompatibilitySubcategoryCodes ?? [] } : {}),
    ...(p.optionalCompatibilityTypeCodes !== undefined ? { optionalCompatibilityTypeCodes: p.optionalCompatibilityTypeCodes ?? [] } : {}),
    ...(p.optionalCompatibilityBrandIds !== undefined ? { optionalCompatibilityBrandIds: p.optionalCompatibilityBrandIds ?? [] } : {}),
    // Boş seçim muadili temizler (null), seçiliyse ilk id eski alanı da besler.
    muadilProductId: p.muadilProductIds?.[0] ?? p.muadilProductId ?? null,
    muadilProductIds: p.muadilProductIds ?? (p.muadilProductId ? [p.muadilProductId] : []),
  };
};

const productDetailsPayload = (p: Partial<Product>) => ({
  specs: allCatalogProductSpecs(p.specs ?? [], '-')
    .filter((s) => cleanString(s.key))
    .map((s, index) => ({
      specGroupCode: productSpecGroupForKey(s).code,
      specKey: s.key.trim(),
      specValue: s.value.trim() || '-',
      sortOrder: index + 1,
    })),
  equipment: [
    ...(p.standardEquipment ?? []).filter(Boolean).map((title, index) => ({
      equipmentTypeCode: 'standart',
      title: title.trim(),
      isPromotion: false,
      sortOrder: index + 1,
    })),
    ...(p.optionalEquipment ?? []).filter(Boolean).map((title, index) => ({
      equipmentTypeCode: 'opsiyonel',
      title: title.trim(),
      isPromotion: false,
      sortOrder: index + 1,
    })),
  ],
});

export type NoteTemplate = { id: string; title: string; body: string; scope: string };

export type QuoteLineCompatibility = {
  machineIds: string[];
  brands: string[];
  controlUnits: string[];
  supplierIds: string[];
  technicalSpecs?: { key: string; value: string }[];
};

export type QuoteLineInput = {
  productModelId?: string;
  stockCode?: string;
  description: string;
  quantity: number;
  unitPrice: number; // NET birim fiyat
  discountAmount: number;
  vatRate: number;
  compatibility?: QuoteLineCompatibility;
};

export type CreateQuotePayload = {
  opportunityId?: string;
  companyId: string;
  contactId?: string;
  quoteDate: string;
  validityDays: number;
  documentNo?: string;
  currencyCode: string;
  headerDiscountAmount?: number;
  headerDiscountPercent?: number;
  projectOwnerUserId?: string;
  notes?: string;
  paymentTermsText?: string;
  deliveryTermsText?: string;
  warrantyTermsText?: string;
  importCostsExcluded?: boolean;
  items: QuoteLineInput[];
  caseTitle?: string;
  /** view_all kullanıcının seçtiği bölüm (CNC/Üniversal/Sac). */
  divisionId?: string;
};

export type InstallationSummary = {
  id: string;
  salesCaseId: string;
  customerId: string;
  statusCode: string;
  statusName: string;
  technician: string;
  scheduledDate: string;
  completedDate: string;
  deviceLabel: string;
  serialNumber: string;
};

type Store = {
  customers: Customer[];
  cases: SalesCase[];
  // Mantıksal olarak kapatılmış (arşiv/geçmiş) satış kartları — teslim+iptal. closedAt dolu.
  closedCases: SalesCase[];
  service: ServiceRequest[];
  offers: Offer[];
  noteTemplates: NoteTemplate[];
  stock: StockItem[];
  products: Product[];
  activities: Activity[];
  contacts: Contact[];
  users: User[];
  machines: Machine[];
  payments: Payment[];
  documents: DocumentItem[];
  shipments: Shipment[];
  deliveries: Delivery[];
  installations: InstallationSummary[];
  loading: boolean;
  loadErrors: string[];
  loadTruncated: string[];
  clearLoadErrors: () => void;
  addContact: (c: Omit<Contact, 'id'>) => Promise<Contact>;
  updateContact: (id: string, patch: Partial<Omit<Contact, 'id'>>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  addActivity: (a: Omit<Activity, 'id' | 'date'> & { date?: string }) => Promise<Activity>;
  updateActivity: (id: string, patch: Partial<Omit<Activity, 'id'>>) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
  addProduct: (p: Omit<Product, 'id' | 'status'> & { status?: 'active' | 'passive' }) => Promise<Product>;
  updateProduct: (id: string, patch: Partial<Omit<Product, 'id'>>) => Promise<void>;
  /**
   * Ürünün yalnızca verilen alanlarını günceller (fiyat, KDV, stok kodu vb.).
   * `updateProduct`'tan farkı: specs/donanımı yeniden yazmaz, bu yüzden
   * satış fiyat listesinden hızlı fiyat düzenlemesi için güvenlidir.
   */
  patchProduct: (id: string, fields: Partial<Omit<Product, 'id'>>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addCustomer: (c: Omit<Customer, 'id' | 'createdAt' | 'status'> & { status?: 'active' | 'passive' }) => Promise<Customer>;
  updateCustomer: (id: string, patch: Partial<Omit<Customer, 'id' | 'createdAt'>>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addCase: (c: Omit<SalesCase, 'id' | 'createdAt' | 'stage' | 'isLost' | 'isOfferPrepared'> & { stage?: SalesStage; divisionId?: string }) => Promise<SalesCase>;
  updateCase: (id: string, patch: { assignedUserId?: string }) => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  addOffer: (o: Omit<Offer, 'id' | 'date' | 'revision'> & { revision?: number }) => Promise<Offer>;
  createQuoteFull: (payload: CreateQuotePayload) => Promise<{ quoteId: string; documentNo: string; opportunityId: string }>;
  addNoteTemplate: (t: { title: string; body: string; scope?: string }) => Promise<NoteTemplate>;
  updateNoteTemplate: (id: string, patch: { title?: string; body?: string; scope?: string }) => Promise<NoteTemplate>;
  deleteNoteTemplate: (id: string) => Promise<void>;
  addStock: (s: Omit<StockItem, 'id'>) => Promise<StockItem>;
  updateStockStatus: (id: string, status: StockItem['status']) => Promise<void>;
  reserveStock: (id: string, companyId: string, notes?: string) => Promise<void>;
  addShipment: (s: Omit<Shipment, 'id'>) => Promise<Shipment>;
  startShipment: (id: string, loadingDate?: string) => Promise<void>;
  updateShipmentStatus: (
    id: string,
    status: Shipment['status'],
    options?: { destinationWarehouseId?: string; loadingDate?: string; arrivedAt?: string },
  ) => Promise<void>;
  addDelivery: (d: Omit<Delivery, 'id'>) => Promise<Delivery>;
  updateDelivery: (id: string, d: Partial<Omit<Delivery, 'id'>>) => Promise<void>;
  updateDeliveryStatus: (id: string, status: Delivery['status']) => Promise<void>;
  moveCase: (id: string, to: SalesStage, options?: { inventoryItemIds?: string[]; changeReason?: string }) => Promise<void>;
  // Mantıksal kapanış (Bitir) ve geri alma (Geri Aç) — silmez, closedAt set/sıfırlar.
  closeCase: (id: string, reason?: string) => Promise<void>;
  reopenCase: (id: string) => Promise<void>;
  markCaseLost: (
    id: string,
    payload: { reasonCode: string; competitorId?: string; competitorProductModel?: string }
  ) => Promise<void>;
  moveService: (id: string, to: ServiceStage) => Promise<void>;
  updateService: (id: string, patch: Partial<ServiceRequest>) => Promise<void>;
  loadServiceWarranty: (id: string) => Promise<ServiceWarrantyClaim | null>;
  updateServiceWarranty: (id: string, patch: Partial<ServiceWarrantyClaim>) => Promise<ServiceWarrantyClaim | null>;
  updateServiceWarrantyParts: (id: string, parts: ServiceWarrantyPart[]) => Promise<ServiceWarrantyClaim | null>;
  submitServiceWarranty: (id: string, note?: string) => Promise<ServiceWarrantyClaim | null>;
  approveServiceWarranty: (id: string, decisionNote?: string) => Promise<ServiceWarrantyClaim | null>;
  rejectServiceWarranty: (id: string, decisionNote?: string) => Promise<ServiceWarrantyClaim | null>;
  addService: (s: Omit<ServiceRequest, 'id' | 'createdAt' | 'stage'> & { stage?: ServiceStage; createdAt?: string }) => Promise<ServiceRequest>;
  addMachine: (m: Omit<Machine, 'id' | 'status'> & { status?: Machine['status'] }) => Promise<Machine>;
  updateMachineCustomer: (id: string, customerId: string) => Promise<void>;
  addDocument: (
    d: Omit<DocumentItem, 'id' | 'uploadedAt' | 'uploadedBy'> &
      Partial<Pick<DocumentItem, 'id' | 'uploadedAt' | 'uploadedBy'>>
  ) => Promise<DocumentItem>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

function StoreInner({ children }: { children: ReactNode }) {
  const { authed, sessionReady, user, activeDivision } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loadTruncated, setLoadTruncated] = useState<string[]>([]);
  const clearLoadErrors = useCallback(() => setLoadErrors([]), []);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cases, setCases] = useState<SalesCase[]>([]);
  const [closedCases, setClosedCases] = useState<SalesCase[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [noteTemplates, setNoteTemplates] = useState<NoteTemplate[]>([]);
  const [service, setService] = useState<ServiceRequest[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [installations, setInstallations] = useState<InstallationSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const shipmentStatusFromCode = (code?: string | null): Shipment['status'] => {
    if (code === 'delivered') return 'Teslim Edildi';
    if (code === 'at_customs' || code === 'cleared') return 'Gümrükte';
    if (code === 'in_transit') return 'Yolda';
    return 'Hazırlanıyor';
  };

  const shipmentStatusToCode = (status: Shipment['status']) => {
    if (status === 'Teslim Edildi') return 'delivered';
    if (status === 'Gümrükte') return 'at_customs';
    if (status === 'Yolda') return 'in_transit';
    return 'preparing';
  };

  const deliveryStatusFromCode = (status?: string | null): Delivery['status'] =>
    status === 'completed' ? 'Tamamlandı' : 'Bekliyor';

  const deliveryStatusToCode = (status: Delivery['status']): 'pending' | 'completed' =>
    status === 'Tamamlandı' ? 'completed' : 'pending';

  const fetchAll = useCallback(async () => {
    if (!sessionReady || !authed) {
      setLoading(false);
      setLoadErrors([]);
      setLoadTruncated([]);
      return;
    }
    setLoading(true);
    const errors: string[] = [];
    const truncated: string[] = [];
    // Kullanıcının okuma yetkisi olmayan kaynakları hiç çağırma; aksi halde 403
    // hataları "Bazı veriler yüklenemedi" banner'ını gereksiz yere doldurur.
    const userPerms = new Set(user?.permissions ?? []);
    const can = (permission?: string) => !permission || userPerms.has(permission);
    const load = async <T,>(label: string, fn: () => Promise<T>, fallback: T, permission?: string): Promise<T> => {
      if (!can(permission)) return fallback;
      try {
        const result = await fn();
        const meta = (result as { meta?: { total?: number; pageSize?: number } })?.meta;
        if (meta && typeof meta.total === 'number' && typeof meta.pageSize === 'number' && meta.total > meta.pageSize) {
          truncated.push(`${label} (${meta.total})`);
        }
        return result;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'yüklenemedi';
        errors.push(`${label}: ${msg}`);
        return fallback;
      }
    };
    try {
      const empty = { data: [] as any[], meta: { total: 0, page: 1, pageSize: 0, totalPages: 0 } };
      const [companies, contactsR, opps, prods, inv, qts, svcTickets, acts, usersR, devicesR, receivablesR, paymentsR, proformasR, contractsR, invoicesR, noteTemplatesR, shipmentsR, deliveriesR, installationsR, fileLinksR] = await Promise.all([
        load('Firmalar', () => loadAllPaginated((page, pageSize) => companyService.list({ page, pageSize })), empty, 'companies.read'),
        load('Kontaklar', () => contactService.list({ pageSize: 200 }), empty, 'contacts.read'),
        load('Satış kartları', () => opportunityService.list({ pageSize: 200 }), empty, 'opportunities.read'),
        load('Ürünler', () => loadAllPaginated((page, pageSize) => productService.list({ page, pageSize })), empty, 'products.read'),
        load('Stok', () => inventoryService.list({ pageSize: 200 }), empty, 'inventory.read'),
        load('Teklifler', () => quoteService.list({ pageSize: 200 }), empty, 'quotes.read'),
        load('Servis', () => serviceService.tickets({ pageSize: 200 }), empty, 'service_tickets.read'),
        load('Aktiviteler', () => activityService.list({ pageSize: 200 }), empty, 'activities.read'),
        load('Kullanıcılar', () => adminService.users(), [] as any[], 'users.read'),
        load('Makineler', () => inventoryService.customerDevices({ pageSize: 200 }), empty, 'customer_devices.read'),
        load('Alacaklar', () => financeService.receivables({ pageSize: 200 }), empty, 'receivables.read'),
        load('Ödemeler', () => financeService.payments({ pageSize: 200 }), empty, 'payments.read'),
        load('Proformalar', () => documentService.proformas({ pageSize: 200 }), empty, 'proformas.read'),
        load('Sözleşmeler', () => documentService.contracts({ pageSize: 200 }), empty, 'contracts.read'),
        load('Faturalar', () => documentService.commercialInvoices({ pageSize: 200 }), empty, 'commercial_invoices.read'),
        load('Not şablonları', () => noteTemplateService.list(), [] as any[]),
        load('Sevkiyatlar', () => serviceService.shipments({ pageSize: 200 }), empty, 'shipments.read'),
        load('Teslimatlar', () => serviceService.deliveries({ pageSize: 200 }), empty, 'shipments.read'),
        load('Kurulumlar', () => serviceService.installations({ pageSize: 200 }), empty, 'installations.read'),
        load('Dosya bağlantıları', () => fileService.links({ pageSize: 200 }), empty, 'files.read'),
      ]);
      // Kapatılan (arşiv/geçmiş) kartlar ayrı çekilir; aktif liste varsayılan view=active döner.
      const closedOpps = await load(
        'Geçmiş kartlar',
        () => opportunityService.list({ pageSize: 200, view: 'closed' }),
        empty,
        'opportunities.read'
      );
      setLoadErrors(errors);
      setLoadTruncated(truncated);

      setNoteTemplates(
        (Array.isArray(noteTemplatesR) ? noteTemplatesR : []).map((n: any) => ({
          id: n.id,
          title: n.title ?? '',
          body: n.body ?? '',
          scope: n.scope ?? 'quote',
        }))
      );

      const userRows = Array.isArray(usersR) ? usersR : [];
      setUsers(
        userRows.map((u: any) => ({
          id: u.id,
          name: u.fullName ?? u.name ?? u.email ?? '—',
          email: u.email ?? '',
          role: ((u.roles?.[0]?.name ?? u.roles?.[0]?.code ?? 'Admin') as User['role']) || 'Admin',
          roleCodes: (u.roles ?? []).map((role: any) => role.code).filter(Boolean),
          roleNames: (u.roles ?? []).map((role: any) => role.name ?? role.code).filter(Boolean),
          department: u.department?.name ?? '',
          active: u.status !== 'passive',
          avatarUrl: u.avatarUrl ?? u.photoUrl ?? undefined,
          purchaseApprovalLimit: u.purchaseApprovalLimit ? Number(u.purchaseApprovalLimit) : undefined,
          managerId: u.managerId ?? undefined,
        }))
      );

      setCustomers(
        companies.data.map((c: any) => ({
          id: c.id,
          type: (c.companyType === 'person' ? 'person' : 'company') as 'person' | 'company',
          firmType: ((c.relationType?.code as FirmType) ?? 'customer') as FirmType,
          salesStatus: ((c.customerStatus?.code === 'active' ? 'active_customer' : 'potential') as CustomerSalesStatus),
          companyGroupCode: c.companyGroup?.code ?? '',
          companyGroupName: c.companyGroup?.name ?? '',
          contactSourceCode: c.contactSource?.code ?? '',
          sector: c.sector ?? '',
          name: c.legalTitle ?? c.shortName ?? '—',
          contactPerson: '',
          phone: c.primaryPhone ?? '',
          phone2: c.secondaryPhone ?? '',
          fax: c.fax ?? '',
          email: c.primaryEmail ?? '',
          email2: c.secondaryEmail ?? '',
          city: c.primaryAddress?.province ?? '',
          district: c.primaryAddress?.district ?? '',
          country: c.primaryAddress?.country ?? '',
          address: c.primaryAddress?.fullAddress ?? '',
          latitude: c.primaryAddress?.latitude != null ? Number(c.primaryAddress.latitude) : undefined,
          longitude: c.primaryAddress?.longitude != null ? Number(c.primaryAddress.longitude) : undefined,
          locationSource: c.primaryAddress?.locationSource ?? undefined,
          taxOffice: c.taxOffice ?? '',
          taxNumber: c.taxNumber ?? '',
          website: c.website ?? '',
          wantedProduct: '',
          initialNote: c.notes ?? '',
          source: c.contactSource?.name ?? '',
          status: 'active',
          createdAt: (c.createdAt as string)?.slice(0, 10) ?? '',
        }))
      );

      setContacts(
        contactsR.data.map((k: any) => {
          const companyIds = Array.from(new Set([
            k.companyId,
            k.company?.id,
            ...(Array.isArray(k.companyLinks) ? k.companyLinks.map((company: any) => company.id ?? company.companyId) : []),
          ].filter(Boolean)));
          return {
            id: k.id,
            customerId: k.companyId ?? companyIds[0] ?? '',
            companyIds,
            name: k.fullName ?? '',
            title: k.title ?? '',
            department: k.department ?? '',
            phone: k.workPhone ?? k.mobilePhone ?? '',
            phoneExtension: k.phoneExtension ?? '',
            mobilePhone: k.mobilePhone ?? '',
            otherPhone: k.otherPhone ?? '',
            email: k.workEmail ?? k.personalEmail ?? k.otherEmail ?? '',
            personalEmail: k.personalEmail ?? '',
            otherEmail: k.otherEmail ?? '',
            gender: k.gender ?? '',
            birthDate: (k.birthDate as string | undefined)?.slice(0, 10) ?? '',
            decisionRoleCode: k.decisionRole?.code ?? '',
            decisionRoleName: k.decisionRole?.name ?? '',
            hometown: k.hometown ?? '',
            favoriteTeam: k.favoriteTeam ?? '',
            knownIllness: k.knownIllness ?? '',
            favoriteColor: k.favoriteColor ?? '',
            graduatedSchool: k.graduatedSchool ?? '',
            politicalView: k.politicalView ?? '',
            isPrimary: !!k.isPrimary || (Array.isArray(k.companyLinks) && k.companyLinks.some((company: any) => company.id === (k.companyId ?? companyIds[0]) && company.isPrimary)),
            note: k.notes ?? '',
            isBlacklisted: !!k.isBlacklisted,
            blacklistReason: k.blacklistReason ?? '',
          };
        })
      );

      const mapCase = (o: any): SalesCase =>
        ({
          id: o.id,
          customerId: o.companyId,
          assignedUserId: o.ownerUserId ?? '',
          department: '',
          requestedProduct: o.title ?? '',
          requestedModel: o.title ?? '',
          quantity: 1,
          estimatedAmount: Number(o.estimatedValue ?? 0),
          currency: (o.currency?.code as 'USD' | 'EUR' | 'TRY') ?? 'USD',
          stage: STAGE_BY_CODE[o.stage?.code ?? ''] ?? 'lead',
          isOfferPrepared: qts.data.some((q: any) => q.opportunityId === o.id),
          isLost: (o.stage?.code ?? '') === 'cancelled',
          createdAt: (o.createdAt as string)?.slice(0, 10) ?? '',
          closedAt: o.closedAt ? (o.closedAt as string).slice(0, 10) : undefined,
        }) as SalesCase;
      setCases(opps.data.map(mapCase));
      setClosedCases(closedOpps.data.map(mapCase));

      const apiProducts = prods.data.map((p: any) => ({
          id: p.id,
          brand: p.brand?.name ?? '',
          productGroup: p.productGroup?.name ?? '',
          productGroupCode: p.productGroup?.code ?? '',
          model: p.modelCode ?? '',
          modelName: p.modelName ?? '',
          type: p.productType?.name ?? '',
          productTypeCode: p.productType?.code ?? '',
          compatibleMachineTypeCode: p.compatibleMachineType?.code ?? undefined,
          controlPanel: p.modelName ?? '',
          category: p.category?.name ?? '',
          categoryCode: p.category?.code ?? '',
          subcategory: p.subcategory?.name ?? '',
          subcategoryCode: p.subcategory?.code ?? '',
          imageUrl: resolveMediaUrl(p.imageUrl),
          shortDescription: p.fullName ?? '',
          description: p.description ?? '',
          listPrice: Number(p.listPrice ?? 0),
          cashPrice: p.cashPrice === null || p.cashPrice === undefined ? undefined : Number(p.cashPrice),
          currency: (p.currency?.code as 'USD' | 'EUR' | 'TRY') ?? 'USD',
          vatRate: normalizeProductVatRate(p.vatRate),
          originCountry: p.originCountry ?? '',
          hsCode: p.hsCode ?? '',
          stockCode: p.stockCode ?? '',
          supplierCompanyId: p.supplierCompanyId ?? null,
          optionalCompatibilityGroupCodes: p.optionalCompatibilityGroupCodes ?? [],
          optionalCompatibilityCategoryCodes: p.optionalCompatibilityCategoryCodes ?? [],
          optionalCompatibilitySubcategoryCodes: p.optionalCompatibilitySubcategoryCodes ?? [],
          optionalCompatibilityTypeCodes: p.optionalCompatibilityTypeCodes ?? [],
          optionalCompatibilityBrandIds: p.optionalCompatibilityBrandIds ?? [],
          specs: (p.specs ?? []).map((s: any) => ({
            key: s.key ?? s.specKey ?? '',
            value: s.unit ? `${s.value ?? s.specValue ?? ''} ${s.unit}` : s.value ?? s.specValue ?? '',
            groupCode: s.groupCode ?? s.specGroupCode ?? '',
            groupName: s.groupName ?? s.group ?? '',
          })).filter((s: any) => s.key && s.value),
          standardEquipment: p.standardEquipment ?? [],
          optionalEquipment: p.optionalEquipment ?? [],
          muadilProductId: p.muadilProductId ?? undefined,
          muadilProductIds: p.muadilProductIds ?? (p.muadilProductId ? [p.muadilProductId] : []),
          muadilProducts: (p.muadilProducts ?? []).map((alt: any) => ({
            id: alt.id,
            brand: alt.brand?.name ?? '',
            model: alt.modelCode ?? '',
            shortDescription: alt.fullName ?? '',
            category: alt.category?.name ?? '',
            categoryCode: alt.category?.code ?? '',
            type: alt.productType?.name ?? '',
            listPrice: alt.listPrice == null ? undefined : Number(alt.listPrice),
            currency: (alt.currency?.code as 'USD' | 'EUR' | 'TRY') ?? 'USD',
          })),
          status: (p.isActive ? 'active' : 'passive') as Product['status'],
        }));
      // Products (incl. the imported Haksan CNC catalogue) come from the DB API.
      // Blobs are served by the auth-gated public media endpoint, not bundled.
      setProducts(apiProducts);

      setStock(
        inv.data.map((s: any) => {
          const categoryCode = (s.category?.code as StockCategoryCode | undefined) ?? 'TEZGAH';
          return {
            id: s.id,
            brand: s.brand?.name ?? '',
            productId: s.product?.id ?? s.productModelId ?? undefined,
            counterType: s.product?.fullName ?? '',
            counterModel: s.product?.modelCode ?? '',
            serialNumber: s.serialNumber ?? '',
            controlPanel: s.controlUnit ?? '',
            stockCode: s.product?.modelCode ?? '',
            warehouse: s.warehouse?.name ?? '',
            categoryCode,
            category: s.category?.name ?? STOCK_CATEGORY_LABELS[categoryCode],
            reservedCompanyId: s.reservedCompany?.id ?? s.reservedCompanyId ?? undefined,
            reservedCompanyName: s.reservedCompany?.shortName ?? s.reservedCompany?.legalTitle ?? undefined,
            parentInventoryItemId: s.parentInventoryItemId ?? null,
            loadingDate: (s.loadingDate as string | undefined)?.slice(0, 10) ?? undefined,
            arrivalDate: (s.arrivalDate as string | undefined)?.slice(0, 10) ?? undefined,
            locationStatus: s.locationStatus?.code ?? s.locationStatusCode ?? undefined,
            status:
              s.status?.code === 'available'
                ? 'Available'
                : s.status?.code === 'reserved'
                  ? 'Reserved'
                  : s.status?.code === 'in_transit'
                    ? 'InTransit'
                    : s.status?.code === 'sold'
                      ? 'Sold'
                      : 'Inactive',
          };
        })
      );

      setOffers(
        qts.data.map((q: any) => ({
          id: q.id,
          salesCaseId: q.opportunityId ?? '',
          companyId: q.companyId ?? '',
          quoteNo: q.documentNo,
          revision: Number(q.revisionNo ?? 1),
          date: (q.quoteDate as string)?.slice(0, 10) ?? '',
          validityDays: q.validityDays === null || q.validityDays === undefined ? undefined : Number(q.validityDays),
          amount: Number(q.grandTotal ?? 0),
          subtotal: q.subtotal === null || q.subtotal === undefined ? undefined : Number(q.subtotal),
          vatTotal: q.vatAmount === null || q.vatAmount === undefined ? undefined : Number(q.vatAmount),
          currency: (q.currency?.code as 'USD' | 'EUR' | 'TRY') ?? 'USD',
          priceApprovalStatus: q.priceApprovalStatus ?? 'not_required',
          status:
            q.priceApprovalStatus === 'pending' || q.status?.code === 'pending_super_admin_approval'
              ? 'Pending Approval'
              : q.status?.code === 'approved'
              ? 'Approved'
              : q.status?.code === 'sent'
                ? 'Sent'
                : q.status?.code === 'rejected'
                  ? 'Rejected'
                  : 'Draft',
          note: q.notes ?? '',
        }))
      );

      setService(
        (svcTickets.data ?? []).map((t: any) => {
          const meta = (t.metadata ?? {}) as Record<string, any>;
          const reportedAt = ((t.reportedAt as string)?.slice(0, 16).replace('T', ' ') ?? '');
          const baseActivity = [
            {
              id: `${t.id}-created`,
              text: 'Servis talebi açıldı.',
              createdAt: reportedAt,
              byUserId: t.assignedToUserId ?? undefined,
            },
            ...(t.resolvedAt
              ? [{
                  id: `${t.id}-resolved`,
                  text: t.status?.code === 'closed' ? 'Servis kapatıldı.' : 'Servis çözümlendi.',
                  createdAt: ((t.resolvedAt as string)?.slice(0, 16).replace('T', ' ') ?? ''),
                  byUserId: t.assignedToUserId ?? undefined,
                }]
              : []),
          ];
          return {
            id: t.id,
            ticketNo: t.ticketNo ?? undefined,
            customerId: t.companyId,
            contactId: t.contactId ?? undefined,
            assignedUserId: t.assignedToUserId ?? '',
            stage: persistedServiceStage(meta.serviceStage) ?? (
              t.status?.code === 'closed'
                ? 'Closed'
                : t.status?.code === 'resolved'
                  ? 'Service Completed'
                  : t.status?.code === 'in_progress'
                    ? 'Diagnosis'
                    : 'Request Opened' as ServiceStage
            ),
            machineId: t.customerDeviceId ?? '',
            serialNumber: '',
            issueType: t.subject ?? '',
            ticketType: t.ticketType ?? 'complaint',
            source: t.source ?? 'manual',
            priority: (t.severity as any) ?? 'normal',
            description: t.description ?? '',
            diagnosisNote: t.description ?? '',
            quoteRequired: Boolean(meta.quoteRequired),
            serviceNote: t.resolutionNote ?? '',
            complaints: Array.isArray(meta.complaints) && meta.complaints.length
              ? meta.complaints
              : t.description
                ? [{ id: `${t.id}-complaint`, text: t.description, createdAt: reportedAt, byUserId: t.assignedToUserId ?? undefined }]
                : [],
            noteHistory: Array.isArray(meta.noteHistory) && meta.noteHistory.length
              ? meta.noteHistory
              : t.resolutionNote
                ? [{ id: `${t.id}-note`, text: t.resolutionNote, createdAt: reportedAt, byUserId: t.assignedToUserId ?? undefined }]
                : [],
            activityHistory: Array.isArray(meta.activityHistory) && meta.activityHistory.length
              ? meta.activityHistory
              : baseActivity,
            operations: Array.isArray(meta.operations) ? meta.operations : [],
            timerStatus: meta.timerStatus ?? 'idle',
            timerStartedAt: meta.timerStartedAt ?? undefined,
            timerElapsedSeconds: Number(meta.timerElapsedSeconds ?? 0),
            serviceHourlyRate: Number(meta.serviceHourlyRate ?? 120),
            serviceCurrency: (meta.serviceCurrency as 'USD' | 'EUR' | 'TRY') ?? 'USD',
            serviceQuote: meta.serviceQuote && typeof meta.serviceQuote === 'object' ? meta.serviceQuote : null,
            completionForm: meta.completionForm && typeof meta.completionForm === 'object' ? meta.completionForm : null,
            warrantyClaim: normalizeWarrantyClaim(t.warrantyClaim),
            sourceComplaint: t.sourceComplaint ?? null,
            createdAt: (t.reportedAt as string)?.slice(0, 10) ?? '',
            closedAt: t.resolvedAt ? (t.resolvedAt as string).slice(0, 10) : undefined,
          };
        })
      );

      setActivities(
        (acts.data ?? []).map((a: any) => ({
          id: a.id,
          salesCaseId: a.opportunityId ?? '',
          customerId: a.companyId ?? '',
          type: a.type?.name ?? '',
          title: a.subject ?? '',
          note: a.description ?? '',
          result: a.result ?? '',
          date: (a.activityDate as string)?.slice(0, 10) ?? '',
          byUserId: a.createdBy ?? '',
          createdByName: a.createdByUser?.fullName ?? a.createdByUser?.email ?? '',
          files: Array.isArray(a.files) ? a.files : [],
        }))
      );

      setMachines(
        (devicesR.data ?? []).map((d: any) => ({
          id: d.id,
          initialCustomerId: d.initialCompanyId ?? d.companyId ?? '',
          userCompanyId: d.companyId ?? '',
          customerId: d.companyId ?? '',
          salesCaseId: d.opportunityId ?? '',
          stockItemId: d.inventoryItemId ?? '',
          serialNumber: d.serialNumber ?? d.inventorySerialNumber ?? d.inventoryItemId?.slice(0, 8) ?? '—',
          model: d.model ?? d.productModelName ?? d.inventoryItemId?.slice(0, 8) ?? '—',
          brand: d.brandName ?? '',
          type: d.productTypeName ?? '',
          controlUnit: d.controlUnit ?? '',
          controlUnitSerial: d.controlUnitSerialNumber ?? '',
          productModelId: d.productModelId ?? '',
          technicalSpecs: Array.isArray(d.technicalSpecs)
            ? d.technicalSpecs.map((spec: any) => ({
                key: String(spec.key ?? ''),
                value: [spec.value, spec.unit].filter(Boolean).join(' '),
              }))
            : [],
          deliveryDate: (d.deliveryDate as string)?.slice(0, 10) ?? '',
          installationDate: (d.installationDate as string)?.slice(0, 10) ?? '',
          warrantyStart: (d.warrantyStartDate as string)?.slice(0, 10) ?? '',
          warrantyEnd: (d.warrantyEndDate as string)?.slice(0, 10) ?? '',
          status:
            d.status?.code === 'expired'
              ? 'Out of Warranty'
              : d.status?.code === 'void'
                ? 'Decommissioned'
                : 'Active',
        }))
      );

      const mapStatus = (code?: string): Payment['status'] =>
        code === 'paid' ? 'Paid' : code === 'overdue' ? 'Overdue' : code === 'cancelled' ? 'Cancelled' : code === 'partial' ? 'Pending' : 'Pending';
      const mapCurrency = (code?: string): Payment['currency'] =>
        code === 'EUR' ? 'EUR' : code === 'TRY' ? 'TRY' : 'USD';
      // quote → opportunity (satış kartı) eşlemesi: alacaklar tekliflerine,
      // teklifler de fırsatlara bağlı olduğu için tahsilatlar doğru satış
      // kartının "Ödemeler" sekmesinde görünebilsin.
      const quoteOpportunity = new Map<string, string>(
        qts.data.map((q: any) => [q.id, q.opportunityId ?? ''])
      );
      // Alacaklar (receivables) → daima GİREN (alınan / beklenen tahsilat).
      const receivablePayments: Payment[] = (receivablesR.data ?? []).map((r: any) => ({
        id: r.id,
        salesCaseId: r.quoteId ? quoteOpportunity.get(r.quoteId) ?? '' : '',
        customerId: r.companyId ?? '',
        paymentType: 'expected',
        direction: 'in',
        amount: Number(r.amount ?? 0),
        currency: mapCurrency(r.currency?.code),
        dueDate: (r.dueDate as string)?.slice(0, 10) ?? '',
        status: mapStatus(r.status?.code),
        note: r.notes ?? '',
        invoiceNo: r.invoiceNo ?? undefined,
        source: 'receivable',
      }));
      // Ödemeler (payments) → kasa yönü backend'deki `direction` alanından gelir
      // ('in' = tahsilat, 'out' = tedarikçi/gider ödemesi).
      const completedPayments: Payment[] = (paymentsR.data ?? []).map((p: any) => ({
        id: p.id,
        salesCaseId: p.receivableId ?? '',
        customerId: p.companyId ?? '',
        paymentType: p.direction === 'out' ? 'expected' : 'received',
        direction: p.direction === 'out' ? 'out' : 'in',
        amount: Number(p.amount ?? 0),
        currency: mapCurrency(p.currency?.code),
        dueDate: (p.paymentDate as string)?.slice(0, 10) ?? '',
        paidDate: p.status?.code === 'paid' ? (p.paymentDate as string)?.slice(0, 10) ?? '' : undefined,
        status: mapStatus(p.status?.code),
        note: p.notes ?? p.paymentMethod ?? '',
        invoiceNo: p.invoiceNo ?? undefined,
        paymentMethod: p.paymentMethod ?? 'bank_transfer',
        source: 'payment',
      }));
      setPayments([...receivablePayments, ...completedPayments]);

      // quote → company, so documents (proforma/contract/invoice) can be tied
      // to a firm directly even when the quote has no opportunity.
      const quoteCompany = new Map<string, string>(
        qts.data.map((q: any) => [q.id, q.companyId ?? ''])
      );
      const docCompanyId = (d: any) =>
        d.quote?.companyId ?? d.companyId ?? quoteCompany.get(d.quoteId) ?? '';

      const mapLinkDocType = (code?: string): DocumentItem['type'] => {
        if (code === 'proforma_pdf') return 'Proforma';
        if (code === 'contract_pdf') return 'Contract';
        if (code === 'commercial_invoice_pdf') return 'CommercialInvoice';
        if (code === 'service_document') return 'DeliveryForm';
        return 'Other';
      };
      const formatDocSize = (bytes?: number) => {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      };

      const docRows: DocumentItem[] = [
        ...(proformasR.data ?? []).map((d: any) => ({
          id: d.id,
          salesCaseId: d.quote?.opportunityId ?? '',
          quoteId: d.quoteId ?? d.quote?.id ?? undefined,
          companyId: docCompanyId(d),
          type: 'Proforma' as const,
          fileName: d.documentNo ?? 'Proforma',
          uploadedBy: d.createdBy ?? '',
          uploadedAt: (d.issueDate as string)?.slice(0, 10) ?? '',
          size: d.fileId ? 'Dosya bağlı' : 'Kayıt',
          fileId: d.fileId ?? undefined,
        })),
        ...(contractsR.data ?? []).map((d: any) => ({
          id: d.id,
          salesCaseId: d.quote?.opportunityId ?? '',
          companyId: docCompanyId(d),
          type: 'Contract' as const,
          fileName: d.contractNo ?? 'Sözleşme',
          uploadedBy: d.createdBy ?? '',
          uploadedAt: (d.signedDate as string)?.slice(0, 10) ?? (d.createdAt as string)?.slice(0, 10) ?? '',
          size: d.fileId ? 'Dosya bağlı' : 'Kayıt',
          fileId: d.fileId ?? undefined,
        })),
        ...(invoicesR.data ?? []).map((d: any) => ({
          id: d.id,
          salesCaseId: d.quote?.opportunityId ?? '',
          companyId: docCompanyId(d),
          type: 'CommercialInvoice' as const,
          fileName: d.invoiceNo ?? 'Ticari Fatura',
          uploadedBy: d.createdBy ?? '',
          uploadedAt: (d.invoiceDate as string)?.slice(0, 10) ?? '',
          size: d.fileId ? 'Dosya bağlı' : 'Kayıt',
          fileId: d.fileId ?? undefined,
        })),
        ...(deliveriesR.data ?? []).map((d: any) => ({
          id: `delivery-form-${d.id}`,
          salesCaseId: d.opportunityId ?? '',
          companyId: d.companyId ?? '',
          deliveryId: d.id,
          type: 'DeliveryForm' as const,
          fileName: d.formData?.formNo ?? `Teslim Formu ${String(d.id ?? '').slice(0, 8).toUpperCase()}`,
          uploadedBy: '',
          uploadedAt: (d.deliveryDate as string)?.slice(0, 10) ?? (d.createdAt as string)?.slice(0, 10) ?? '',
          size: 'Canlı form',
        })),
        ...(installationsR.data ?? []).map((d: any) => ({
          id: `installation-form-${d.id}`,
          salesCaseId: d.opportunityId ?? '',
          companyId: d.companyId ?? '',
          installationId: d.id,
          installationData: d,
          type: 'InstallationForm' as const,
          fileName: d.formData?.formNo ?? `Kurulum Formu ${String(d.id ?? '').slice(0, 8).toUpperCase()}`,
          uploadedBy: d.assignedTo?.id ?? d.assignedToUserId ?? '',
          uploadedAt: (d.completedAt as string)?.slice(0, 10) ?? (d.scheduledDate as string)?.slice(0, 10) ?? (d.createdAt as string)?.slice(0, 10) ?? '',
          size: 'Canlı form',
        })),
        ...(fileLinksR.data ?? []).map((row: any) => ({
          id: row.id ?? row.file?.id,
          salesCaseId: row.entityType === 'opportunity' ? row.entityId : '',
          companyId: row.entityType === 'company' ? row.entityId : '',
          serviceRequestId: row.entityType === 'service_ticket' || row.entityType === 'service_request' ? row.entityId : undefined,
          type: mapLinkDocType(row.documentType?.code),
          fileName: row.file?.originalFilename ?? row.description ?? 'Dosya',
          uploadedBy: row.file?.uploadedBy ?? '',
          uploadedAt: (row.file?.createdAt as string)?.slice(0, 10) ?? '',
          size: formatDocSize(row.file?.sizeBytes),
          fileId: row.file?.id ?? row.fileId,
          mimeType: row.file?.mimeType,
        })),
      ];
      const seenFileIds = new Set<string>();
      const dedupedDocs = docRows.filter((d) => {
        if (!d.fileId) return true;
        if (seenFileIds.has(d.fileId)) return false;
        seenFileIds.add(d.fileId);
        return true;
      });
      setDocuments(dedupedDocs);

      setInstallations(
        (installationsR.data ?? []).map((i: any) => {
          const device = i.customerDevice ?? {};
          const deviceLabel =
            [device.brandName, device.model ?? device.productModelName].filter(Boolean).join(' ') ||
            device.productModelName ||
            'Cihaz seçilmedi';
          return {
            id: i.id,
            salesCaseId: i.opportunityId ?? '',
            customerId: i.companyId ?? '',
            statusCode: i.status?.code ?? '',
            statusName: i.status?.name ?? i.status?.code ?? 'Planlandı',
            technician: i.assignedTo?.fullName ?? 'Atanmadı',
            scheduledDate: (i.scheduledDate as string | undefined)?.slice(0, 10) ?? '',
            completedDate: (i.completedAt as string | undefined)?.slice(0, 10) ?? '',
            deviceLabel,
            serialNumber: device.serialNumber ?? '',
          };
        })
      );

      setShipments(
        (shipmentsR.data ?? []).map((s: any) => ({
          id: s.id,
          salesCaseId: s.opportunityId ?? '',
          senderCompanyId: s.senderCompanyId ?? undefined,
          senderCompanyName: s.senderCompany?.shortName ?? s.senderCompany?.legalTitle ?? undefined,
          senderName: s.senderName ?? undefined,
          carrierCompanyId: s.carrierCompanyId ?? undefined,
          carrierCompanyName: s.carrierCompany?.shortName ?? s.carrierCompany?.legalTitle ?? undefined,
          transportMode: s.transportMode ?? undefined,
          productCategoryCode: s.productCategoryCode ?? undefined,
          destinationWarehouseId: s.destinationWarehouseId ?? undefined,
          destinationWarehouseName: s.destinationWarehouse?.name ?? undefined,
          loadingDate: (s.loadingDate as string | undefined)?.slice(0, 10) ?? undefined,
          trackingNo: s.trackingNo ?? s.shipmentNo ?? s.id?.slice(0, 8) ?? '—',
          carrier: s.carrierCompany?.shortName ?? s.carrierCompany?.legalTitle ?? s.carrier ?? '—',
          origin: s.origin ?? '',
          destination: s.destination ?? '',
          status: shipmentStatusFromCode(s.status?.code),
          eta: (s.eta as string | undefined)?.slice(0, 10) ?? (s.arrivedAt as string | undefined)?.slice(0, 10) ?? '',
          items: (s.items ?? []).map((item: any) => ({
            id: item.id,
            productModelId: item.productModelId ?? undefined,
            inventoryItemId: item.inventoryItemId ?? undefined,
            description: item.description ?? '',
            serialNumber: item.serialNumber ?? undefined,
            quantity: item.quantity == null ? undefined : Number(item.quantity),
            packageCount: item.packageCount == null ? undefined : Number(item.packageCount),
            palletCount: item.palletCount == null ? undefined : Number(item.palletCount),
            packageLengthCm: item.packageLengthCm == null ? undefined : Number(item.packageLengthCm),
            packageWidthCm: item.packageWidthCm == null ? undefined : Number(item.packageWidthCm),
            packageHeightCm: item.packageHeightCm == null ? undefined : Number(item.packageHeightCm),
            grossWeightKg: item.grossWeightKg == null ? undefined : Number(item.grossWeightKg),
            packageNotes: item.packageNotes ?? undefined,
          })),
        }))
      );

      setDeliveries(
        (deliveriesR.data ?? []).map((d: any) => ({
          id: d.id,
          salesCaseId: d.opportunityId ?? '',
          customerId: d.companyId ?? '',
          shipmentId: d.shipmentId ?? undefined,
          date: (d.deliveryDate as string)?.slice(0, 10) ?? '',
          signedBy: d.signedBy ?? '—',
          status: deliveryStatusFromCode(d.status),
          formData: d.formData
            ? {
                formNo: d.formData.formNo,
                kurulumTarihi: d.formData.kurulumTarihi ? String(d.formData.kurulumTarihi).slice(0, 10) : undefined,
                machineId: d.formData.machineId,
                tezgah: d.formData.tezgah,
                cnc: d.formData.cnc,
                ilgili: d.formData.ilgili,
                kurulumuYapan: d.formData.kurulumuYapan,
                technicalSpecs: d.formData.technicalSpecs,
              }
            : undefined,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [authed, sessionReady, user?.permissions]);

  // Aktif bölüm değişince (CNC/Üniversal/Sac/Tümü) tüm veriyi yeni
  // `X-Active-Division` başlığıyla yeniden çek.
  useEffect(() => {
    fetchAll();
  }, [fetchAll, user?.id, sessionReady, activeDivision]);

  const addCustomer: Store['addCustomer'] = async (c) => {
    const rawWebsite = c.website?.trim();
    const website = rawWebsite ? (/^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`) : undefined;
    const hasCoordinates = c.latitude != null && c.longitude != null;
    const created = await companyService.create({
      companyType: c.type === 'person' ? 'person' : 'company',
      legalTitle: c.name,
      shortName: c.type === 'person' ? c.name : undefined,
      sector: c.sector || undefined,
      taxOffice: c.taxOffice || undefined,
      taxNumber: c.taxNumber || undefined,
      website,
      primaryPhone: c.phone || undefined,
      secondaryPhone: c.phone2 || undefined,
      fax: c.fax || undefined,
      primaryEmail: c.email || undefined,
      secondaryEmail: c.email2 || undefined,
      address: c.address || c.city || c.district || c.country || hasCoordinates
        ? {
            country: c.country || 'Türkiye',
            province: c.city || undefined,
            district: c.district || undefined,
            fullAddress: c.address || undefined,
            latitude: hasCoordinates ? c.latitude : undefined,
            longitude: hasCoordinates ? c.longitude : undefined,
          }
        : undefined,
      notes: c.initialNote || undefined,
      relationTypeCode: c.firmType === 'supplier' ? 'supplier' : c.firmType === 'supplier_customer' ? 'supplier_customer' : 'customer',
      customerStatusCode: c.salesStatus === 'active_customer' ? 'active' : 'potential',
      companyGroupCode: c.companyGroupCode || undefined,
      contactSourceCode: c.contactSourceCode || undefined,
    });
    await fetchAll();
    return {
      id: created.id,
      type: c.type,
      firmType: c.firmType,
      salesStatus: c.salesStatus,
      companyGroupCode: c.companyGroupCode,
      companyGroupName: c.companyGroupName,
      contactSourceCode: c.contactSourceCode,
      sector: c.sector,
      name: c.name,
      contactPerson: c.contactPerson ?? '',
      phone: c.phone ?? '',
      phone2: c.phone2 ?? '',
      fax: c.fax ?? '',
      email: c.email ?? '',
      email2: c.email2 ?? '',
      city: c.city ?? '',
      district: c.district ?? '',
      country: c.country ?? '',
      address: c.address ?? '',
      latitude: c.latitude,
      longitude: c.longitude,
      locationSource: c.locationSource ?? (hasCoordinates ? 'osm' : undefined),
      taxOffice: c.taxOffice ?? '',
      taxNumber: c.taxNumber,
      website: c.website ?? '',
      wantedProduct: c.wantedProduct,
      initialNote: c.initialNote,
      source: c.source,
      status: 'active',
      createdAt: new Date().toISOString().slice(0, 10),
    };
  };

  const updateCustomer: Store['updateCustomer'] = async (id, patch) => {
    const rawWebsite = patch.website?.trim();
    const website = rawWebsite ? (/^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`) : undefined;
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.legalTitle = patch.name;
    if (patch.sector !== undefined) body.sector = patch.sector || undefined;
    if (patch.taxOffice !== undefined) body.taxOffice = patch.taxOffice || undefined;
    if (patch.taxNumber !== undefined) body.taxNumber = patch.taxNumber || undefined;
    if (patch.website !== undefined) body.website = website;
    if (patch.phone !== undefined) body.primaryPhone = patch.phone || undefined;
    if (patch.phone2 !== undefined) body.secondaryPhone = patch.phone2 || undefined;
    if (patch.fax !== undefined) body.fax = patch.fax || undefined;
    if (patch.email !== undefined) body.primaryEmail = patch.email || undefined;
    if (patch.email2 !== undefined) body.secondaryEmail = patch.email2 || undefined;
    if (patch.firmType !== undefined)
      body.relationTypeCode = patch.firmType === 'supplier' ? 'supplier' : patch.firmType === 'supplier_customer' ? 'supplier_customer' : 'customer';
    if (patch.salesStatus !== undefined)
      body.customerStatusCode = patch.salesStatus === 'active_customer' ? 'active' : 'potential';
    if (patch.city !== undefined || patch.district !== undefined || patch.country !== undefined || patch.address !== undefined) {
      body.address = {
        country: patch.country ?? undefined,
        province: patch.city ?? undefined,
        district: patch.district ?? undefined,
        street: patch.address ?? undefined,
      };
    }
    await companyService.update(id, body);
    await fetchAll();
  };

  const deleteCustomer: Store['deleteCustomer'] = async (id) => {
    await companyService.remove(id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  };

  const addContact: Store['addContact'] = async (k) => {
      const created = await contactService.create({
      companyId: k.customerId,
      fullName: k.name,
      title: k.title,
      department: k.department,
      workPhone: k.phone,
      phoneExtension: k.phoneExtension,
      workEmail: k.email,
      mobilePhone: k.mobilePhone,
      otherPhone: k.otherPhone,
      personalEmail: k.personalEmail,
      otherEmail: k.otherEmail,
      gender: k.gender,
      birthDate: k.birthDate ? new Date(k.birthDate) : undefined,
      decisionRoleCode: k.decisionRoleCode,
      hometown: k.hometown,
      favoriteTeam: k.favoriteTeam,
      knownIllness: k.knownIllness,
      favoriteColor: k.favoriteColor,
      graduatedSchool: k.graduatedSchool,
      politicalView: k.politicalView,
      isPrimary: k.isPrimary,
      notes: k.note,
      isBlacklisted: k.isBlacklisted ?? false,
      blacklistReason: k.blacklistReason,
    });
    await fetchAll();
    return { id: created.id, ...k };
  };

  const updateContact: Store['updateContact'] = async (id, patch) => {
    await contactService.update(id, {
      fullName: patch.name,
      title: patch.title,
      department: patch.department,
      workPhone: patch.phone,
      phoneExtension: patch.phoneExtension,
      workEmail: patch.email,
      mobilePhone: patch.mobilePhone,
      otherPhone: patch.otherPhone,
      personalEmail: patch.personalEmail,
      otherEmail: patch.otherEmail,
      gender: patch.gender,
      birthDate: patch.birthDate ? new Date(patch.birthDate) : undefined,
      decisionRoleCode: patch.decisionRoleCode,
      hometown: patch.hometown,
      favoriteTeam: patch.favoriteTeam,
      knownIllness: patch.knownIllness,
      favoriteColor: patch.favoriteColor,
      graduatedSchool: patch.graduatedSchool,
      politicalView: patch.politicalView,
      isPrimary: patch.isPrimary,
      notes: patch.note,
      isBlacklisted: patch.isBlacklisted,
      blacklistReason: patch.blacklistReason,
    });
    await fetchAll();
  };

  const deleteContact: Store['deleteContact'] = async (id) => {
    await contactService.remove(id);
    await fetchAll();
  };

  const addActivity: Store['addActivity'] = async (a) => {
    const activityTypeCode = activityTypeCodeFromLabel(a.type) ?? 'note';
    const created = await activityService.create({
      opportunityId: a.salesCaseId || undefined,
      companyId: a.customerId,
      activityTypeCode,
      subject: a.title,
      description: a.note,
      activityDate: new Date(a.date ?? new Date().toISOString().slice(0, 10)),
      result: a.result || undefined,
    });
    await fetchAll();
    return { ...a, id: created.id, date: a.date ?? new Date().toISOString().slice(0, 10) } as Activity;
  };

  const updateActivity: Store['updateActivity'] = async (id, patch) => {
    const activityTypeCode = patch.type ? activityTypeCodeFromLabel(patch.type) ?? 'note' : undefined;
    await activityService.update(id, {
      opportunityId: patch.salesCaseId || undefined,
      companyId: patch.customerId || undefined,
      activityTypeCode,
      subject: patch.title,
      description: patch.note,
      activityDate: patch.date ? new Date(patch.date) : undefined,
      result: patch.result,
    });
    await fetchAll();
  };

  const deleteActivity: Store['deleteActivity'] = async (id) => {
    await activityService.remove(id);
    await fetchAll();
  };

  const addCase: Store['addCase'] = async (c) => {
    const created = await opportunityService.create({
      companyId: c.customerId,
      ownerUserId: c.assignedUserId || undefined,
      title: c.requestedProduct,
      description: c.requestedModel,
      estimatedValue: c.estimatedAmount,
      currencyCode: c.currency,
      probability: 50,
      divisionId: c.divisionId || undefined,
    });
    const targetStage = c.stage ?? 'lead';
    if (targetStage !== 'lead') {
      const code = CODE_BY_STAGE[targetStage];
      if (code) {
        await opportunityService.changeStage(created.id, { toStage: code });
      }
    }
    await fetchAll();
    return {
      id: created.id,
      ...c,
      stage: targetStage,
      isLost: false,
      isOfferPrepared: false,
      createdAt: new Date().toISOString().slice(0, 10),
    } as SalesCase;
  };

  const updateCase: Store['updateCase'] = async (id, patch) => {
    const body: Record<string, unknown> = {};
    if (patch.assignedUserId !== undefined) body.ownerUserId = patch.assignedUserId || null;
    await opportunityService.update(id, body);
    await fetchAll();
  };

  const deleteCase: Store['deleteCase'] = async (id) => {
    await opportunityService.remove(id);
    await fetchAll();
  };

  const moveCase: Store['moveCase'] = async (id, to, options) => {
    const code = CODE_BY_STAGE[to];
    if (!code) return;
    try {
      await opportunityService.changeStage(id, {
        toStage: code,
        cancellationReasonCode: code === 'cancelled' ? 'other' : undefined,
        changeReason: options?.changeReason,
        inventoryItemIds: options?.inventoryItemIds?.length ? options.inventoryItemIds : undefined,
      });
    } catch (err) {
      console.error('Stage change failed', err);
      throw err;
    }
    await fetchAll();
  };

  // Mantıksal kapanış (Bitir): terminal kartı arşivler — silmez. Backend closedAt set eder,
  // kart aktif listeden düşer (view=active), Geçmiş'te görünür. delivered ise servise devir korunur.
  const closeCase: Store['closeCase'] = async (id, reason) => {
    await opportunityService.close(id, reason ? { reason } : undefined);
    await fetchAll();
  };

  // Geri Aç: kapanışı geri alır, kart aktif panoya döner.
  const reopenCase: Store['reopenCase'] = async (id) => {
    await opportunityService.reopen(id);
    await fetchAll();
  };

  // Fırsatı "Kaybedildi" (cancelled) olarak işaretler; gerçek ret nedeni ve
  // (varsa) tercih edilen rakip bilgisini backend'e geçirir.
  const markCaseLost: Store['markCaseLost'] = async (id, payload) => {
    await opportunityService.changeStage(id, {
      toStage: 'cancelled',
      cancellationReasonCode: payload.reasonCode,
      lostCompetitorId: payload.competitorId || undefined,
      lostCompetitorProductModel: payload.competitorProductModel || undefined,
    });
    await fetchAll();
  };

  const addOffer: Store['addOffer'] = async (o) => {
    const sc = cases.find((c) => c.id === o.salesCaseId);
    if (!sc) throw new Error('Satış kartı bulunamadı');
    const created = await quoteService.create({
      opportunityId: o.salesCaseId,
      companyId: sc.customerId,
      quoteDate: new Date(),
      validityDays: 15,
      currencyCode: o.currency,
      paymentTerms: o.note,
    });
    await fetchAll();
    return {
      id: created.id,
      salesCaseId: o.salesCaseId,
      quoteNo: created.documentNo,
      revision: o.revision ?? 1,
      date: new Date().toISOString().slice(0, 10),
      amount: o.amount,
      currency: o.currency,
      status: 'Draft',
      note: o.note,
    } as Offer;
  };

  const createQuoteFull: Store['createQuoteFull'] = async (p) => {
    let opportunityId = p.opportunityId;
    let createdNewCase = false;
    if (!opportunityId) {
      const estimated = p.items.reduce((s, it) => s + (it.quantity * it.unitPrice - it.discountAmount), 0);
      const opp = await opportunityService.create({
        companyId: p.companyId,
        title: p.caseTitle || p.items[0]?.description || 'Yeni Teklif',
        estimatedValue: estimated,
        currencyCode: p.currencyCode,
        probability: 50,
        divisionId: p.divisionId || undefined,
      });
      opportunityId = opp.id;
      createdNewCase = true;
    }
    if (!opportunityId) throw new Error('Teklif için satış kartı oluşturulamadı');

    const quote = await quoteService.create({
      opportunityId,
      companyId: p.companyId,
      contactId: p.contactId || undefined,
      quoteDate: new Date(p.quoteDate),
      validityDays: p.validityDays,
      documentNo: p.documentNo || undefined,
      currencyCode: p.currencyCode,
      headerDiscountAmount: p.headerDiscountAmount ?? 0,
      headerDiscountPercent: p.headerDiscountPercent ?? 0,
      projectOwnerUserId: p.projectOwnerUserId || undefined,
      notes: p.notes || undefined,
      paymentTerms: p.paymentTermsText || undefined,
      deliveryTerms: p.deliveryTermsText || undefined,
      warrantyTerms: p.warrantyTermsText || undefined,
      divisionId: p.divisionId || undefined,
    });

    for (let i = 0; i < p.items.length; i++) {
      const it = p.items[i];
      await quoteService.addItem(quote.id, {
        productModelId: it.productModelId || undefined,
        stockCode: it.stockCode || undefined,
        description: it.description,
        quantity: it.quantity,
        unitCode: 'adet',
        unitPrice: it.unitPrice,
        discountAmount: it.discountAmount,
        vatRate: it.vatRate,
        sortOrder: i,
        compatibility: it.compatibility
          ? {
              machineIds: it.compatibility.machineIds ?? [],
              brands: it.compatibility.brands ?? [],
              controlUnits: it.compatibility.controlUnits ?? [],
              supplierIds: it.compatibility.supplierIds ?? [],
              technicalSpecs: it.compatibility.technicalSpecs ?? [],
            }
          : undefined,
      });
    }

    if (
      p.paymentTermsText !== undefined ||
      p.deliveryTermsText !== undefined ||
      p.warrantyTermsText !== undefined ||
      p.importCostsExcluded !== undefined
    ) {
      await quoteService
        .terms(quote.id, {
          paymentTermsText: p.paymentTermsText,
          deliveryTermsText: p.deliveryTermsText,
          warrantyTermsText: p.warrantyTermsText,
          importCostsExcluded: p.importCostsExcluded ?? true,
        });
    }

    await activityService
      .create({
        opportunityId,
        companyId: p.companyId,
        activityTypeCode: 'note',
        subject: 'Teklif oluşturuldu',
        description: quote.documentNo,
        activityDate: new Date(),
      })
      .catch(() => undefined);

    if (createdNewCase) {
      await opportunityService.changeStage(opportunityId, { toStage: 'quote' }).catch(() => undefined);
    }

    await fetchAll();
    return { quoteId: quote.id, documentNo: quote.documentNo, opportunityId };
  };

  const addNoteTemplate: Store['addNoteTemplate'] = async (t) => {
    const created = await noteTemplateService.create({ title: t.title, body: t.body, scope: t.scope ?? 'quote' });
    await fetchAll();
    return { id: created.id, title: created.title, body: created.body, scope: created.scope ?? 'quote' };
  };

  const updateNoteTemplate: Store['updateNoteTemplate'] = async (id, patch) => {
    const updated = await noteTemplateService.update(id, patch);
    await fetchAll();
    return { id: updated.id, title: updated.title, body: updated.body, scope: updated.scope ?? 'quote' };
  };

  const deleteNoteTemplate: Store['deleteNoteTemplate'] = async (id) => {
    await noteTemplateService.remove(id);
    await fetchAll();
  };

  const addProduct: Store['addProduct'] = async (p) => {
    const brands = await productService.listBrands();
    let brand = brands.find((b: any) => b.name?.toLocaleLowerCase('tr-TR') === p.brand.toLocaleLowerCase('tr-TR'));
    if (!brand) brand = await productService.createBrand({ name: p.brand || 'Generic' });
    const created = await productService.create(productApiPayload(p, brand.id) as ProductCreateInput);
    await productService.replaceDetails(created.id, productDetailsPayload(p));
    await fetchAll();
    return { id: created.id, ...p, status: p.status ?? 'active' } as Product;
  };

  const updateProduct: Store['updateProduct'] = async (id, patch) => {
    let brandId: string | undefined;
    if (patch.brand) {
      const brands = await productService.listBrands();
      let brand = brands.find((b: any) => b.name?.toLocaleLowerCase('tr-TR') === patch.brand?.toLocaleLowerCase('tr-TR'));
      if (!brand) brand = await productService.createBrand({ name: patch.brand });
      brandId = brand.id;
    }
    await productService.update(id, productApiPayload(patch, brandId));
    const current = products.find((item) => item.id === id);
    await productService.replaceDetails(id, productDetailsPayload({
      specs: patch.specs ?? current?.specs ?? [],
      standardEquipment: patch.standardEquipment ?? current?.standardEquipment ?? [],
      optionalEquipment: patch.optionalEquipment ?? current?.optionalEquipment ?? [],
    }));
    await fetchAll();
  };

  // Sadece verilen alanları PATCH'ler; specs/donanıma dokunmaz. API yalnızca
  // `!== undefined` alanları yazdığı için kısmi gönderim güvenlidir.
  const patchProduct: Store['patchProduct'] = async (id, fields) => {
    const apiPatch: Record<string, unknown> = {};
    const localPatch: Partial<Omit<Product, 'id'>> = { ...fields };
    if (fields.listPrice !== undefined) apiPatch.listPrice = toOptionalNumber(fields.listPrice);
    if (fields.cashPrice !== undefined) apiPatch.cashPrice = toOptionalNumber(fields.cashPrice);
    if (fields.vatRate !== undefined) {
      const vatRate = normalizeProductVatRate(fields.vatRate);
      apiPatch.vatRate = vatRate;
      localPatch.vatRate = vatRate;
    }
    if (fields.currency !== undefined) apiPatch.currencyCode = fields.currency;
    if (fields.stockCode !== undefined) apiPatch.stockCode = cleanString(fields.stockCode);
    if (fields.originCountry !== undefined) apiPatch.originCountry = cleanString(fields.originCountry);
    if (fields.hsCode !== undefined) apiPatch.hsCode = cleanString(fields.hsCode);
    if (fields.modelName !== undefined) apiPatch.modelName = cleanString(fields.modelName);
    if (fields.description !== undefined) apiPatch.description = cleanString(fields.description);
    if (fields.muadilProductIds !== undefined) {
      const muadilProductIds = fields.muadilProductIds.filter(Boolean);
      apiPatch.muadilProductIds = muadilProductIds;
      apiPatch.muadilProductId = muadilProductIds[0] ?? null;
      localPatch.muadilProductIds = muadilProductIds;
      localPatch.muadilProductId = muadilProductIds[0] ?? null;
      localPatch.muadilProducts = products
        .filter((product) => muadilProductIds.includes(product.id))
        .map((product) => ({
          id: product.id,
          brand: product.brand,
          model: product.model,
          shortDescription: product.shortDescription,
          category: product.category,
          categoryCode: product.categoryCode,
          type: product.type,
          listPrice: product.listPrice,
          currency: product.currency,
        }));
    }
    await productService.update(id, apiPatch);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...localPatch } : p)));
  };

  const deleteProduct: Store['deleteProduct'] = async (id) => {
    await productService.remove(id);
    await fetchAll();
  };

  const addStock: Store['addStock'] = async (s) => {
    let product;
    if (s.productId) {
      product = await productService.get(s.productId).catch(() => null);
    }
    if (!product) {
      const prods = await productService.list({
        search: s.counterModel,
        categoryCode: s.categoryCode ?? 'TEZGAH',
      });
      product = prods.data[0];
    }
    if (!product) throw new Error('Önce ürün katalogda olmalı');
    const extraNotes = [
      s.optionalHardware ? `Opsiyon Donanım: ${s.optionalHardware}` : '',
      s.spareParts ? `Yedek Parça: ${s.spareParts}` : '',
    ].filter(Boolean).join('\n');
    const createStatusCodeMap: Record<StockItem['status'], string> = {
      Available: 'available',
      Reserved: 'reserved',
      InTransit: 'in_transit',
      Sold: 'sold',
      Inactive: 'damaged',
    };

    const created = await inventoryService.create({
      productModelId: product.id,
      parentInventoryItemId: s.parentInventoryItemId ?? undefined,
      serialNumber: s.serialNumber,
      controlUnit: s.controlPanel,
      loadingDate: toOptionalDate(s.loadingDate),
      arrivalDate: toOptionalDate(s.arrivalDate),
      stockStatusCode: createStatusCodeMap[s.status] ?? 'available',
      notes: extraNotes || undefined,
    });
    await fetchAll();
    return {
      id: created.id,
      ...s,
      categoryCode: (s.categoryCode ?? product.category?.code ?? 'TEZGAH') as StockCategoryCode,
    } as StockItem;
  };

  const updateStockStatus: Store['updateStockStatus'] = async (id, status) => {
    if (status === 'Sold') {
      throw new Error('Satıldı durumu yalnızca satış faturası ile işaretlenebilir');
    }
    const codeMap: Record<StockItem['status'], string> = {
      Available: 'available',
      Reserved: 'reserved',
      InTransit: 'in_transit',
      Sold: 'sold',
      Inactive: 'damaged',
    };
    await inventoryService.update(id, { stockStatusCode: codeMap[status] });
    await fetchAll();
  };

  const reserveStock: Store['reserveStock'] = async (id, companyId, notes) => {
    await inventoryService.reserve(id, { companyId, notes });
    await fetchAll();
  };

  // ── Sevkiyat / teslimat ──
  const addShipment: Store['addShipment'] = async (s) => {
    const created = await serviceService.createShipment({
      opportunityId: s.salesCaseId || undefined,
      senderCompanyId: s.senderCompanyId || undefined,
      senderName: s.senderName || undefined,
      carrierCompanyId: s.carrierCompanyId || undefined,
      transportMode: s.transportMode || undefined,
      productCategoryCode: s.productCategoryCode || undefined,
      destinationWarehouseId: s.destinationWarehouseId || undefined,
      loadingDate: toOptionalDate(s.loadingDate),
      trackingNo: s.trackingNo,
      carrier: s.carrier,
      origin: s.origin || undefined,
      destination: s.destination || undefined,
      eta: toOptionalDate(s.eta),
      statusCode: shipmentStatusToCode(s.status),
      items: s.items?.map((item, index) => ({
        inventoryItemId: item.inventoryItemId || undefined,
        productModelId: item.productModelId || undefined,
        description: item.description,
        serialNumber: item.serialNumber || undefined,
        quantity: item.quantity ?? 1,
        unitCode: 'adet',
        sortOrder: index,
        packageCount: item.packageCount,
        palletCount: item.palletCount,
        packageLengthCm: item.packageLengthCm,
        packageWidthCm: item.packageWidthCm,
        packageHeightCm: item.packageHeightCm,
        grossWeightKg: item.grossWeightKg,
        packageNotes: item.packageNotes || undefined,
      })),
    });
    await fetchAll();
    return { id: created.id, ...s };
  };
  const startShipment: Store['startShipment'] = async (id, loadingDate) => {
    await serviceService.startShipment(id, { loadingDate: toOptionalDate(loadingDate) });
    await fetchAll();
  };
  const updateShipmentStatus: Store['updateShipmentStatus'] = async (id, status, options) => {
    await serviceService.updateShipmentStatus(id, {
      statusCode: shipmentStatusToCode(status),
      destinationWarehouseId: options?.destinationWarehouseId,
      loadingDate: toOptionalDate(options?.loadingDate),
      arrivedAt: toOptionalDate(options?.arrivedAt),
    });
    await fetchAll();
  };
  const addDelivery: Store['addDelivery'] = async (d) => {
    const created = await serviceService.createDelivery({
      companyId: d.customerId,
      opportunityId: d.salesCaseId || undefined,
      shipmentId: d.shipmentId || undefined,
      deliveryDate: new Date(d.date),
      signedBy: d.signedBy === '—' ? undefined : d.signedBy,
      status: deliveryStatusToCode(d.status),
      formData: deliveryFormDataPayload(d.formData),
    });
    await fetchAll();
    return {
      id: created.id,
      ...d,
    };
  };
  const triggerDeliveryCompletedWorkflow = async (delivery: Delivery) => {
    if (delivery.salesCaseId) {
      try {
        await moveCase(delivery.salesCaseId, 'delivered');
      } catch (err) {
        console.error('Failed to move case on delivery completion', err);
      }
    }
    const serial = delivery.formData?.tezgah?.seriNo;
    if (serial && serial !== '—') {
      const exists = machines.some(m => m.serialNumber === serial);
      if (!exists) {
        try {
          const brand = delivery.formData?.tezgah?.marka || '';
          const model = delivery.formData?.tezgah?.model || '—';
          const type = delivery.formData?.tezgah?.tip || '';
          const cncMarka = delivery.formData?.cnc?.marka || '';
          const cncModel = delivery.formData?.cnc?.model || '';
          const controlUnit = [cncMarka, cncModel].filter(Boolean).join(' ');
          const controlUnitSerial = delivery.formData?.cnc?.seriNo || '';
          await addMachine({
            customerId: delivery.customerId,
            salesCaseId: delivery.salesCaseId || '',
            stockItemId: delivery.formData?.machineId || '',
            serialNumber: serial,
            model,
            brand,
            type,
            controlUnit,
            controlUnitSerial,
            installationDate: delivery.formData?.kurulumTarihi || delivery.date || new Date().toISOString().slice(0, 10),
            warrantyStart: delivery.formData?.kurulumTarihi || delivery.date || new Date().toISOString().slice(0, 10),
            warrantyEnd: (() => {
              const start = new Date(delivery.formData?.kurulumTarihi || delivery.date || new Date().toISOString().slice(0, 10));
              start.setFullYear(start.getFullYear() + 2); // 2 year default warranty
              return start.toISOString().slice(0, 10);
            })()
          });
        } catch (err) {
          console.error('Failed to auto create machine on delivery completion', err);
        }
      }
    }
  };

  const updateDelivery: Store['updateDelivery'] = async (id, d) => {
    await serviceService.updateDelivery(id, {
      companyId: d.customerId,
      opportunityId: d.salesCaseId,
      shipmentId: d.shipmentId,
      deliveryDate: d.date ? new Date(d.date) : undefined,
      signedBy: d.signedBy === '—' ? undefined : d.signedBy,
      status: d.status ? deliveryStatusToCode(d.status) : undefined,
      formData: deliveryFormDataPayload(d.formData),
    });
    await fetchAll();

    if (d.status === 'Tamamlandı') {
      const delivery = deliveries.find((x) => x.id === id);
      if (delivery) {
        await triggerDeliveryCompletedWorkflow({
          ...delivery,
          ...d,
          formData: d.formData ? { ...delivery.formData, ...d.formData } : delivery.formData,
        } as Delivery);
      }
    }
  };

  const updateDeliveryStatus: Store['updateDeliveryStatus'] = async (id, status) => {
    await serviceService.updateDeliveryStatus(id, deliveryStatusToCode(status));
    setDeliveries((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));

    if (status === 'Tamamlandı') {
      const delivery = deliveries.find((d) => d.id === id);
      if (delivery) {
        await triggerDeliveryCompletedWorkflow({ ...delivery, status });
      }
    }
  };

  const addService: Store['addService'] = async (s) => {
    const machine = machines.find((m) => m.id === s.machineId);
    const subject =
      cleanString(s.issueType) ??
      cleanString([machine?.model, machine?.serialNumber].filter(Boolean).join(' · ')) ??
      'Servis talebi';
    const description = [s.diagnosisNote, s.serviceNote].map((value) => value?.trim()).filter(Boolean).join('\n\n') || undefined;
    const createdAt = s.createdAt ?? new Date().toISOString().slice(0, 10);
    const created = await serviceService.createTicket({
      companyId: s.customerId,
      contactId: s.contactId || undefined,
      customerDeviceId: s.machineId || undefined,
      subject,
      description: cleanString(s.description) ?? description ?? subject,
      severity: (s.priority as any) ?? 'normal',
      ticketType: s.ticketType ?? 'complaint',
      source: s.source ?? 'manual',
      assignedToUserId: s.assignedUserId || undefined,
      metadata: {
        quoteRequired: s.quoteRequired ?? false,
        serviceStage: s.stage ?? 'Request Opened',
        serviceQuote: s.serviceQuote ?? null,
        noteHistory: s.serviceNote
          ? [{ id: `srv-note-${Date.now()}`, text: s.serviceNote, createdAt, byUserId: s.assignedUserId || undefined }]
          : [],
        complaints: s.diagnosisNote
          ? [{ id: `srv-complaint-${Date.now()}`, text: s.diagnosisNote, createdAt, byUserId: s.assignedUserId || undefined }]
          : [],
        activityHistory: [
          {
            id: `srv-act-${Date.now()}`,
            text: 'Servis talebi açıldı.',
            createdAt,
            byUserId: s.assignedUserId || undefined,
          },
        ],
        operations: [],
        timerStatus: s.timerStatus ?? 'idle',
        timerElapsedSeconds: s.timerElapsedSeconds ?? 0,
        serviceHourlyRate: s.serviceHourlyRate ?? 120,
        serviceCurrency: s.serviceCurrency ?? 'USD',
      },
    });
    await fetchAll();
    return {
      id: created.id,
      ...s,
      stage: s.stage ?? 'Request Opened',
      issueType: s.issueType ?? subject,
      ticketType: s.ticketType ?? 'complaint',
      source: s.source ?? 'manual',
      description: s.description ?? description ?? subject,
      createdAt,
      complaints: s.complaints ?? [],
      noteHistory: s.noteHistory ?? [],
      activityHistory: s.activityHistory ?? [],
      operations: s.operations ?? [],
      timerStatus: s.timerStatus ?? 'idle',
      timerElapsedSeconds: s.timerElapsedSeconds ?? 0,
      serviceHourlyRate: s.serviceHourlyRate ?? 120,
      serviceCurrency: s.serviceCurrency ?? 'USD',
      warrantyClaim: s.warrantyClaim ?? null,
      sourceComplaint: s.sourceComplaint ?? null,
    } as ServiceRequest;
  };

  const addMachine: Store['addMachine'] = async (m) => {
    const created = await inventoryService.createCustomerDevice({
      companyId: m.customerId,
      initialCompanyId: m.initialCustomerId || m.customerId,
      inventoryItemId: m.stockItemId || undefined,
      opportunityId: m.salesCaseId || undefined,
      installationDate: toOptionalDate(m.installationDate),
      warrantyStartDate: toOptionalDate(m.warrantyStart),
      warrantyEndDate: toOptionalDate(m.warrantyEnd),
      notes: [m.model, m.serialNumber].filter(Boolean).join(' · ') || undefined,
    });
    await fetchAll();
    const mapped: Machine = {
      id: created.id,
      initialCustomerId: created.initialCompanyId ?? m.initialCustomerId ?? m.customerId,
      userCompanyId: created.companyId ?? m.customerId,
      customerId: m.customerId,
      salesCaseId: m.salesCaseId ?? '',
      stockItemId: m.stockItemId ?? '',
      serialNumber: m.serialNumber,
      model: m.model,
      installationDate: m.installationDate ?? '',
      warrantyStart: m.warrantyStart ?? '',
      warrantyEnd: m.warrantyEnd ?? '',
      status: m.status ?? 'Active',
    };
    return mapped;
  };

  const updateMachineCustomer: Store['updateMachineCustomer'] = async (id, customerId) => {
    await inventoryService.updateCustomerDevice(id, { companyId: customerId });
    await fetchAll();
  };

  const moveService: Store['moveService'] = async (id, to) => {
    const codeMap: Record<ServiceStage, string> = {
      'Request Opened': 'open',
      Diagnosis: 'in_progress',
      'Quote Needed': 'in_progress',
      'Quote Sent': 'in_progress',
      Approval: 'in_progress',
      Scheduled: 'in_progress',
      'Service In Progress': 'in_progress',
      'Service Completed': 'resolved',
      'Signed Form': 'resolved',
      Closed: 'closed',
    };
    const current = service.find((item) => item.id === id);
    if (to === 'Scheduled' && !isServiceQuoteComplete(current?.serviceQuote)) {
      const missing = serviceQuoteMissingFields(current?.serviceQuote);
      throw new Error(`Bakım/Onarım aşamasından önce Servis Teklifi formunu tamamlayın: ${missing.join(', ')}.`);
    }
    await serviceService.updateTicketStatus(id, codeMap[to] ?? 'open', to);
    setService((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              stage: to,
              activityHistory: [
                ...(s.activityHistory ?? []),
                {
                  id: `srv-act-${Date.now()}`,
                  text: `Aşama değişti: ${to}`,
                  createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
                  byUserId: user?.id ?? s.assignedUserId ?? undefined,
                },
              ],
            }
          : s
      )
    );
  };

  const updateService: Store['updateService'] = async (id, patch) => {
    const current = service.find((s) => s.id === id);
    if (!current) return;
    const merged = { ...current, ...patch };
    const apiPatch: Record<string, unknown> = {};
    if (patch.description !== undefined) apiPatch.description = patch.description;
    if (patch.diagnosisNote !== undefined) {
      const prev = current.diagnosisNote?.trim() ?? '';
      apiPatch.description = prev ? `${prev}\n\n${patch.diagnosisNote}` : patch.diagnosisNote;
    }
    if (patch.serviceNote !== undefined) {
      const prev = current.serviceNote?.trim() ?? '';
      apiPatch.resolutionNote = prev ? `${prev}\n\n${patch.serviceNote}` : patch.serviceNote;
    }
    if (patch.priority !== undefined) apiPatch.severity = patch.priority;
    if (patch.assignedUserId !== undefined) apiPatch.assignedToUserId = patch.assignedUserId;
    if (patch.ticketType !== undefined) apiPatch.ticketType = patch.ticketType;

    const metaKeys = ['quoteRequired', 'serviceQuote', 'completionForm', 'timerStatus', 'timerStartedAt', 'timerElapsedSeconds', 'serviceHourlyRate', 'serviceCurrency', 'noteHistory', 'complaints', 'activityHistory', 'operations'] as const;
    if (metaKeys.some((k) => patch[k] !== undefined)) {
      apiPatch.metadata = {
        quoteRequired: merged.quoteRequired ?? false,
        serviceStage: merged.stage,
        serviceQuote: merged.serviceQuote ?? null,
        completionForm: merged.completionForm ?? null,
        timerStatus: merged.timerStatus ?? 'idle',
        timerStartedAt: merged.timerStartedAt ?? null,
        timerElapsedSeconds: merged.timerElapsedSeconds ?? 0,
        serviceHourlyRate: merged.serviceHourlyRate ?? 120,
        serviceCurrency: merged.serviceCurrency ?? 'USD',
        noteHistory: merged.noteHistory ?? [],
        complaints: merged.complaints ?? [],
        activityHistory: merged.activityHistory ?? [],
        operations: merged.operations ?? [],
      };
    }

    if (Object.keys(apiPatch).length) {
      await serviceService.update(id, apiPatch);
    }
    setService((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const setServiceWarranty = (id: string, claim: ServiceWarrantyClaim | null) => {
    setService((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ticketType: claim ? 'warranty_claim' : s.ticketType,
              warrantyClaim: claim,
            }
          : s
      )
    );
  };

  const loadServiceWarranty: Store['loadServiceWarranty'] = async (id) => {
    const saved = normalizeWarrantyClaim(await serviceService.warranty(id));
    setServiceWarranty(id, saved);
    return saved;
  };

  const updateServiceWarranty: Store['updateServiceWarranty'] = async (id, patch) => {
    const saved = normalizeWarrantyClaim(await serviceService.updateWarranty(id, {
      failureCategory: patch.failureCategory,
      technicianAssessment: patch.technicianAssessment,
      rmaNo: patch.rmaNo,
      supplierName: patch.supplierName,
      supplierRmaStatus: patch.supplierRmaStatus,
      costAmount: patch.costAmount,
      costCurrency: patch.costCurrency,
      customerChargeAmount: patch.customerChargeAmount,
      customerChargeCurrency: patch.customerChargeCurrency,
      status: patch.status,
    }));
    setServiceWarranty(id, saved);
    return saved;
  };

  const updateServiceWarrantyParts: Store['updateServiceWarrantyParts'] = async (id, parts) => {
    const saved = normalizeWarrantyClaim(await serviceService.updateWarrantyParts(
      id,
      parts.map((part) => ({
        productModelId: part.productModelId || undefined,
        inventoryItemId: part.inventoryItemId || undefined,
        description: part.description,
        quantity: part.quantity,
        actionType: part.actionType,
        source: part.source,
        supplierRmaStatus: part.supplierRmaStatus || undefined,
        chargeToCustomer: part.chargeToCustomer,
        unitCost: part.unitCost ?? undefined,
        currency: part.currency,
        notes: part.notes || undefined,
      }))
    ));
    setServiceWarranty(id, saved);
    return saved;
  };

  const submitServiceWarranty: Store['submitServiceWarranty'] = async (id, note) => {
    const saved = normalizeWarrantyClaim(await serviceService.submitWarranty(id, note));
    setServiceWarranty(id, saved);
    return saved;
  };

  const approveServiceWarranty: Store['approveServiceWarranty'] = async (id, decisionNote) => {
    const saved = normalizeWarrantyClaim(await serviceService.approveWarranty(id, decisionNote));
    setServiceWarranty(id, saved);
    return saved;
  };

  const rejectServiceWarranty: Store['rejectServiceWarranty'] = async (id, decisionNote) => {
    const saved = normalizeWarrantyClaim(await serviceService.rejectWarranty(id, decisionNote));
    setServiceWarranty(id, saved);
    return saved;
  };

  const addDocument: Store['addDocument'] = async (d) => {
    const quoteId =
      offers.find((o) => d.salesCaseId && o.salesCaseId === d.salesCaseId)?.id
      ?? offers.find((o) => d.companyId && o.companyId === d.companyId)?.id;
    const baseName = d.fileName.replace(/\.[^/.]+$/, '') || `DOC-${Date.now()}`;
    const today = new Date();

    const needsQuoteRecord = d.type === 'Proforma' || d.type === 'Contract' || d.type === 'CommercialInvoice' || d.type === 'AccountingInvoice';
    if (d.type === 'Proforma') {
      if (!quoteId) throw new Error('Proforma için ilişkili teklif bulunamadı.');
      await documentService.createProforma({ quoteId, documentNo: baseName, issueDate: today, statusCode: 'draft', fileId: d.fileId });
    } else if (d.type === 'Contract') {
      if (!quoteId) throw new Error('Sözleşme için ilişkili teklif bulunamadı.');
      await documentService.createContract({ quoteId, contractNo: baseName, signedDate: today, statusCode: 'draft', fileId: d.fileId });
    } else if (d.type === 'CommercialInvoice' || d.type === 'AccountingInvoice') {
      if (!quoteId) throw new Error('Fatura için ilişkili teklif bulunamadı.');
      await documentService.createCommercialInvoice({ quoteId, invoiceNo: baseName, invoiceDate: today, statusCode: 'draft', fileId: d.fileId });
    }

    const row: DocumentItem = {
      id: d.id ?? `doc-${Date.now()}`,
      salesCaseId: d.salesCaseId,
      companyId: d.companyId,
      serviceRequestId: d.serviceRequestId,
      type: d.type,
      fileName: d.fileName,
      uploadedBy: d.uploadedBy ?? user?.id ?? '',
      uploadedAt: d.uploadedAt ?? new Date().toISOString().slice(0, 10),
      size: d.size,
      fileId: d.fileId,
      mimeType: d.mimeType,
    };
    if (needsQuoteRecord) {
      await fetchAll();
    } else {
      setDocuments((prev) => [...prev.filter((x) => x.id !== row.id), row]);
    }
    return row;
  };

  const value = useMemo<Store>(
    () => ({
      customers,
      cases,
      closedCases,
      service,
      offers,
      noteTemplates,
      stock,
      products,
      activities,
      contacts,
      users,
      machines,
      payments,
      documents,
      shipments,
      deliveries,
      installations,
      loading,
      loadErrors,
      loadTruncated,
      clearLoadErrors,
      addContact,
      updateContact,
      deleteContact,
      addActivity,
      updateActivity,
      deleteActivity,
      addProduct,
      updateProduct,
      patchProduct,
      deleteProduct,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addCase,
      updateCase,
      deleteCase,
      addOffer,
      createQuoteFull,
      addNoteTemplate,
      updateNoteTemplate,
      deleteNoteTemplate,
      addStock,
      updateStockStatus,
      reserveStock,
      addShipment,
      startShipment,
      updateShipmentStatus,
      addDelivery,
      updateDelivery,
      updateDeliveryStatus,
      moveCase,
      closeCase,
      reopenCase,
      markCaseLost,
      moveService,
      updateService,
      loadServiceWarranty,
      updateServiceWarranty,
      updateServiceWarrantyParts,
      submitServiceWarranty,
      approveServiceWarranty,
      rejectServiceWarranty,
      addService,
      addMachine,
      updateMachineCustomer,
      addDocument,
      refresh: fetchAll,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, cases, closedCases, service, offers, noteTemplates, stock, products, activities, contacts, users, machines, payments, documents, shipments, deliveries, installations, loading, loadErrors, loadTruncated, clearLoadErrors]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreInner>{children}</StoreInner>
    </QueryClientProvider>
  );
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
