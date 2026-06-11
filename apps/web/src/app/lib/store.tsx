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
} from '../../lib/services';
import { useAuth } from '../../lib/auth';
import { resolveMediaUrl } from '../../lib/apiClient';
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
  Activity,
  FirmType,
  CustomerSalesStatus,
  DocumentItem,
  Machine,
  Payment,
  User,
} from './mock';

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
  commercial_invoice: 'commercial_invoice',
  customs_approved: 'customs_approved',
  stock_picking: 'stock_picking',
  shipping: 'shipping',
  installation: 'installation',
  delivered: 'delivered',
};

const CODE_BY_STAGE: Partial<Record<SalesStage, string>> = {
  lead: 'lead',
  sales: 'sales',
  call: 'call',
  visit: 'visit',
  cancelled: 'cancelled',
  quote: 'quote',
  proforma: 'proforma',
  contract: 'contract',
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

const productApiPayload = (p: Partial<Product>, brandId?: string) => {
  const modelCode = productModelCode(p);
  const fullName = cleanString(p.shortDescription) ?? [p.brand, modelCode].filter(Boolean).join(' ');
  return {
    brandId,
    productGroupCode: cleanString(p.productGroupCode),
    categoryCode: cleanString(p.categoryCode),
    subcategoryCode: cleanString(p.subcategoryCode),
    productTypeCode: cleanString(p.productTypeCode),
    modelCode,
    modelName: cleanString(p.modelName),
    fullName,
    currencyCode: p.currency,
    listPrice: toOptionalNumber(p.listPrice),
    cashPrice: toOptionalNumber(p.cashPrice),
    vatRate: toOptionalNumber(p.vatRate) ?? 20,
    originCountry: cleanString(p.originCountry),
    hsCode: cleanString(p.hsCode),
    stockCode: cleanString(p.stockCode),
    imageUrl: cleanString(p.imageUrl),
    description: cleanString(p.description),
    // Boş seçim muadili temizler (null), seçiliyse id gönderilir.
    muadilProductId: p.muadilProductId ? p.muadilProductId : null,
  };
};

const productDetailsPayload = (p: Partial<Product>) => ({
  specs: (p.specs ?? [])
    .filter((s) => cleanString(s.key) && cleanString(s.value))
    .map((s, index) => ({
      specGroupCode: 'GENEL',
      specKey: s.key.trim(),
      specValue: s.value.trim(),
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
};

export type QuoteLineInput = {
  productModelId?: string;
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
  documentNo?: string;
  currencyCode: string;
  projectOwnerUserId?: string;
  notes?: string;
  deliveryTermsText?: string;
  importCostsExcluded?: boolean;
  items: QuoteLineInput[];
  caseTitle?: string;
};

type Store = {
  customers: Customer[];
  cases: SalesCase[];
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
  loading: boolean;
  addContact: (c: Omit<Contact, 'id'>) => Promise<Contact>;
  updateContact: (id: string, patch: Partial<Omit<Contact, 'id'>>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  addActivity: (a: Omit<Activity, 'id' | 'date'> & { date?: string }) => Promise<Activity>;
  addProduct: (p: Omit<Product, 'id' | 'status'> & { status?: 'active' | 'passive' }) => Promise<Product>;
  updateProduct: (id: string, patch: Partial<Omit<Product, 'id'>>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addCustomer: (c: Omit<Customer, 'id' | 'createdAt' | 'status'> & { status?: 'active' | 'passive' }) => Promise<Customer>;
  addCase: (c: Omit<SalesCase, 'id' | 'createdAt' | 'stage' | 'isLost' | 'isOfferPrepared'> & { stage?: SalesStage }) => Promise<SalesCase>;
  addOffer: (o: Omit<Offer, 'id' | 'date' | 'revision'> & { revision?: number }) => Promise<Offer>;
  createQuoteFull: (payload: CreateQuotePayload) => Promise<{ quoteId: string; documentNo: string; opportunityId: string }>;
  addNoteTemplate: (t: { title: string; body: string; scope?: string }) => Promise<NoteTemplate>;
  deleteNoteTemplate: (id: string) => Promise<void>;
  addStock: (s: Omit<StockItem, 'id'>) => Promise<StockItem>;
  updateStockStatus: (id: string, status: StockItem['status']) => Promise<void>;
  moveCase: (id: string, to: SalesStage) => Promise<void>;
  markCaseLost: (
    id: string,
    payload: { reasonCode: string; competitorId?: string; competitorProductModel?: string }
  ) => Promise<void>;
  moveService: (id: string, to: ServiceStage) => Promise<void>;
  updateService: (id: string, patch: Partial<ServiceRequest>) => Promise<void>;
  addService: (s: Omit<ServiceRequest, 'id' | 'createdAt' | 'stage'> & { stage?: ServiceStage; createdAt?: string }) => Promise<ServiceRequest>;
  addMachine: (m: Omit<Machine, 'id' | 'status'> & { status?: Machine['status'] }) => Promise<Machine>;
  addDocument: (
    d: Omit<DocumentItem, 'id' | 'uploadedAt' | 'uploadedBy'> &
      Partial<Pick<DocumentItem, 'id' | 'uploadedAt' | 'uploadedBy'>>
  ) => Promise<DocumentItem>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

function StoreInner({ children }: { children: ReactNode }) {
  const { authed, user } = useAuth();
  const [loading, setLoading] = useState(true);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cases, setCases] = useState<SalesCase[]>([]);
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
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const fetchAll = useCallback(async () => {
    if (!authed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const empty = { data: [] as any[], meta: { total: 0, page: 1, pageSize: 0, totalPages: 0 } };
      const [companies, contactsR, opps, prods, inv, qts, svcTickets, acts, usersR, devicesR, receivablesR, paymentsR, proformasR, contractsR, invoicesR, noteTemplatesR] = await Promise.all([
        companyService.list({ pageSize: 200 }).catch(() => empty),
        contactService.list({ pageSize: 200 }).catch(() => empty),
        opportunityService.list({ pageSize: 200 }).catch(() => empty),
        productService.list({ pageSize: 200 }).catch(() => empty),
        inventoryService.list({ pageSize: 200 }).catch(() => empty),
        quoteService.list({ pageSize: 200 }).catch(() => empty),
        serviceService.tickets({ pageSize: 200 }).catch(() => empty),
        activityService.list({ pageSize: 200 }).catch(() => empty),
        adminService.users().catch(() => [] as any[]),
        inventoryService.customerDevices({ pageSize: 200 }).catch(() => empty),
        financeService.receivables({ pageSize: 200 }).catch(() => empty),
        financeService.payments({ pageSize: 200 }).catch(() => empty),
        documentService.proformas({ pageSize: 200 }).catch(() => empty),
        documentService.contracts({ pageSize: 200 }).catch(() => empty),
        documentService.commercialInvoices({ pageSize: 200 }).catch(() => empty),
        noteTemplateService.list('quote').catch(() => [] as any[]),
      ]);

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
        contactsR.data.map((k: any) => ({
          id: k.id,
          customerId: k.companyId,
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
          isPrimary: !!k.isPrimary,
          note: k.notes ?? '',
        }))
      );

      setCases(
        opps.data.map((o: any) => {
          const stageCode = o.stage?.code ?? '';
          const hasQuote = qts.data.some((q: any) => q.opportunityId === o.id);
          return {
            id: o.id,
            customerId: o.companyId,
            assignedUserId: o.ownerUserId ?? '',
            department: '',
            requestedProduct: o.title ?? '',
            requestedModel: o.title ?? '',
            quantity: 1,
            estimatedAmount: Number(o.estimatedValue ?? 0),
            currency: (o.currency?.code as 'USD' | 'EUR' | 'TRY') ?? 'USD',
            stage: STAGE_BY_CODE[stageCode] ?? 'lead',
            isOfferPrepared: hasQuote,
            isLost: stageCode === 'cancelled',
            createdAt: (o.createdAt as string)?.slice(0, 10) ?? '',
            closedAt: undefined,
          } as SalesCase;
        })
      );

      const apiProducts = prods.data.map((p: any) => ({
          id: p.id,
          brand: p.brand?.name ?? '',
          productGroup: p.productGroup?.name ?? '',
          productGroupCode: p.productGroup?.code ?? '',
          model: p.modelCode ?? '',
          modelName: p.modelName ?? '',
          type: p.productType?.name ?? '',
          productTypeCode: p.productType?.code ?? '',
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
          vatRate: p.vatRate === null || p.vatRate === undefined ? undefined : Number(p.vatRate),
          originCountry: p.originCountry ?? '',
          hsCode: p.hsCode ?? '',
          stockCode: p.stockCode ?? '',
          specs: (p.specs ?? []).map((s: any) => ({
            key: s.key ?? s.specKey ?? '',
            value: s.unit ? `${s.value ?? s.specValue ?? ''} ${s.unit}` : s.value ?? s.specValue ?? '',
          })).filter((s: any) => s.key && s.value),
          standardEquipment: p.standardEquipment ?? [],
          optionalEquipment: p.optionalEquipment ?? [],
          muadilProductId: p.muadilProductId ?? undefined,
          status: p.isActive ? 'active' : 'passive',
        }));
      // Products (incl. the imported Haksan CNC catalogue) come from the DB API.
      // Blobs are served by the auth-gated public media endpoint, not bundled.
      setProducts(apiProducts);

      setStock(
        inv.data.map((s: any) => ({
          id: s.id,
          brand: s.brand?.name ?? '',
          counterType: s.product?.fullName ?? '',
          counterModel: s.product?.modelCode ?? '',
          serialNumber: s.serialNumber ?? '',
          controlPanel: s.controlUnit ?? '',
          stockCode: s.product?.modelCode ?? '',
          warehouse: s.warehouse?.name ?? '',
          status:
            s.status?.code === 'available'
              ? 'Available'
              : s.status?.code === 'reserved'
                ? 'Reserved'
                : s.status?.code === 'sold'
                  ? 'Sold'
                  : 'Inactive',
        }))
      );

      setOffers(
        qts.data.map((q: any) => ({
          id: q.id,
          salesCaseId: q.opportunityId ?? '',
          companyId: q.companyId ?? '',
          quoteNo: q.documentNo,
          revision: 1,
          date: (q.quoteDate as string)?.slice(0, 10) ?? '',
          validityDays: q.validityDays === null || q.validityDays === undefined ? undefined : Number(q.validityDays),
          amount: Number(q.grandTotal ?? 0),
          currency: (q.currency?.code as 'USD' | 'EUR' | 'TRY') ?? 'USD',
          status:
            q.status?.code === 'approved'
              ? 'Approved'
              : q.status?.code === 'sent'
                ? 'Sent'
                : q.status?.code === 'rejected'
                  ? 'Rejected'
                  : 'Draft',
          note: q.paymentTerms ?? '',
        }))
      );

      setService(
        (svcTickets.data ?? []).map((t: any) => ({
          id: t.id,
          customerId: t.companyId,
          assignedUserId: t.assignedToUserId ?? '',
          stage:
            t.status?.code === 'closed'
              ? 'Closed'
              : t.status?.code === 'resolved'
                ? 'Service Completed'
                : t.status?.code === 'in_progress'
                  ? 'Diagnosis'
                  : 'Request Opened' as ServiceStage,
          machineId: t.customerDeviceId ?? '',
          serialNumber: '',
          issueType: t.subject ?? '',
          priority: (t.severity as any) ?? 'normal',
          description: t.description ?? '',
          diagnosisNote: t.description ?? t.subject ?? '',
          quoteRequired: false,
          serviceNote: t.description ?? '',
          complaints: [
            {
              id: `${t.id}-complaint`,
              text: t.description ?? t.subject ?? 'Servis şikayeti girilmedi.',
              createdAt: ((t.reportedAt as string)?.slice(0, 16).replace('T', ' ') ?? ''),
              byUserId: t.assignedToUserId ?? undefined,
            },
          ],
          noteHistory: t.description
            ? [
                {
                  id: `${t.id}-note`,
                  text: t.description,
                  createdAt: ((t.reportedAt as string)?.slice(0, 16).replace('T', ' ') ?? ''),
                  byUserId: t.assignedToUserId ?? undefined,
                },
              ]
            : [],
          activityHistory: [
            {
              id: `${t.id}-created`,
              text: 'Servis talebi açıldı.',
              createdAt: ((t.reportedAt as string)?.slice(0, 16).replace('T', ' ') ?? ''),
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
          ],
          operations: [],
          timerStatus: 'idle',
          timerElapsedSeconds: 0,
          serviceHourlyRate: 120,
          serviceCurrency: 'USD',
          createdAt: (t.reportedAt as string)?.slice(0, 10) ?? '',
          closedAt: undefined,
        }))
      );

      setActivities(
        (acts.data ?? []).map((a: any) => ({
          id: a.id,
          salesCaseId: a.opportunityId ?? '',
          customerId: a.companyId ?? '',
          type: a.type?.name ?? '',
          title: a.subject ?? '',
          note: a.description ?? '',
          date: (a.activityDate as string)?.slice(0, 10) ?? '',
          byUserId: a.createdBy ?? '',
        }))
      );

      setMachines(
        (devicesR.data ?? []).map((d: any) => ({
          id: d.id,
          customerId: d.companyId ?? '',
          salesCaseId: d.opportunityId ?? '',
          stockItemId: d.inventoryItemId ?? '',
          serialNumber: d.serialNumber ?? d.inventorySerialNumber ?? d.inventoryItemId?.slice(0, 8) ?? '—',
          model: d.model ?? d.productModelName ?? d.inventoryItemId?.slice(0, 8) ?? '—',
          brand: d.brandName ?? '',
          type: d.productTypeName ?? '',
          controlUnit: d.controlUnit ?? '',
          controlUnitSerial: d.controlUnitSerialNumber ?? '',
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

      const receivablePayments: Payment[] = (receivablesR.data ?? []).map((r: any) => ({
        id: r.id,
        salesCaseId: r.quoteId ?? '',
        customerId: r.companyId ?? '',
        paymentType: 'expected',
        amount: Number(r.amount ?? 0),
        currency: (r.currency?.code as 'USD' | 'EUR' | 'TRY') ?? 'USD',
        dueDate: (r.dueDate as string)?.slice(0, 10) ?? '',
        status:
          r.status?.code === 'paid'
            ? 'Paid'
            : r.status?.code === 'overdue'
              ? 'Overdue'
              : r.status?.code === 'cancelled'
                ? 'Cancelled'
                : 'Pending',
        note: r.notes ?? '',
      }));
      const completedPayments: Payment[] = (paymentsR.data ?? []).map((p: any) => ({
        id: p.id,
        salesCaseId: p.receivableId ?? '',
        customerId: p.companyId ?? '',
        paymentType: 'received',
        amount: Number(p.amount ?? 0),
        currency: 'USD',
        dueDate: (p.paymentDate as string)?.slice(0, 10) ?? '',
        paidDate: (p.paymentDate as string)?.slice(0, 10) ?? '',
        status: 'Paid',
        note: p.notes ?? p.paymentMethod ?? '',
      }));
      setPayments([...receivablePayments, ...completedPayments]);

      // quote → company, so documents (proforma/contract/invoice) can be tied
      // to a firm directly even when the quote has no opportunity.
      const quoteCompany = new Map<string, string>(
        qts.data.map((q: any) => [q.id, q.companyId ?? ''])
      );
      const docCompanyId = (d: any) =>
        d.quote?.companyId ?? d.companyId ?? quoteCompany.get(d.quoteId) ?? '';

      const docRows: DocumentItem[] = [
        ...(proformasR.data ?? []).map((d: any) => ({
          id: d.id,
          salesCaseId: d.quote?.opportunityId ?? '',
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
      ];
      setDocuments(docRows);
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, user?.id]);

  const addCustomer: Store['addCustomer'] = async (c) => {
    const rawWebsite = c.website?.trim();
    const website = rawWebsite ? (/^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`) : undefined;
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
      address: c.address || c.city || c.district || c.country
        ? {
            country: c.country || 'Türkiye',
            province: c.city || undefined,
            district: c.district || undefined,
            fullAddress: c.address || undefined,
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
      birthDate: k.birthDate,
      decisionRoleCode: k.decisionRoleCode,
      hometown: k.hometown,
      favoriteTeam: k.favoriteTeam,
      knownIllness: k.knownIllness,
      favoriteColor: k.favoriteColor,
      graduatedSchool: k.graduatedSchool,
      politicalView: k.politicalView,
      isPrimary: k.isPrimary,
      notes: k.note,
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
      birthDate: patch.birthDate,
      decisionRoleCode: patch.decisionRoleCode,
      hometown: patch.hometown,
      favoriteTeam: patch.favoriteTeam,
      knownIllness: patch.knownIllness,
      favoriteColor: patch.favoriteColor,
      graduatedSchool: patch.graduatedSchool,
      politicalView: patch.politicalView,
      isPrimary: patch.isPrimary,
      notes: patch.note,
    });
    await fetchAll();
  };

  const deleteContact: Store['deleteContact'] = async (id) => {
    await contactService.remove(id);
    await fetchAll();
  };

  const addActivity: Store['addActivity'] = async (a) => {
    const created = await activityService.create({
      opportunityId: a.salesCaseId || undefined,
      companyId: a.customerId,
      activityTypeCode: 'note',
      subject: a.title,
      description: a.note,
      activityDate: a.date ?? new Date().toISOString().slice(0, 10),
    });
    await fetchAll();
    return { ...a, id: created.id, date: a.date ?? new Date().toISOString().slice(0, 10) } as Activity;
  };

  const addCase: Store['addCase'] = async (c) => {
    const created = await opportunityService.create({
      companyId: c.customerId,
      title: c.requestedProduct,
      description: c.requestedModel,
      estimatedValue: c.estimatedAmount,
      currencyCode: c.currency,
      probability: 50,
    });
    await fetchAll();
    return {
      id: created.id,
      ...c,
      stage: c.stage ?? 'lead',
      isLost: false,
      isOfferPrepared: false,
      createdAt: new Date().toISOString().slice(0, 10),
    } as SalesCase;
  };

  const moveCase: Store['moveCase'] = async (id, to) => {
    const code = CODE_BY_STAGE[to];
    if (!code) return;
    try {
      await opportunityService.changeStage(id, {
        toStage: code,
        cancellationReasonCode: code === 'cancelled' ? 'other' : undefined,
      });
    } catch (err) {
      console.error('Stage change failed', err);
      throw err;
    }
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
      quoteDate: new Date().toISOString(),
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
      });
      opportunityId = opp.id;
      createdNewCase = true;
    }

    const quote = await quoteService.create({
      opportunityId,
      companyId: p.companyId,
      contactId: p.contactId || undefined,
      quoteDate: p.quoteDate,
      documentNo: p.documentNo || undefined,
      currencyCode: p.currencyCode,
      projectOwnerUserId: p.projectOwnerUserId || undefined,
      notes: p.notes || undefined,
    });

    for (let i = 0; i < p.items.length; i++) {
      const it = p.items[i];
      await quoteService.addItem(quote.id, {
        productModelId: it.productModelId || undefined,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountAmount: it.discountAmount,
        vatRate: it.vatRate,
        sortOrder: i,
        compatibility: it.compatibility,
      });
    }

    if (p.deliveryTermsText !== undefined || p.importCostsExcluded !== undefined) {
      await quoteService
        .terms(quote.id, {
          deliveryTermsText: p.deliveryTermsText,
          importCostsExcluded: p.importCostsExcluded ?? true,
        })
        .catch(() => undefined);
    }

    await activityService
      .create({
        opportunityId,
        companyId: p.companyId,
        activityTypeCode: 'note',
        subject: 'Teklif oluşturuldu',
        description: quote.documentNo,
        activityDate: new Date().toISOString().slice(0, 10),
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

  const deleteNoteTemplate: Store['deleteNoteTemplate'] = async (id) => {
    await noteTemplateService.remove(id);
    await fetchAll();
  };

  const addProduct: Store['addProduct'] = async (p) => {
    const brands = await productService.listBrands();
    let brand = brands.find((b: any) => b.name?.toLocaleLowerCase('tr-TR') === p.brand.toLocaleLowerCase('tr-TR'));
    if (!brand) brand = await productService.createBrand({ name: p.brand || 'Generic' });
    const created = await productService.create(productApiPayload(p, brand.id));
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
    await productService.replaceDetails(id, productDetailsPayload(patch));
    await fetchAll();
  };

  const deleteProduct: Store['deleteProduct'] = async (id) => {
    await productService.remove(id);
    await fetchAll();
  };

  const addStock: Store['addStock'] = async (s) => {
    const prods = await productService.list({ search: s.counterModel });
    const product = prods.data[0];
    if (!product) throw new Error('Önce ürün katalogda olmalı');
    const created = await inventoryService.create({
      productModelId: product.id,
      serialNumber: s.serialNumber,
      controlUnit: s.controlPanel,
      stockStatusCode: 'available',
    });
    await fetchAll();
    return { id: created.id, ...s } as StockItem;
  };

  const updateStockStatus: Store['updateStockStatus'] = async (id, status) => {
    const codeMap: Record<StockItem['status'], string> = {
      Available: 'available',
      Reserved: 'reserved',
      Sold: 'sold',
      Inactive: 'damaged',
    };
    try {
      await inventoryService.update(id, { stockStatusCode: codeMap[status] });
    } catch {
      /* ignore */
    }
    await fetchAll();
  };

  const addService: Store['addService'] = async (s) => {
    const created = await serviceService.createTicket({
      companyId: s.customerId,
      subject: s.issueType,
      description: s.description,
      severity: (s.priority as any) ?? 'normal',
    });
    await fetchAll();
    return {
      id: created.id,
      ...s,
      stage: s.stage ?? 'Request Opened',
      createdAt: s.createdAt ?? new Date().toISOString().slice(0, 10),
      complaints: s.complaints ?? [],
      noteHistory: s.noteHistory ?? [],
      activityHistory: s.activityHistory ?? [],
      operations: s.operations ?? [],
      timerStatus: s.timerStatus ?? 'idle',
      timerElapsedSeconds: s.timerElapsedSeconds ?? 0,
      serviceHourlyRate: s.serviceHourlyRate ?? 120,
      serviceCurrency: s.serviceCurrency ?? 'USD',
    } as ServiceRequest;
  };

  const addMachine: Store['addMachine'] = async (m) => {
    const neu: Machine = {
      ...m,
      id: 'MCH-' + Date.now(),
      status: m.status ?? 'Active',
    };
    setMachines((prev) => [neu, ...prev]);
    return neu;
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
    await serviceService.updateTicketStatus(id, codeMap[to] ?? 'open');
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
    setService((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addDocument: Store['addDocument'] = async (d) => {
    const row: DocumentItem = {
      id: d.id ?? `doc-${Date.now()}`,
      salesCaseId: d.salesCaseId,
      companyId: d.companyId,
      type: d.type,
      fileName: d.fileName,
      uploadedBy: d.uploadedBy ?? user?.id ?? '',
      uploadedAt: d.uploadedAt ?? new Date().toISOString().slice(0, 10),
      size: d.size,
      fileId: d.fileId,
      mimeType: d.mimeType,
    };
    setDocuments((prev) => [row, ...prev.filter((x) => x.id !== row.id)]);
    return row;
  };

  const value = useMemo<Store>(
    () => ({
      customers,
      cases,
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
      loading,
      addContact,
      updateContact,
      deleteContact,
      addActivity,
      addProduct,
      updateProduct,
      deleteProduct,
      addCustomer,
      addCase,
      addOffer,
      createQuoteFull,
      addNoteTemplate,
      deleteNoteTemplate,
      addStock,
      updateStockStatus,
      moveCase,
      markCaseLost,
      moveService,
      updateService,
      addService,
      addMachine,
      addDocument,
      refresh: fetchAll,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, cases, service, offers, noteTemplates, stock, products, activities, contacts, users, machines, payments, documents, loading]
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
