import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  serviceTickets,
  serviceComplaintIntakes,
  serviceWarrantyClaims,
  serviceWarrantyParts,
  installationJobs,
  shipments,
  shipmentItems,
  deliveries,
} from '../../db/schema/service';
import { serviceTicketStatuses, installationStatuses, shipmentStatuses, inventoryStatuses, productTypes, units, pipelineStages, opportunityStatuses, stockLocationStatuses, currencies } from '../../db/schema/lookup';
import { companies, companyAddresses, companyEmails, companyPhones, contactCompanies, contacts } from '../../db/schema/companies';
import { opportunities, opportunityStageHistory } from '../../db/schema/crm';
import { customerDevices, inventoryItems, inventoryMovements, warehouses } from '../../db/schema/inventory';
import { salesOrders, salesOrderItems } from '../../db/schema/orders';
import { brands, productModels, productSpecs } from '../../db/schema/products';
import { quotes } from '../../db/schema/quotes';
import { users as usersTable } from '../../db/schema/users';
import { divisions } from '../../db/schema/tenants';
import { DB } from '../../shared/database/database.module';
import {
  paginationSchema,
  type Pagination,
  shipmentCreateSchema,
  shipmentStartSchema,
  shipmentStatusUpdateSchema,
  deliveryCreateSchema,
  deliveryUpdateSchema,
  deliveryStatusUpdateSchema,
  installationFormDataSchema,
  INSTALLATION_FORM_DEFAULT_CHECKS,
  type ShipmentItemInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { resourceCompanyPortfolioFilter, resourceDivisionFilter, resolveAssignedResourceDivision } from '../../shared/utils/division-scope';
import { companyVisibilityExistsFilter, companyVisibilityFilter } from '../../shared/utils/company-visibility';
import { buildServiceFormPdf, type ServiceFormPdfData, type ServiceFormType, type ServiceResponsibility } from './service-form-pdf';
import { nextSeriesDocumentNo, normalizeSeriesDocumentNo, resolveBusinessLine } from '../../shared/utils/document-series';

const ticketCreate = z.object({
  ticketNo: z.string().min(1).max(64).optional(),
  divisionId: z.string().uuid().optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  customerDeviceId: z.string().optional(),
  subject: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  severity: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  ticketType: z.enum(['complaint', 'request', 'warranty_claim', 'question']).default('complaint'),
  source: z.enum(['manual', 'phone', 'email', 'whatsapp', 'portal', 'web', 'qr']).default('manual'),
  assignedToUserId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const serviceStageSchema = z.enum([
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
]);
const serviceQuoteSchema = z.object({
  quoteNo: z.string().trim().min(1).max(128),
  date: z.string().trim().min(1).max(32),
  validity: z.string().trim().min(1).max(64),
  writerName: z.string().trim().min(1).max(255),
  writerTitle: z.string().trim().max(255).optional(),
  writerEmail: z.string().trim().max(320).optional(),
  company: z.string().trim().min(1).max(500),
  contact: z.string().trim().max(255).optional(),
  mobile: z.string().trim().max(64).optional(),
  phone: z.string().trim().max(64).optional(),
  address: z.string().trim().max(1000).optional(),
  email: z.string().trim().max(320).optional(),
  subject: z.string().trim().min(1).max(4000),
  currency: z.enum(['USD', 'EUR', 'TRY']),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  vatAmount: z.coerce.number().min(0).max(1_000_000_000).optional(),
  noteVariantKey: z.string().trim().max(128).optional(),
  notes: z.array(z.string().trim().max(2000)).max(50).optional(),
  items: z.array(z.object({
    id: z.string().trim().max(128).optional(),
    productModelId: z.string().uuid().optional().nullable(),
    stockCode: z.string().trim().max(64).optional().nullable(),
    description: z.string().trim().min(1).max(1000),
    quantity: z.coerce.number().positive().max(100_000),
    unit: z.string().trim().min(1).max(32),
    unitPrice: z.coerce.number().min(0).max(1_000_000_000),
  })).min(1).max(60),
  savedAt: z.string().trim().max(64).optional(),
}).passthrough();
const serviceCompletionPartSchema = z.object({
  id: z.string().trim().min(1).max(128),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(100_000),
  unitPrice: z.coerce.number().min(0).max(1_000_000_000),
}).passthrough();
const serviceCompletionFormSchema = z.object({
  formNo: z.string().trim().max(64).optional(),
  teslimTarihi: z.string().trim().max(32).optional(),
  kurulumTarihi: z.string().trim().max(32).optional(),
  tezgah: z.object({
    marka: z.string().trim().max(255).optional(),
    tip: z.string().trim().max(255).optional(),
    model: z.string().trim().max(255).optional(),
    seriNo: z.string().trim().max(255).optional(),
  }).passthrough().optional(),
  cnc: z.object({
    marka: z.string().trim().max(255).optional(),
    model: z.string().trim().max(255).optional(),
    seriNo: z.string().trim().max(255).optional(),
    mainSw: z.string().trim().max(255).optional(),
  }).passthrough().optional(),
  kullanici: z.object({
    firma: z.string().trim().max(255).optional(),
    ilgili: z.string().trim().max(255).optional(),
    adres: z.string().trim().max(1000).optional(),
    telefon: z.string().trim().max(64).optional(),
    faks: z.string().trim().max(64).optional(),
    gsm: z.string().trim().max(64).optional(),
    eposta: z.string().trim().max(320).optional(),
    vergiDairesi: z.string().trim().max(255).optional(),
    vergiNo: z.string().trim().max(64).optional(),
  }).passthrough().optional(),
  checks: z.array(z.object({
    id: z.string().max(128),
    label: z.string().max(500),
    status: z.enum(['done', 'not_done', 'na']),
    note: z.string().max(1000).optional(),
    custom: z.boolean().optional(),
  }).passthrough()).max(50).optional(),
  musteriSikayeti: z.string().trim().max(4000).optional(),
  serviceType: z.enum(['montaj', 'ariza', 'periyodik']).optional(),
  responsibility: z.enum(['ucretli', 'garanti', 'bakim']).optional(),
  yapilanIsler: z.string().trim().max(8000).optional(),
  notlar: z.string().trim().max(4000).optional(),
  degisenParcalar: z.array(serviceCompletionPartSchema).max(60).optional(),
  servisUcreti: z.coerce.number().min(0).max(1_000_000_000).optional(),
  ulasimUcreti: z.coerce.number().min(0).max(1_000_000_000).optional(),
  currency: z.enum(['USD', 'EUR', 'TRY']).optional(),
  kurulumuYapan: z.string().trim().max(255).optional(),
  teslimAlan: z.string().trim().max(255).optional(),
  signedAt: z.string().trim().max(64).optional(),
  signedByUserId: z.string().uuid().optional(),
}).passthrough();
const serviceCompletionCloseSchema = serviceCompletionFormSchema.extend({
  serviceType: z.enum(['montaj', 'ariza', 'periyodik']),
  responsibility: z.enum(['ucretli', 'garanti', 'bakim']),
  yapilanIsler: z.string().trim().min(1).max(8000),
  kurulumuYapan: z.string().trim().min(1).max(255),
  teslimAlan: z.string().trim().min(1).max(255),
  signedAt: z.string().trim().min(1).max(64),
});

const validateTicketMetadata = (metadata: Record<string, unknown> | undefined, businessLine?: 'CNC' | 'UNI' | 'SACISLE') => {
  if (!metadata) return metadata;
  let normalized = metadata;
  if (Object.prototype.hasOwnProperty.call(metadata, 'completionForm') && metadata.completionForm !== null) {
    const parsed = serviceCompletionFormSchema.safeParse(metadata.completionForm);
    if (!parsed.success) {
      throw new ValidationError('Servis tamamlandı formundaki alanlar geçersiz', {
        field: 'metadata.completionForm',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    normalized = { ...normalized, completionForm: parsed.data };
  }
  const quote = normalized.serviceQuote;
  if (businessLine && quote && typeof quote === 'object' && !Array.isArray(quote)) {
    const quoteRecord = quote as Record<string, unknown>;
    if (typeof quoteRecord.quoteNo === 'string' && quoteRecord.quoteNo.trim()) {
      normalized = {
        ...normalized,
        serviceQuote: { ...quoteRecord, quoteNo: normalizeSeriesDocumentNo(quoteRecord.quoteNo, businessLine) },
      };
    }
  }
  return normalized;
};
const ticketStatus = z.object({ statusCode: z.string(), serviceStage: serviceStageSchema.optional() });
const ticketUpdate = z.object({
  description: z.string().max(4000).optional(),
  resolutionNote: z.string().max(4000).optional(),
  severity: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  // Kaynak (source) değiştirilmez; tip sonradan yeniden sınıflandırılabilir.
  ticketType: z.enum(['complaint', 'request', 'warranty_claim', 'question']).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const shipmentCompanyOptionsQuery = z.object({
  purpose: z.enum(['sender', 'carrier']).default('sender'),
  transportMode: z.enum(['road', 'air', 'sea', 'local_cargo']).optional(),
  search: z.string().max(128).optional(),
});

const currencySchema = z.enum(['USD', 'EUR', 'TRY']);
const warrantyStatusSchema = z.enum(['draft', 'submitted', 'approved', 'rejected', 'rma_in_progress', 'closed']);
const warrantyUpdate = z.object({
  failureCategory: z.string().max(128).optional().nullable(),
  technicianAssessment: z.string().max(4000).optional().nullable(),
  rmaNo: z.string().max(128).optional().nullable(),
  supplierName: z.string().max(255).optional().nullable(),
  supplierRmaStatus: z.string().max(64).optional().nullable(),
  costAmount: z.coerce.number().min(0).optional().nullable(),
  costCurrency: currencySchema.optional(),
  customerChargeAmount: z.coerce.number().min(0).optional().nullable(),
  customerChargeCurrency: currencySchema.optional(),
  status: warrantyStatusSchema.optional(),
});
const warrantyPartsUpdate = z.object({
  parts: z.array(z.object({
    id: z.string().uuid().optional(),
    productModelId: z.string().uuid().optional().nullable(),
    inventoryItemId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).max(1000),
    quantity: z.coerce.number().int().min(1).max(100000),
    actionType: z.enum(['replace', 'repair', 'return', 'investigate']).default('replace'),
    source: z.enum(['stock', 'supplier', 'customer', 'service']).default('stock'),
    supplierRmaStatus: z.string().max(64).optional().nullable(),
    chargeToCustomer: z.coerce.boolean().default(false),
    unitCost: z.coerce.number().min(0).optional().nullable(),
    currency: currencySchema.default('USD'),
    notes: z.string().max(2000).optional().nullable(),
  })).max(100),
});
const warrantyDecision = z.object({
  decisionNote: z.string().max(4000).optional(),
});
const warrantySubmit = z.object({
  note: z.string().max(4000).optional(),
});

const installCreate = z.object({
  divisionId: z.string().uuid().optional(),
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  customerDeviceId: z.string().optional(),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  scheduledDate: z.coerce.date().optional(),
  assignedToUserId: z.string().optional(),
  location: z.string().max(255).optional(),
  locationType: z.enum(['istanbul_ici', 'istanbul_disi']).optional(),
  durationMinutes: z.coerce.number().int().min(0).max(100000).optional(),
  notes: z.string().max(2000).optional(),
  formData: installationFormDataSchema.optional(),
});
const installUpdate = z.object({
  divisionId: z.string().uuid().optional(),
  opportunityId: z.string().optional().nullable(),
  quoteId: z.string().optional().nullable(),
  customerDeviceId: z.string().optional().nullable(),
  companyId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  scheduledDate: z.coerce.date().optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  locationType: z.enum(['istanbul_ici', 'istanbul_disi']).optional().nullable(),
  durationMinutes: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  formData: installationFormDataSchema.optional().nullable(),
});
const installStatusUpdate = z.object({
  statusCode: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
  installationDate: z.coerce.date().optional(),
  formData: installationFormDataSchema.optional(),
});

const assertInstallationCompletionReady = (formData: z.infer<typeof installationFormDataSchema> | null | undefined) => {
  if (!formData) {
    throw new ValidationError('Kurulumu tamamlamadan önce Kurulum Tutanağı doldurulmalıdır', { field: 'formData' });
  }
  if (typeof formData.problem?.hasProblem !== 'boolean') {
    throw new ValidationError('Kurulumu tamamlamadan önce "Problem var mı?" alanı işaretlenmelidir', {
      field: 'formData.problem.hasProblem',
    });
  }
  const checks = formData.checks ?? [];
  const missing = INSTALLATION_FORM_DEFAULT_CHECKS.filter((required) => {
    const row = checks.find((check) => check.id === required.id || check.label === required.label);
    return row?.status !== 'done' && row?.status !== 'not_done';
  });
  if (missing.length > 0) {
    throw new ValidationError('Kurulum kontrol çizelgesindeki tüm standart satırlar işaretlenmelidir', {
      field: 'formData.checks',
      missing: missing.map((row) => row.label),
    });
  }
};

const formDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const formText = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const recordField = (record: Record<string, unknown>, key: string): Record<string, unknown> =>
  isRecord(record[key]) ? record[key] : {};

const textField = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const numberField = (record: Record<string, unknown>, key: string): number | undefined => {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const recordArrayField = (record: Record<string, unknown>, key: string): Record<string, unknown>[] =>
  Array.isArray(record[key]) ? record[key].filter(isRecord) : [];

const firstText = (...values: Array<string | null | undefined>) =>
  values.find((value) => typeof value === 'string' && value.trim())?.trim();

const formatTrDate = (value: Date | string | number | null | undefined) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString('tr-TR');
};

// Sevkiyat/teslimat doğrulama şemaları @haksan/shared'a taşındı (shipment.ts).
// Eski kayıtlarda origin/destination/eta `notes` içine JSON gömülüydü; aşağıdaki
// tip + decode helper yalnızca o legacy satırları okurken kullanılır.
type ShipmentMeta = { origin?: string; destination?: string; eta?: string; notes?: string };

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class ServiceController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private async tenantHasActiveDivisions(actor: AuthContext): Promise<boolean> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(divisions)
      .where(and(eq(divisions.tenantId, actor.tenantId), eq(divisions.isActive, true)));
    return (row?.count ?? 0) > 0;
  }

  private async markOpportunityDeliveredFromInstallation(job: typeof installationJobs.$inferSelect, user: AuthContext) {
    if (!job.opportunityId) return false;
    const [opp] = await this.db
      .select({
        id: opportunities.id,
        currentStageId: opportunities.currentStageId,
        closedAt: opportunities.closedAt,
      })
      .from(opportunities)
      .where(and(eq(opportunities.id, job.opportunityId), eq(opportunities.tenantId, user.tenantId), isNull(opportunities.deletedAt)))
      .limit(1);
    if (!opp || opp.closedAt) return false;

    const currentStage = await this.db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.id, opp.currentStageId),
    });
    if (currentStage?.code !== 'installation') return false;

    const deliveredStage = await this.db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.code, 'delivered'),
    });
    if (!deliveredStage) return false;

    const won = await this.db.query.opportunityStatuses.findFirst({
      where: eq(opportunityStatuses.code, 'won'),
    });

    const patch: Partial<typeof opportunities.$inferInsert> = {
      currentStageId: deliveredStage.id,
      updatedBy: user.userId,
    };
    if (won?.id) patch.statusId = won.id;
    await this.db.update(opportunities).set(patch).where(eq(opportunities.id, opp.id));

    await this.db.insert(opportunityStageHistory).values({
      tenantId: user.tenantId,
      opportunityId: opp.id,
      fromStageId: currentStage.id,
      toStageId: deliveredStage.id,
      changedBy: user.userId,
      changeReason: 'Kurulum tamamlandı',
    });

    return true;
  }

  private async assertCompany(companyId: string, tenantId: string) {
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private expectedCarrierSector(transportMode?: string | null) {
    if (!transportMode) return null;
    return transportMode === 'local_cargo' ? 'Yerel Kargo' : 'Nakliye / Lojistik';
  }

  private async assertCarrierCompany(companyId: string, tenantId: string, transportMode?: string | null) {
    const company = await this.assertCompany(companyId, tenantId);
    const expectedSector = this.expectedCarrierSector(transportMode);
    if (expectedSector && company.sector !== expectedSector) {
      throw new ValidationError(`Taşıyıcı firma sektörü "${expectedSector}" olmalıdır`, { field: 'carrierCompanyId' });
    }
    return company;
  }

  private async assertContact(contactId: string, tenantId: string, companyId?: string | null) {
    const contact = await this.db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)),
    });
    if (!contact) throw new NotFoundError('Kontak');
    if (companyId) {
      const [link] = await this.db
        .select({ contactId: contactCompanies.contactId })
        .from(contactCompanies)
        .where(and(eq(contactCompanies.contactId, contactId), eq(contactCompanies.companyId, companyId)))
        .limit(1);
      if (contact.companyId !== companyId && !link) throw new ValidationError('Kontak seçilen firmaya ait değil');
    }
    return contact;
  }

  private async assertOpportunity(opportunityId: string, tenantId: string, companyId?: string | null) {
    const opportunity = await this.db.query.opportunities.findFirst({
      where: and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, tenantId), isNull(opportunities.deletedAt)),
    });
    if (!opportunity) throw new NotFoundError('Fırsat');
    if (companyId && opportunity.companyId !== companyId) throw new ValidationError('Fırsat seçilen firmaya ait değil');
    return opportunity;
  }

  private async assertQuote(quoteId: string, tenantId: string, companyId?: string | null, opportunityId?: string | null) {
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId), isNull(quotes.deletedAt)),
    });
    if (!quote) throw new NotFoundError('Teklif');
    if (companyId && quote.companyId !== companyId) throw new ValidationError('Teklif seçilen firmaya ait değil');
    if (opportunityId && quote.opportunityId !== opportunityId) {
      throw new ValidationError('Teklif seçilen fırsata ait değil');
    }
    return quote;
  }

  private async assertCustomerDevice(deviceId: string, tenantId: string, companyId?: string | null) {
    const device = await this.db.query.customerDevices.findFirst({
      where: and(eq(customerDevices.id, deviceId), eq(customerDevices.tenantId, tenantId), isNull(customerDevices.deletedAt)),
    });
    if (!device) throw new NotFoundError('Müşteri cihazı');
    if (companyId && device.companyId !== companyId) throw new ValidationError('Müşteri cihazı seçilen firmaya ait değil');
    return device;
  }

  private async assertScopedCompany(companyId: string, actor: AuthContext, resource = 'service_tickets') {
    const visibility = await companyVisibilityFilter(this.db, actor);
    const company = await this.db.query.companies.findFirst({
      where: and(
        eq(companies.id, companyId),
        eq(companies.tenantId, actor.tenantId),
        isNull(companies.deletedAt),
        resourceCompanyPortfolioFilter(actor, resource, companies.id) ?? sql`true`,
        visibility ?? sql`true`
      ),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private async assertScopedCustomerDevice(deviceId: string, actor: AuthContext, companyId?: string | null, resource = 'customer_devices') {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, customerDevices.companyId);
    const device = await this.db.query.customerDevices.findFirst({
      where: and(
        eq(customerDevices.id, deviceId),
        eq(customerDevices.tenantId, actor.tenantId),
        isNull(customerDevices.deletedAt),
        resourceDivisionFilter(actor, resource, customerDevices.divisionId) ?? sql`true`,
        visibility ?? sql`true`
      ),
    });
    if (!device) throw new NotFoundError('Müşteri cihazı');
    if (companyId && device.companyId !== companyId) throw new ValidationError('Müşteri cihazı seçilen firmaya ait değil');
    return device;
  }

  private cleanNullableText(value: string | null | undefined) {
    const text = value?.trim();
    return text ? text : null;
  }

  private moneyValue(value: number | null | undefined) {
    return value === null || value === undefined ? null : value.toString();
  }

  private coverageSuggestion(device?: { warrantyStartDate: Date | null; warrantyEndDate: Date | null } | null) {
    if (!device?.warrantyEndDate) return 'unknown';
    const now = Date.now();
    const start = device.warrantyStartDate?.getTime();
    const end = device.warrantyEndDate.getTime();
    if (start && start > now) return 'unknown';
    return end >= now ? 'in_warranty' : 'out_of_warranty';
  }

  private async getScopedTicket(id: string, user: AuthContext) {
    const visibility = await companyVisibilityExistsFilter(this.db, user, serviceTickets.companyId);
    const ticket = await this.db.query.serviceTickets.findFirst({
      where: and(
        eq(serviceTickets.id, id),
        eq(serviceTickets.tenantId, user.tenantId),
        isNull(serviceTickets.deletedAt),
        resourceDivisionFilter(user, 'service_tickets', serviceTickets.divisionId) ?? sql`true`,
        visibility ?? sql`true`
      ),
    });
    if (!ticket) throw new NotFoundError('Servis kaydı');
    return ticket;
  }

  private async buildServiceForm(id: string, user: AuthContext): Promise<{ buffer: Buffer; filename: string }> {
    const ticket = await this.getScopedTicket(id, user);
    const metadata = isRecord(ticket.metadata) ? ticket.metadata : {};
    const completionForm = recordField(metadata, 'completionForm');
    const completionUser = recordField(completionForm, 'kullanici');
    const completionMachine = recordField(completionForm, 'tezgah');
    const completionCnc = recordField(completionForm, 'cnc');

    const [company, contact, addresses, phones, emails, assignee, warrantyClaim] = await Promise.all([
      this.db.query.companies.findFirst({
        where: and(eq(companies.id, ticket.companyId), eq(companies.tenantId, user.tenantId), isNull(companies.deletedAt)),
      }),
      ticket.contactId
        ? this.db.query.contacts.findFirst({
            where: and(eq(contacts.id, ticket.contactId), eq(contacts.tenantId, user.tenantId), isNull(contacts.deletedAt)),
          })
        : Promise.resolve(null),
      this.db
        .select()
        .from(companyAddresses)
        .where(and(eq(companyAddresses.companyId, ticket.companyId), eq(companyAddresses.tenantId, user.tenantId), isNull(companyAddresses.deletedAt)))
        .orderBy(desc(companyAddresses.isDefault), asc(companyAddresses.createdAt))
        .limit(3),
      this.db
        .select()
        .from(companyPhones)
        .where(and(eq(companyPhones.companyId, ticket.companyId), eq(companyPhones.tenantId, user.tenantId), isNull(companyPhones.deletedAt)))
        .orderBy(desc(companyPhones.isDefault), asc(companyPhones.createdAt))
        .limit(5),
      this.db
        .select()
        .from(companyEmails)
        .where(and(eq(companyEmails.companyId, ticket.companyId), eq(companyEmails.tenantId, user.tenantId), isNull(companyEmails.deletedAt)))
        .orderBy(desc(companyEmails.isDefault), asc(companyEmails.createdAt))
        .limit(5),
      ticket.assignedToUserId
        ? this.db.query.users.findFirst({
            where: and(eq(usersTable.id, ticket.assignedToUserId), eq(usersTable.tenantId, user.tenantId), isNull(usersTable.deletedAt)),
          })
        : Promise.resolve(null),
      this.findWarrantyClaim(ticket.id, user.tenantId),
    ]);

    const [deviceRow] = ticket.customerDeviceId
      ? await this.db
          .select({
            device: customerDevices,
            serialNumber: inventoryItems.serialNumber,
            controlUnit: inventoryItems.controlUnit,
            controlUnitSerialNumber: inventoryItems.controlUnitSerialNumber,
            modelCode: productModels.modelCode,
            modelName: productModels.modelName,
            brandName: brands.name,
            productTypeName: productTypes.name,
          })
          .from(customerDevices)
          .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
          .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
          .leftJoin(brands, eq(productModels.brandId, brands.id))
          .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
          .where(and(eq(customerDevices.id, ticket.customerDeviceId), eq(customerDevices.tenantId, user.tenantId), isNull(customerDevices.deletedAt)))
          .limit(1)
      : [null];

    const warrantyParts = warrantyClaim
      ? await this.db
          .select()
          .from(serviceWarrantyParts)
          .where(and(eq(serviceWarrantyParts.warrantyClaimId, warrantyClaim.id), eq(serviceWarrantyParts.tenantId, user.tenantId), isNull(serviceWarrantyParts.deletedAt)))
          .orderBy(asc(serviceWarrantyParts.createdAt))
      : [];

    const defaultAddress = addresses[0];
    const addressText = defaultAddress
      ? firstText(
          defaultAddress.fullAddress,
          [
            defaultAddress.street,
            defaultAddress.buildingNumber,
            defaultAddress.locality,
            defaultAddress.district,
            defaultAddress.province,
            defaultAddress.country,
          ].filter(Boolean).join(' ')
        )
      : undefined;
    const faxPhone = phones.find((phone) => ['fax', 'faks'].includes((phone.phoneType ?? '').toLocaleLowerCase('tr-TR')));
    const mainPhone = phones.find((phone) => phone.id !== faxPhone?.id);
    const mainEmail = emails[0];

    const operations = recordArrayField(metadata, 'operations');
    const partOperations = operations.filter((operation) => {
      const description = textField(operation, 'description')?.toLocaleLowerCase('tr-TR') ?? '';
      return textField(operation, 'kind') === 'part'
        || textField(operation, 'id')?.startsWith('srv-part-')
        || description.startsWith('parça kullanımı:');
    });
    const workOperations = operations.filter((operation) => !partOperations.includes(operation));
    const workText = textField(completionForm, 'yapilanIsler');
    const noteText = textField(completionForm, 'notlar');
    const operationLines = workText || noteText
      ? [workText, noteText].filter((value): value is string => Boolean(value))
      : [
          ...workOperations.map((operation) => textField(operation, 'description')).filter((value): value is string => Boolean(value)),
          ticket.resolutionNote ?? undefined,
        ].filter((value): value is string => Boolean(value));

    const operationParts = partOperations.map((operation) => {
      const quantity = numberField(operation, 'quantity') ?? 1;
      const unitPrice = numberField(operation, 'unitPrice') ?? 0;
      return {
        name: textField(operation, 'description')?.replace(/^Parça kullanımı:\s*/i, ''),
        quantity: quantity ? String(quantity) : undefined,
        unitPrice: unitPrice || undefined,
        amount: quantity && unitPrice ? quantity * unitPrice : undefined,
      };
    });
    const warrantyFormParts = warrantyParts.map((part) => {
      const quantity = Number(part.quantity ?? 1);
      const unitPrice = part.unitCost === null || part.unitCost === undefined ? 0 : Number(part.unitCost);
      return {
        name: part.description,
        quantity: quantity ? String(quantity) : undefined,
        unitPrice: unitPrice || undefined,
        amount: quantity && unitPrice ? quantity * unitPrice : undefined,
      };
    });
    const hasCompletionParts = Array.isArray(completionForm.degisenParcalar);
    const completionParts = recordArrayField(completionForm, 'degisenParcalar').map((part) => {
      const quantity = numberField(part, 'quantity') ?? 1;
      const unitPrice = numberField(part, 'unitPrice') ?? 0;
      return {
        name: textField(part, 'description'),
        quantity: quantity ? String(quantity) : undefined,
        unitPrice: unitPrice || undefined,
        amount: quantity && unitPrice ? quantity * unitPrice : undefined,
      };
    });
    const parts = hasCompletionParts ? completionParts : [...operationParts, ...warrantyFormParts];

    const serviceText = [ticket.subject, ticket.description, workText]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('tr-TR');
    const explicitServiceType = textField(completionForm, 'serviceType');
    const serviceType: ServiceFormType | undefined =
      explicitServiceType === 'montaj' || explicitServiceType === 'ariza' || explicitServiceType === 'periyodik'
        ? explicitServiceType
        : serviceText.includes('periyodik') || serviceText.includes('bakım')
        ? 'periyodik'
        : serviceText.includes('montaj') || serviceText.includes('kurulum')
          ? 'montaj'
          : ticket.ticketType === 'complaint' || ticket.ticketType === 'warranty_claim'
            ? 'ariza'
            : undefined;

    const explicitResponsibility = textField(completionForm, 'responsibility');
    const responsibility: ServiceResponsibility | undefined =
      explicitResponsibility === 'ucretli' || explicitResponsibility === 'garanti' || explicitResponsibility === 'bakim'
        ? explicitResponsibility
        : warrantyClaim?.coverageDecision === 'approved'
        ? 'garanti'
        : warrantyClaim?.coverageDecision === 'rejected'
          ? 'ucretli'
          : serviceText.includes('bakım anl')
            ? 'bakim'
            : undefined;

    const timerSeconds = numberField(metadata, 'timerElapsedSeconds') ?? 0;
    const hourlyRate = numberField(metadata, 'serviceHourlyRate') ?? 0;
    const serviceFee = numberField(completionForm, 'servisUcreti')
      ?? (timerSeconds > 0 && hourlyRate > 0 ? (timerSeconds / 3600) * hourlyRate : null);
    const travelFee = numberField(completionForm, 'ulasimUcreti')
      ?? numberField(metadata, 'travelFee')
      ?? numberField(metadata, 'serviceTravelFee')
      ?? null;
    const currencyText = firstText(textField(completionForm, 'currency'), textField(metadata, 'serviceCurrency'));
    const currency = currencyText === 'USD' || currencyText === 'EUR' || currencyText === 'TRY' ? currencyText : 'TRY';

    const data: ServiceFormPdfData = {
      company: firstText(textField(completionUser, 'firma'), company?.shortName, company?.legalTitle),
      contact: firstText(textField(completionUser, 'ilgili'), contact?.fullName),
      address: firstText(textField(completionUser, 'adres'), addressText),
      phone: firstText(textField(completionUser, 'telefon'), contact?.workPhone, mainPhone?.phone),
      fax: firstText(textField(completionUser, 'faks'), faxPhone?.phone),
      mobile: firstText(textField(completionUser, 'gsm'), contact?.mobilePhone, contact?.otherPhone),
      email: firstText(textField(completionUser, 'eposta'), contact?.workEmail, mainEmail?.email),
      taxOffice: firstText(textField(completionUser, 'vergiDairesi'), company?.taxOffice),
      taxNumber: firstText(textField(completionUser, 'vergiNo'), company?.taxNumber),
      formNo: firstText(textField(completionForm, 'formNo'), ticket.ticketNo, ticket.id) ?? ticket.id,
      date: formatTrDate(firstText(textField(completionForm, 'kurulumTarihi'), textField(completionForm, 'signedAt')) ?? ticket.resolvedAt ?? ticket.reportedAt),
      machine: {
        brand: firstText(textField(completionMachine, 'marka'), deviceRow?.brandName),
        type: firstText(textField(completionMachine, 'tip'), deviceRow?.productTypeName),
        model: firstText(textField(completionMachine, 'model'), deviceRow?.modelCode, deviceRow?.modelName),
        serialNo: firstText(textField(completionMachine, 'seriNo'), deviceRow?.serialNumber),
      },
      cnc: {
        brand: firstText(textField(completionCnc, 'marka'), deviceRow?.controlUnit?.split(' ')[0]),
        model: firstText(textField(completionCnc, 'model'), deviceRow?.controlUnit?.split(' ').slice(1).join(' ')),
        serialNo: firstText(textField(completionCnc, 'seriNo'), deviceRow?.controlUnitSerialNumber),
        mainSw: textField(completionCnc, 'mainSw'),
      },
      complaint: firstText(textField(completionForm, 'musteriSikayeti'), ticket.description, ticket.subject),
      serviceType,
      responsibility,
      operations: operationLines,
      parts,
      serviceFee,
      travelFee,
      currency,
      serviceTechnician: firstText(textField(completionForm, 'kurulumuYapan'), assignee?.fullName),
      companyRepresentative: firstText(textField(completionForm, 'teslimAlan'), contact?.fullName),
    };

    const buffer = await buildServiceFormPdf(data);
    const safeNo = data.formNo.replace(/[^a-zA-Z0-9._-]/g, '_');
    return { buffer, filename: `servis-formu-${safeNo}.pdf` };
  }

  private async findWarrantyClaim(serviceTicketId: string, tenantId: string) {
    return this.db.query.serviceWarrantyClaims.findFirst({
      where: and(
        eq(serviceWarrantyClaims.serviceTicketId, serviceTicketId),
        eq(serviceWarrantyClaims.tenantId, tenantId),
        isNull(serviceWarrantyClaims.deletedAt)
      ),
    });
  }

  private async ensureWarrantyClaim(ticket: typeof serviceTickets.$inferSelect) {
    const existing = await this.findWarrantyClaim(ticket.id, ticket.tenantId);
    if (existing) return existing;
    const device = ticket.customerDeviceId
      ? await this.db.query.customerDevices.findFirst({
          where: and(
            eq(customerDevices.id, ticket.customerDeviceId),
            eq(customerDevices.tenantId, ticket.tenantId),
            isNull(customerDevices.deletedAt)
          ),
        })
      : null;
    const [claim] = await this.db
      .insert(serviceWarrantyClaims)
      .values({
        tenantId: ticket.tenantId,
        divisionId: ticket.divisionId ?? null,
        serviceTicketId: ticket.id,
        companyId: ticket.companyId,
        customerDeviceId: ticket.customerDeviceId ?? null,
        warrantyStartSnapshot: device?.warrantyStartDate ?? null,
        warrantyEndSnapshot: device?.warrantyEndDate ?? null,
        coverageSuggestion: this.coverageSuggestion(device),
      })
      .returning();
    return claim;
  }

  private async warrantyResponse(claim: typeof serviceWarrantyClaims.$inferSelect) {
    const parts = await this.db
      .select({
        part: serviceWarrantyParts,
        product: { id: productModels.id, model: productModels.modelCode, modelName: productModels.modelName },
        inventory: { id: inventoryItems.id, serialNumber: inventoryItems.serialNumber },
      })
      .from(serviceWarrantyParts)
      .leftJoin(productModels, eq(serviceWarrantyParts.productModelId, productModels.id))
      .leftJoin(inventoryItems, eq(serviceWarrantyParts.inventoryItemId, inventoryItems.id))
      .where(and(eq(serviceWarrantyParts.warrantyClaimId, claim.id), eq(serviceWarrantyParts.tenantId, claim.tenantId), isNull(serviceWarrantyParts.deletedAt)))
      .orderBy(asc(serviceWarrantyParts.createdAt));
    return {
      ...claim,
      parts: parts.map((row) => ({
        ...row.part,
        product: row.product?.id ? row.product : null,
        inventory: row.inventory?.id ? row.inventory : null,
      })),
    };
  }

  private async assertUser(userId: string, tenantId: string) {
    const user = await this.db.query.users.findFirst({
      where: and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId), isNull(usersTable.deletedAt)),
    });
    if (!user) throw new NotFoundError('Kullanıcı');
    return user;
  }

  private async assertSalesOrder(salesOrderId: string, tenantId: string, companyId?: string | null) {
    const order = await this.db.query.salesOrders.findFirst({
      where: and(eq(salesOrders.id, salesOrderId), eq(salesOrders.tenantId, tenantId), isNull(salesOrders.deletedAt)),
    });
    if (!order) throw new NotFoundError('Satış siparişi');
    if (companyId && order.companyId !== companyId) throw new ValidationError('Satış siparişi seçilen firmaya ait değil');
    return order;
  }

  private async assertInventoryItem(inventoryItemId: string, tenantId: string) {
    const item = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, tenantId), isNull(inventoryItems.deletedAt)),
    });
    if (!item) throw new NotFoundError('Stok kalemi');
    return item;
  }

  private async assertShipment(shipmentId: string, tenantId: string, actor?: AuthContext) {
    const filters = [eq(shipments.id, shipmentId), eq(shipments.tenantId, tenantId), isNull(shipments.deletedAt)];
    if (actor) filters.push(resourceDivisionFilter(actor, 'shipments', shipments.divisionId) ?? sql`true`);
    const shipment = await this.db.query.shipments.findFirst({
      where: and(...filters),
    });
    if (!shipment) throw new NotFoundError('Sevkiyat');
    return shipment;
  }

  private async assertWarehouse(warehouseId: string, tenantId: string) {
    const warehouse = await this.db.query.warehouses.findFirst({
      where: and(eq(warehouses.id, warehouseId), eq(warehouses.tenantId, tenantId), isNull(warehouses.deletedAt)),
    });
    if (!warehouse) throw new NotFoundError('Varış deposu');
    return warehouse;
  }

  private async assertShipmentItemsResolved(shipmentId: string, tenantId: string) {
    const rows = await this.db
      .select({ line: shipmentItems, item: inventoryItems })
      .from(shipmentItems)
      .leftJoin(inventoryItems, eq(shipmentItems.inventoryItemId, inventoryItems.id))
      .where(and(eq(shipmentItems.shipmentId, shipmentId), eq(shipmentItems.tenantId, tenantId), isNull(shipmentItems.deletedAt)))
      .orderBy(shipmentItems.sortOrder);

    if (!rows.length) {
      throw new ValidationError('Sevkiyatı başlatmak için en az bir ürün satırı gerekir', { field: 'items' });
    }

    for (const { line, item } of rows) {
      if (!line.inventoryItemId || !line.serialNumber) {
        throw new ValidationError('Sevkiyat başlatılmadan önce tüm ürün satırlarında seri no seçilmelidir', { field: 'items' });
      }
      if (!item || item.tenantId !== tenantId || item.deletedAt) {
        throw new ValidationError('Sevkiyat satırındaki seri no stok kaydıyla eşleşmiyor', { field: 'items' });
      }
      if (line.productModelId && item.productModelId !== line.productModelId) {
        throw new ValidationError('Sevkiyat satırındaki ürün modeli ve seri no eşleşmiyor', { field: 'items' });
      }
      if (line.serialNumber !== item.serialNumber) {
        throw new ValidationError('Sevkiyat satırındaki seri no stok kaydıyla eşleşmiyor', { field: 'items' });
      }
    }

    return rows.map(({ line, item }) => ({ line, item: item! }));
  }

  /** Sevkiyata çıkan seri-numaralı kalemleri `in_transit/on_road` yapar + `ship` hareketi yazar (idempotent). */
  private async markInventoryInTransit(shipmentId: string, tenantId: string, actorUserId: string, loadingDate: Date) {
    const inTransitId = await lookupIdByCode(this.db, inventoryStatuses, 'in_transit');
    if (!inTransitId) return;
    const onRoadId = await lookupIdByCode(this.db, stockLocationStatuses, 'on_road');
    const resolvedLines = await this.assertShipmentItemsResolved(shipmentId, tenantId);
    for (const { item } of resolvedLines) {
      await this.db
        .update(inventoryItems)
        .set({
          stockStatusId: inTransitId,
          locationStatusId: onRoadId,
          loadingDate,
        })
        .where(eq(inventoryItems.id, item.id));

      const existingMove = await this.db.query.inventoryMovements.findFirst({
        where: and(
          eq(inventoryMovements.tenantId, tenantId),
          eq(inventoryMovements.inventoryItemId, item.id),
          eq(inventoryMovements.movementType, 'ship'),
          eq(inventoryMovements.referenceType, 'shipment'),
          eq(inventoryMovements.referenceId, shipmentId),
        ),
      });
      if (existingMove) continue;
      await this.db.insert(inventoryMovements).values({
        tenantId,
        divisionId: item.divisionId,
        inventoryItemId: item.id,
        fromWarehouseId: item.warehouseId ?? null,
        movementType: 'ship',
        movementDate: loadingDate,
        referenceType: 'shipment',
        referenceId: shipmentId,
        notes: 'Sevkiyata çıkış',
        createdBy: actorUserId,
      });
    }
  }

  private async receiveShipmentInventory(
    shipmentId: string,
    tenantId: string,
    destinationWarehouseId: string,
    arrivalDate: Date,
    actorUserId: string
  ) {
    await this.assertWarehouse(destinationWarehouseId, tenantId);
    const availableId = await lookupIdByCode(this.db, inventoryStatuses, 'available');
    const atWarehouseId = await lookupIdByCode(this.db, stockLocationStatuses, 'at_warehouse');
    const resolvedLines = await this.assertShipmentItemsResolved(shipmentId, tenantId);
    for (const { item } of resolvedLines) {
      await this.db
        .update(inventoryItems)
        .set({
          stockStatusId: availableId,
          locationStatusId: atWarehouseId,
          warehouseId: destinationWarehouseId,
          arrivalDate,
          reservedCompanyId: null,
          reservedAt: null,
        })
        .where(eq(inventoryItems.id, item.id));

      const existingMove = await this.db.query.inventoryMovements.findFirst({
        where: and(
          eq(inventoryMovements.tenantId, tenantId),
          eq(inventoryMovements.inventoryItemId, item.id),
          eq(inventoryMovements.movementType, 'receive'),
          eq(inventoryMovements.referenceType, 'shipment'),
          eq(inventoryMovements.referenceId, shipmentId),
        ),
      });
      if (existingMove) continue;
      await this.db.insert(inventoryMovements).values({
        tenantId,
        divisionId: item.divisionId,
        inventoryItemId: item.id,
        fromWarehouseId: item.warehouseId ?? null,
        toWarehouseId: destinationWarehouseId,
        movementType: 'receive',
        movementDate: arrivalDate,
        referenceType: 'shipment',
        referenceId: shipmentId,
        notes: 'Sevkiyat varış deposuna alındı',
        createdBy: actorUserId,
      });
    }
  }

  /** Sevkiyat satır kalemlerini ekler; start anına kadar seri no seçimi eksik kalabilir. */
  private async insertShipmentItems(shipmentId: string, tenantId: string, _companyId: string | null, items: ShipmentItemInput[]) {
    for (const item of items) {
      let serialNumber = item.serialNumber ?? null;
      let inventoryItemId = item.inventoryItemId ?? null;
      if (item.inventoryItemId) {
        const inv = await this.assertInventoryItem(item.inventoryItemId, tenantId);
        if (item.productModelId && inv.productModelId !== item.productModelId) {
          throw new ValidationError('Sevkiyat satırındaki ürün modeli ve seri no eşleşmiyor', { field: 'items' });
        }
        if (serialNumber && serialNumber !== inv.serialNumber) {
          throw new ValidationError('Sevkiyat satırındaki seri no stok kaydıyla eşleşmiyor', { field: 'items' });
        }
        serialNumber = serialNumber ?? inv.serialNumber;
      } else if (serialNumber) {
        // Serbest girilen seri no envanterde varsa otomatik bağlanır; yoksa snapshot metin olarak
        // saklanır (henüz stoğa girmemiş gelen sevkiyat kalemleri için elle giriş desteklenir).
        const inv = await this.db.query.inventoryItems.findFirst({
          where: and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.serialNumber, serialNumber), isNull(inventoryItems.deletedAt)),
        });
        if (inv) {
          if (item.productModelId && inv.productModelId !== item.productModelId) {
            throw new ValidationError('Sevkiyat satırındaki ürün modeli ve seri no eşleşmiyor', { field: 'items' });
          }
          inventoryItemId = inv.id;
          serialNumber = inv.serialNumber;
        }
      }
      const unitId = await lookupIdByCode(this.db, units, item.unitCode);
      await this.db.insert(shipmentItems).values({
        tenantId,
        shipmentId,
        inventoryItemId,
        salesOrderItemId: item.salesOrderItemId ?? null,
        productModelId: item.productModelId ?? null,
        description: item.description,
        serialNumber,
        quantity: item.quantity.toString(),
        unitId,
        sortOrder: item.sortOrder,
        packageCount: item.packageCount ?? null,
        palletCount: item.palletCount ?? null,
        packageLengthCm: this.moneyValue(item.packageLengthCm),
        packageWidthCm: this.moneyValue(item.packageWidthCm),
        packageHeightCm: this.moneyValue(item.packageHeightCm),
        grossWeightKg: this.moneyValue(item.grossWeightKg),
        packageNotes: this.cleanNullableText(item.packageNotes),
      });
    }
  }

  /**
   * Seri-numaralı kalemleri "teslim edildi" durumuna geçirir: stok durumunu `sold`
   * yapar, bir `deliver` envanter hareketi yazar ve müşteri cihaz kaydını (garanti
   * için) oluşturur/günceller. Zaten `sold` olan kalemleri atlar (idempotent).
   */
  private async markInventoryDelivered(
    shipmentId: string,
    tenantId: string,
    companyId: string | null,
    deliveryDate: Date,
    referenceType: string,
    referenceId: string,
    actorUserId: string
  ) {
    const soldStatusId = await lookupIdByCode(this.db, inventoryStatuses, 'sold');
    if (!soldStatusId) return;
    const shipment = await this.db.query.shipments.findFirst({
      where: and(eq(shipments.id, shipmentId), eq(shipments.tenantId, tenantId), isNull(shipments.deletedAt)),
    });
    const availableId = await lookupIdByCode(this.db, inventoryStatuses, 'available');
    const reservedId = await lookupIdByCode(this.db, inventoryStatuses, 'reserved');
    const companyFromShipment = shipment?.companyId ?? null;
    const lines = await this.db
      .select()
      .from(shipmentItems)
      .where(and(eq(shipmentItems.shipmentId, shipmentId), eq(shipmentItems.tenantId, tenantId), isNull(shipmentItems.deletedAt)));
    for (const line of lines) {
      const itemIds = await this.pickShipmentInventoryItems({
        tenantId,
        companyId: companyId ?? companyFromShipment,
        inventoryItemId: line.inventoryItemId ?? null,
        productModelId: line.productModelId ?? null,
        quantity: line.quantity,
        reservedId,
        availableId,
      });
      const needsExpansion = !line.inventoryItemId && !!line.productModelId;
      const existingInventoryItemIds = new Set<string>();
      if (needsExpansion && itemIds.length) {
        const existingMappings = await this.db
          .select({ inventoryItemId: shipmentItems.inventoryItemId })
          .from(shipmentItems)
          .where(
            and(
              eq(shipmentItems.shipmentId, shipmentId),
              eq(shipmentItems.tenantId, tenantId),
              inArray(shipmentItems.inventoryItemId, itemIds),
              isNull(shipmentItems.deletedAt),
            ),
          );
        for (const m of existingMappings) {
          if (m.inventoryItemId) existingInventoryItemIds.add(m.inventoryItemId);
        }
      }

      for (const [i, inventoryItemId] of itemIds.entries()) {
        const item = await this.db.query.inventoryItems.findFirst({
          where: and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, tenantId), isNull(inventoryItems.deletedAt)),
        });
        if (!item) continue;

        // Persist per-inventory-item shipment_items mapping for quantity lines too.
        if (needsExpansion && !existingInventoryItemIds.has(item.id)) {
          const unitId = line.unitId ?? null;
          await this.db.insert(shipmentItems).values({
            tenantId,
            shipmentId,
            inventoryItemId: item.id,
            salesOrderItemId: line.salesOrderItemId ?? null,
            productModelId: line.productModelId ?? null,
            description: line.description,
            serialNumber: item.serialNumber,
            quantity: '1',
            unitId,
            sortOrder: line.sortOrder + i,
          });
          existingInventoryItemIds.add(item.id);
        }

        // Satılmış kalemde tekrar "sell" yok; sadece teslimat alanlarını senkronla.
        if (item.stockStatusId !== soldStatusId) {
          await this.db
            .update(inventoryItems)
            .set({ stockStatusId: soldStatusId, arrivalDate: deliveryDate })
            .where(eq(inventoryItems.id, item.id));
        } else if (!item.arrivalDate) {
          await this.db.update(inventoryItems).set({ arrivalDate: deliveryDate }).where(eq(inventoryItems.id, item.id));
        }

        const existingMove = await this.db.query.inventoryMovements.findFirst({
          where: and(
            eq(inventoryMovements.tenantId, tenantId),
            eq(inventoryMovements.inventoryItemId, item.id),
            eq(inventoryMovements.movementType, 'deliver'),
            eq(inventoryMovements.referenceType, referenceType),
            eq(inventoryMovements.referenceId, referenceId),
          ),
        });
        if (!existingMove) {
          await this.db.insert(inventoryMovements).values({
            tenantId,
            inventoryItemId: item.id,
            movementType: 'deliver',
            movementDate: deliveryDate,
            referenceType,
            referenceId,
            notes: 'Teslimat tamamlandı',
            createdBy: actorUserId,
          });
        }

        const deliveryCompanyId = companyId ?? companyFromShipment;
        if (deliveryCompanyId) {
          const existingDevice = await this.db.query.customerDevices.findFirst({
            where: and(eq(customerDevices.inventoryItemId, item.id), eq(customerDevices.tenantId, tenantId), isNull(customerDevices.deletedAt)),
          });
          if (existingDevice) {
            await this.db.update(customerDevices).set({ deliveryDate }).where(eq(customerDevices.id, existingDevice.id));
          } else {
            await this.db.insert(customerDevices).values({
              tenantId,
              companyId: deliveryCompanyId,
              initialCompanyId: deliveryCompanyId,
              inventoryItemId: item.id,
              saleDate: deliveryDate,
              deliveryDate,
            });
          }
        }
      }

      // Hide the original quantity summary line once we have explicit per-serial rows.
      if (needsExpansion && existingInventoryItemIds.size > 0 && line.inventoryItemId === null) {
        await this.db.update(shipmentItems).set({ deletedAt: new Date() }).where(eq(shipmentItems.id, line.id));
      }
    }
  }

  private async pickShipmentInventoryItems(params: {
    tenantId: string;
    companyId: string | null;
    inventoryItemId: string | null;
    productModelId: string | null;
    quantity: string | null;
    reservedId: string | null;
    availableId: string | null;
  }): Promise<string[]> {
    if (params.inventoryItemId) return [params.inventoryItemId];
    if (!params.productModelId) return [];

    const qtyRaw = params.quantity ? Number(params.quantity) : 1;
    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) return [];
    const qty = Math.trunc(qtyRaw);
    if (qty !== qtyRaw) throw new ValidationError('Adet tam sayı olmalı');
    if (qty <= 0) return [];

    const reserved =
      params.reservedId && params.companyId
        ? await this.db
            .select({ id: inventoryItems.id })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.tenantId, params.tenantId),
                eq(inventoryItems.productModelId, params.productModelId),
                isNull(inventoryItems.deletedAt),
                eq(inventoryItems.stockStatusId, params.reservedId),
                eq(inventoryItems.reservedCompanyId, params.companyId),
              ),
            )
            .orderBy(asc(inventoryItems.createdAt))
            .limit(qty)
        : [];

    const remaining = qty - reserved.length;
    const available =
      remaining > 0 && params.availableId
        ? await this.db
            .select({ id: inventoryItems.id })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.tenantId, params.tenantId),
                eq(inventoryItems.productModelId, params.productModelId),
                isNull(inventoryItems.deletedAt),
                eq(inventoryItems.stockStatusId, params.availableId),
              ),
            )
            .orderBy(asc(inventoryItems.createdAt))
            .limit(remaining)
        : [];

    return [...reserved, ...available].map((x) => x.id);
  }

  private decodeShipmentNotes(notes: string | null): ShipmentMeta {
    if (!notes) return {};
    try {
      const parsed = JSON.parse(notes);
      if (parsed?.kind === 'shipment_meta') {
        return {
          origin: parsed.origin ?? undefined,
          destination: parsed.destination ?? undefined,
          eta: parsed.eta ?? undefined,
          notes: parsed.notes ?? undefined,
        };
      }
    } catch {
      // Legacy plain-text notes stay as notes.
    }
    return { notes };
  }

  // ─────── SERVICE TICKETS ───────
  @RequirePermissions('service_tickets.read')
  @Get('service-tickets')
  async listTickets(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const visibility = await companyVisibilityExistsFilter(this.db, user, serviceTickets.companyId);
    const where = and(
      eq(serviceTickets.tenantId, user.tenantId),
      isNull(serviceTickets.deletedAt),
      resourceDivisionFilter(user, 'service_tickets', serviceTickets.divisionId) ?? sql`true`,
      visibility ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(serviceTickets).where(where);
    const rows = await this.db
      .select({
        ticket: serviceTickets,
        status: { id: serviceTicketStatuses.id, code: serviceTicketStatuses.code, name: serviceTicketStatuses.name },
        warrantyClaim: {
          id: serviceWarrantyClaims.id,
          status: serviceWarrantyClaims.status,
          coverageSuggestion: serviceWarrantyClaims.coverageSuggestion,
          coverageDecision: serviceWarrantyClaims.coverageDecision,
          rmaNo: serviceWarrantyClaims.rmaNo,
          supplierRmaStatus: serviceWarrantyClaims.supplierRmaStatus,
          decidedAt: serviceWarrantyClaims.decidedAt,
        },
        sourceComplaint: {
          id: serviceComplaintIntakes.id,
          complaintNo: serviceComplaintIntakes.complaintNo,
          source: serviceComplaintIntakes.source,
          contactName: serviceComplaintIntakes.contactName,
          contactPhone: serviceComplaintIntakes.contactPhone,
          contactEmail: serviceComplaintIntakes.contactEmail,
        },
      })
      .from(serviceTickets)
      .leftJoin(serviceTicketStatuses, eq(serviceTickets.statusId, serviceTicketStatuses.id))
      .leftJoin(serviceWarrantyClaims, and(eq(serviceWarrantyClaims.serviceTicketId, serviceTickets.id), isNull(serviceWarrantyClaims.deletedAt)))
      .leftJoin(serviceComplaintIntakes, and(eq(serviceComplaintIntakes.serviceTicketId, serviceTickets.id), isNull(serviceComplaintIntakes.deletedAt)))
      .where(where)
      .orderBy(desc(serviceTickets.reportedAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({
        ...r.ticket,
        status: r.status,
        warrantyClaim: r.warrantyClaim?.id ? r.warrantyClaim : null,
        sourceComplaint: r.sourceComplaint?.id ? r.sourceComplaint : null,
      })),
      count,
      p
    );
  }

  @RequirePermissions('service_tickets.create')
  @Post('service-tickets')
  async createTicket(@Body(new ZodValidationPipe(ticketCreate)) body: z.infer<typeof ticketCreate>, @CurrentUser() user: AuthContext) {
    await this.assertScopedCompany(body.companyId, user, 'service_tickets');
    if (body.contactId) await this.assertContact(body.contactId, user.tenantId, body.companyId);
    if (body.customerDeviceId) await this.assertScopedCustomerDevice(body.customerDeviceId, user, body.companyId);
    if (body.assignedToUserId) await this.assertUser(body.assignedToUserId, user.tenantId);
    const openStatus = await this.db.query.serviceTicketStatuses.findFirst({ where: eq(serviceTicketStatuses.code, 'open') });
    const divisionId = resolveAssignedResourceDivision(user, 'service_tickets', body.divisionId ?? null);
    if (!divisionId && (await this.tenantHasActiveDivisions(user))) {
      throw new ValidationError('Servis kaydı için bölüm ataması zorunludur', { field: 'divisionId' });
    }
    const businessLine = divisionId ? await resolveBusinessLine(this.db, user.tenantId, divisionId) : 'CNC';
    const ticketNo =
      normalizeSeriesDocumentNo(body.ticketNo, businessLine) ??
      (await nextSeriesDocumentNo(this.db, user.tenantId, businessLine, 'service'));
    const [row] = await this.db
      .insert(serviceTickets)
      .values({
        tenantId: user.tenantId,
        divisionId,
        businessLine,
        ticketNo,
        companyId: body.companyId,
        contactId: body.contactId ?? null,
        customerDeviceId: body.customerDeviceId ?? null,
        subject: body.subject,
        description: body.description ?? null,
        severity: body.severity,
        ticketType: body.ticketType,
        source: body.source,
        statusId: openStatus?.id ?? null,
        assignedToUserId: body.assignedToUserId ?? null,
        metadata: validateTicketMetadata(body.metadata, businessLine) ?? null,
      })
      .returning();
    if (row.ticketType === 'warranty_claim') {
      await this.ensureWarrantyClaim(row);
    }
    return row;
  }

  @RequirePermissions('service_tickets.update')
  @Patch('service-tickets/:id')
  async updateTicket(@Param('id') id: string, @Body(new ZodValidationPipe(ticketUpdate)) body: z.infer<typeof ticketUpdate>, @CurrentUser() user: AuthContext) {
    const ticketVisibility = await companyVisibilityExistsFilter(this.db, user, serviceTickets.companyId);
    const ticket = await this.db.query.serviceTickets.findFirst({
      where: and(
        eq(serviceTickets.id, id),
        eq(serviceTickets.tenantId, user.tenantId),
        resourceDivisionFilter(user, 'service_tickets', serviceTickets.divisionId) ?? sql`true`,
        ticketVisibility ?? sql`true`
      ),
    });
    if (!ticket) throw new NotFoundError('Servis kaydı');
    const patch: Record<string, unknown> = {};
    if (body.description !== undefined) patch.description = body.description;
    if (body.resolutionNote !== undefined) patch.resolutionNote = body.resolutionNote;
    if (body.severity !== undefined) patch.severity = body.severity;
    if (body.ticketType !== undefined) patch.ticketType = body.ticketType;
    if (body.assignedToUserId !== undefined) patch.assignedToUserId = body.assignedToUserId;
    if (body.metadata !== undefined) {
      const businessLine = ticket.businessLine === 'UNI' || ticket.businessLine === 'SACISLE' || ticket.businessLine === 'CNC'
        ? ticket.businessLine
        : ticket.divisionId
          ? await resolveBusinessLine(this.db, user.tenantId, ticket.divisionId)
          : 'CNC';
      patch.metadata = { ...(ticket.metadata ?? {}), ...(validateTicketMetadata(body.metadata, businessLine) ?? {}) };
    }
    if (!Object.keys(patch).length) return ticket;
    const [row] = await this.db.update(serviceTickets).set(patch).where(eq(serviceTickets.id, id)).returning();
    if (row.ticketType === 'warranty_claim') {
      await this.ensureWarrantyClaim(row);
    }
    return row;
  }

  @RequirePermissions('service_tickets.read')
  @Get('service-tickets/:id/service-form.pdf')
  async downloadServiceForm(@Param('id') id: string, @CurrentUser() user: AuthContext, @Res() res: FastifyReply) {
    const { buffer, filename } = await this.buildServiceForm(id, user);
    res
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .header('Cache-Control', 'private, no-store')
      .send(buffer);
  }

  @RequirePermissions('service_tickets.read')
  @Get('service-tickets/:id/warranty')
  async getWarranty(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const ticket = await this.getScopedTicket(id, user);
    const existing = await this.findWarrantyClaim(ticket.id, user.tenantId);
    if (!existing && ticket.ticketType !== 'warranty_claim') return null;
    const claim = existing ?? await this.ensureWarrantyClaim(ticket);
    return this.warrantyResponse(claim);
  }

  @RequirePermissions('service_tickets.update')
  @Put('service-tickets/:id/warranty')
  async upsertWarranty(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantyUpdate)) body: z.infer<typeof warrantyUpdate>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    if (ticket.ticketType !== 'warranty_claim') {
      await this.db.update(serviceTickets).set({ ticketType: 'warranty_claim' }).where(eq(serviceTickets.id, ticket.id));
      ticket.ticketType = 'warranty_claim';
    }
    const claim = await this.ensureWarrantyClaim(ticket);
    const patch: Partial<typeof serviceWarrantyClaims.$inferInsert> = {};
    if (body.failureCategory !== undefined) patch.failureCategory = this.cleanNullableText(body.failureCategory);
    if (body.technicianAssessment !== undefined) patch.technicianAssessment = this.cleanNullableText(body.technicianAssessment);
    if (body.rmaNo !== undefined) patch.rmaNo = this.cleanNullableText(body.rmaNo);
    if (body.supplierName !== undefined) patch.supplierName = this.cleanNullableText(body.supplierName);
    if (body.supplierRmaStatus !== undefined) patch.supplierRmaStatus = this.cleanNullableText(body.supplierRmaStatus);
    if (body.costAmount !== undefined) patch.costAmount = this.moneyValue(body.costAmount);
    if (body.costCurrency !== undefined) patch.costCurrency = body.costCurrency;
    if (body.customerChargeAmount !== undefined) patch.customerChargeAmount = this.moneyValue(body.customerChargeAmount);
    if (body.customerChargeCurrency !== undefined) patch.customerChargeCurrency = body.customerChargeCurrency;
    if (body.status !== undefined) patch.status = body.status;
    if (Object.keys(patch).length) {
      const [updated] = await this.db
        .update(serviceWarrantyClaims)
        .set(patch)
        .where(eq(serviceWarrantyClaims.id, claim.id))
        .returning();
      return this.warrantyResponse(updated);
    }
    return this.warrantyResponse(claim);
  }

  @RequirePermissions('service_tickets.update')
  @Put('service-tickets/:id/warranty/parts')
  async replaceWarrantyParts(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantyPartsUpdate)) body: z.infer<typeof warrantyPartsUpdate>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    if (ticket.ticketType !== 'warranty_claim') {
      await this.db.update(serviceTickets).set({ ticketType: 'warranty_claim' }).where(eq(serviceTickets.id, ticket.id));
      ticket.ticketType = 'warranty_claim';
    }
    const claim = await this.ensureWarrantyClaim(ticket);
    for (const part of body.parts) {
      if (part.productModelId) {
        const product = await this.db.query.productModels.findFirst({
          where: and(eq(productModels.id, part.productModelId), eq(productModels.tenantId, user.tenantId), isNull(productModels.deletedAt)),
        });
        if (!product) throw new NotFoundError('Ürün');
      }
      if (part.inventoryItemId) await this.assertInventoryItem(part.inventoryItemId, user.tenantId);
    }
    await this.db
      .update(serviceWarrantyParts)
      .set({ deletedAt: new Date() })
      .where(and(eq(serviceWarrantyParts.warrantyClaimId, claim.id), eq(serviceWarrantyParts.tenantId, user.tenantId), isNull(serviceWarrantyParts.deletedAt)));
    if (body.parts.length) {
      await this.db.insert(serviceWarrantyParts).values(
        body.parts.map((part) => ({
          tenantId: user.tenantId,
          warrantyClaimId: claim.id,
          productModelId: part.productModelId ?? null,
          inventoryItemId: part.inventoryItemId ?? null,
          description: part.description.trim(),
          quantity: part.quantity,
          actionType: part.actionType,
          source: part.source,
          supplierRmaStatus: this.cleanNullableText(part.supplierRmaStatus),
          chargeToCustomer: part.chargeToCustomer,
          unitCost: this.moneyValue(part.unitCost),
          currency: part.currency,
          notes: this.cleanNullableText(part.notes),
        }))
      );
    }
    const refreshed = await this.findWarrantyClaim(ticket.id, user.tenantId);
    return this.warrantyResponse(refreshed ?? claim);
  }

  @RequirePermissions('service_tickets.update')
  @Post('service-tickets/:id/warranty/submit')
  async submitWarranty(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantySubmit)) _body: z.infer<typeof warrantySubmit>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    if (!ticket.customerDeviceId) throw new ValidationError('Garanti onayına göndermek için servis kaydı bir makineyle eşleşmeli');
    if (ticket.ticketType !== 'warranty_claim') {
      await this.db.update(serviceTickets).set({ ticketType: 'warranty_claim' }).where(eq(serviceTickets.id, ticket.id));
      ticket.ticketType = 'warranty_claim';
    }
    const claim = await this.ensureWarrantyClaim(ticket);
    const [updated] = await this.db
      .update(serviceWarrantyClaims)
      .set({ status: 'submitted' })
      .where(eq(serviceWarrantyClaims.id, claim.id))
      .returning();
    return this.warrantyResponse(updated);
  }

  @RequirePermissions('service_tickets.approve')
  @Post('service-tickets/:id/warranty/approve')
  async approveWarranty(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantyDecision)) body: z.infer<typeof warrantyDecision>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    const claim = await this.ensureWarrantyClaim(ticket);
    const [updated] = await this.db
      .update(serviceWarrantyClaims)
      .set({
        status: 'approved',
        coverageDecision: 'approved',
        managerDecisionNote: this.cleanNullableText(body.decisionNote),
        decidedByUserId: user.userId,
        decidedAt: new Date(),
      })
      .where(eq(serviceWarrantyClaims.id, claim.id))
      .returning();
    return this.warrantyResponse(updated);
  }

  @RequirePermissions('service_tickets.reject')
  @Post('service-tickets/:id/warranty/reject')
  async rejectWarranty(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantyDecision)) body: z.infer<typeof warrantyDecision>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    const claim = await this.ensureWarrantyClaim(ticket);
    const [updated] = await this.db
      .update(serviceWarrantyClaims)
      .set({
        status: 'rejected',
        coverageDecision: 'rejected',
        managerDecisionNote: this.cleanNullableText(body.decisionNote),
        decidedByUserId: user.userId,
        decidedAt: new Date(),
      })
      .where(eq(serviceWarrantyClaims.id, claim.id))
      .returning();
    return this.warrantyResponse(updated);
  }

  @RequirePermissions('service_tickets.update')
  @Patch('service-tickets/:id/status')
  async updateTicketStatus(@Param('id') id: string, @Body(new ZodValidationPipe(ticketStatus)) body: z.infer<typeof ticketStatus>, @CurrentUser() user: AuthContext) {
    const ticketVisibility = await companyVisibilityExistsFilter(this.db, user, serviceTickets.companyId);
    const ticket = await this.db.query.serviceTickets.findFirst({
      where: and(
        eq(serviceTickets.id, id),
        eq(serviceTickets.tenantId, user.tenantId),
        resourceDivisionFilter(user, 'service_tickets', serviceTickets.divisionId) ?? sql`true`,
        ticketVisibility ?? sql`true`
      ),
    });
    if (!ticket) throw new NotFoundError('Servis kaydı');
    if (body.serviceStage === 'Scheduled') {
      const quote = (ticket.metadata as Record<string, unknown> | null)?.serviceQuote;
      if (!serviceQuoteSchema.safeParse(quote).success) {
        throw new ValidationError('Bakım/Onarım aşamasından önce Servis Teklifi formu eksiksiz doldurulmalıdır', {
          field: 'serviceQuote',
        });
      }
    }
    if (body.serviceStage === 'Signed Form' || body.serviceStage === 'Closed' || body.statusCode === 'closed') {
      const completionForm = (ticket.metadata as Record<string, unknown> | null)?.completionForm;
      const parsed = serviceCompletionCloseSchema.safeParse(completionForm);
      if (!parsed.success) {
        throw new ValidationError('Servisi kapatmadan önce Servis Tamamlandı Formu eksiksiz doldurulup imzalanmalıdır', {
          field: 'completionForm',
          issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
      }
    }
    const statusId = await lookupIdByCode(this.db, serviceTicketStatuses, body.statusCode);
    const patch: Record<string, unknown> = { statusId };
    if (body.serviceStage) {
      patch.metadata = { ...(ticket.metadata ?? {}), serviceStage: body.serviceStage };
    }
    if (body.statusCode === 'resolved' || body.statusCode === 'closed') patch.resolvedAt = new Date();
    await this.db.update(serviceTickets).set(patch).where(eq(serviceTickets.id, id));
    return { ok: true };
  }

  @RequirePermissions('service_tickets.delete')
  @Delete('service-tickets/:id')
  async deleteTicket(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const ticket = await this.getScopedTicket(id, user);
    const now = new Date();
    const claim = await this.findWarrantyClaim(ticket.id, user.tenantId);
    if (claim) {
      await this.db
        .update(serviceWarrantyParts)
        .set({ deletedAt: now })
        .where(and(eq(serviceWarrantyParts.warrantyClaimId, claim.id), eq(serviceWarrantyParts.tenantId, user.tenantId), isNull(serviceWarrantyParts.deletedAt)));
      await this.db
        .update(serviceWarrantyClaims)
        .set({ deletedAt: now })
        .where(and(eq(serviceWarrantyClaims.id, claim.id), eq(serviceWarrantyClaims.tenantId, user.tenantId), isNull(serviceWarrantyClaims.deletedAt)));
    }
    await this.db
      .update(serviceTickets)
      .set({ deletedAt: now })
      .where(and(eq(serviceTickets.id, ticket.id), eq(serviceTickets.tenantId, user.tenantId), isNull(serviceTickets.deletedAt)));
    return { ok: true };
  }

  // ─────── INSTALLATIONS ───────
  @RequirePermissions('installations.read')
  @Get('installations')
  async listInstallations(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(
      eq(installationJobs.tenantId, user.tenantId),
      isNull(installationJobs.deletedAt),
      resourceDivisionFilter(user, 'installations', installationJobs.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(installationJobs).where(where);
    const rows = await this.db
      .select({
        installation: installationJobs,
        status: { id: installationStatuses.id, code: installationStatuses.code, name: installationStatuses.name },
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        contact: { id: contacts.id, fullName: contacts.fullName },
        assignedTo: { id: usersTable.id, fullName: usersTable.fullName },
        customerDevice: {
          id: customerDevices.id,
          productModelId: inventoryItems.productModelId,
          serialNumber: inventoryItems.serialNumber,
          controlUnit: inventoryItems.controlUnit,
          controlUnitSerialNumber: inventoryItems.controlUnitSerialNumber,
          model: productModels.modelCode,
          productModelName: productModels.modelName,
          deliveryDate: customerDevices.deliveryDate,
          cashPrice: productModels.cashPrice,
          currencyCode: currencies.code,
          brandName: brands.name,
          productTypeName: productTypes.name,
        },
      })
      .from(installationJobs)
      .leftJoin(installationStatuses, eq(installationJobs.statusId, installationStatuses.id))
      .leftJoin(companies, eq(installationJobs.companyId, companies.id))
      .leftJoin(contacts, eq(installationJobs.contactId, contacts.id))
      .leftJoin(usersTable, eq(installationJobs.assignedToUserId, usersTable.id))
      .leftJoin(customerDevices, eq(installationJobs.customerDeviceId, customerDevices.id))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(currencies, eq(productModels.currencyId, currencies.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(where)
      .orderBy(desc(installationJobs.createdAt))
      .limit(limit)
      .offset(offset);
    const productModelIds = [
      ...new Set(
        rows
          .map((row) => row.customerDevice?.productModelId)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const specRows = productModelIds.length
      ? await this.db
          .select({
            productModelId: productSpecs.productModelId,
            key: productSpecs.specKey,
            value: productSpecs.specValue,
            unit: productSpecs.specUnit,
          })
          .from(productSpecs)
          .where(
            and(
              eq(productSpecs.tenantId, user.tenantId),
              isNull(productSpecs.deletedAt),
              inArray(productSpecs.productModelId, productModelIds)
            )
          )
          .orderBy(asc(productSpecs.sortOrder))
      : [];
    const specsByProduct = new Map<string, Array<{ key: string; value: string; unit?: string | null }>>();
    for (const spec of specRows) {
      const list = specsByProduct.get(spec.productModelId) ?? [];
      list.push({ key: spec.key, value: spec.value, unit: spec.unit });
      specsByProduct.set(spec.productModelId, list);
    }
    return buildPaginated(
      rows.map((r) => ({
        ...r.installation,
        status: r.status,
        company: r.company,
        contact: r.contact,
        assignedTo: r.assignedTo,
        customerDevice: r.customerDevice?.id
          ? {
              ...r.customerDevice,
              technicalSpecs: r.customerDevice.productModelId
                ? specsByProduct.get(r.customerDevice.productModelId) ?? []
                : [],
            }
          : null,
      })),
      count,
      p
    );
  }

  @RequirePermissions('installations.create')
  @Post('installations')
  async createInstallation(@Body(new ZodValidationPipe(installCreate)) body: z.infer<typeof installCreate>, @CurrentUser() user: AuthContext) {
    if (body.companyId) await this.assertCompany(body.companyId, user.tenantId);
    const opportunity = body.opportunityId ? await this.assertOpportunity(body.opportunityId, user.tenantId, body.companyId) : null;
    const quote = body.quoteId ? await this.assertQuote(body.quoteId, user.tenantId, body.companyId, body.opportunityId) : null;
    if (opportunity && quote && quote.companyId !== opportunity.companyId) throw new ValidationError('Teklif seçilen fırsatın firmasına ait değil');
    const companyId = body.companyId ?? opportunity?.companyId ?? quote?.companyId ?? null;
    if (body.contactId) await this.assertContact(body.contactId, user.tenantId, companyId);
    if (body.customerDeviceId) await this.assertCustomerDevice(body.customerDeviceId, user.tenantId, companyId);
    if (body.assignedToUserId) await this.assertUser(body.assignedToUserId, user.tenantId);
    const scheduled = await this.db.query.installationStatuses.findFirst({ where: eq(installationStatuses.code, 'scheduled') });
    const divisionId = resolveAssignedResourceDivision(user, 'installations', body.divisionId ?? opportunity?.divisionId ?? quote?.divisionId ?? null);
    if (!divisionId && (await this.tenantHasActiveDivisions(user))) {
      throw new ValidationError('Kurulum için bölüm ataması zorunludur', { field: 'divisionId' });
    }
    const [row] = await this.db
      .insert(installationJobs)
      .values({
        tenantId: user.tenantId,
        divisionId,
        opportunityId: body.opportunityId ?? null,
        quoteId: body.quoteId ?? null,
        customerDeviceId: body.customerDeviceId ?? null,
        companyId,
        contactId: body.contactId ?? null,
        scheduledDate: body.scheduledDate ?? null,
        assignedToUserId: body.assignedToUserId ?? null,
        statusId: scheduled?.id ?? null,
        location: body.location ?? null,
        locationType: body.locationType ?? null,
        durationMinutes: body.durationMinutes ?? null,
        feeAmount: null,
        notes: body.notes ?? null,
        formData: body.formData ?? null,
      })
      .returning();
    return row;
  }

  @RequirePermissions('installations.update')
  @Patch('installations/:id')
  async updateInstallation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(installUpdate)) body: z.infer<typeof installUpdate>,
    @CurrentUser() user: AuthContext,
  ) {
    const job = await this.db.query.installationJobs.findFirst({
      where: and(
        eq(installationJobs.id, id),
        eq(installationJobs.tenantId, user.tenantId),
        isNull(installationJobs.deletedAt),
        resourceDivisionFilter(user, 'installations', installationJobs.divisionId) ?? sql`true`
      ),
    });
    if (!job) throw new NotFoundError('Kurulum');
    const companyId = body.companyId ?? job.companyId;
    if (body.companyId) await this.assertCompany(body.companyId, user.tenantId);
    if (body.opportunityId) await this.assertOpportunity(body.opportunityId, user.tenantId, companyId);
    if (body.quoteId) await this.assertQuote(body.quoteId, user.tenantId, companyId, body.opportunityId ?? job.opportunityId);
    if (body.contactId) await this.assertContact(body.contactId, user.tenantId, companyId);
    if (body.customerDeviceId) await this.assertCustomerDevice(body.customerDeviceId, user.tenantId, companyId);
    if (body.assignedToUserId) await this.assertUser(body.assignedToUserId, user.tenantId);

    const patch: Partial<typeof installationJobs.$inferInsert> = {};
    if (body.divisionId !== undefined) patch.divisionId = resolveAssignedResourceDivision(user, 'installations', body.divisionId) ?? null;
    if (body.opportunityId !== undefined) patch.opportunityId = body.opportunityId ?? null;
    if (body.quoteId !== undefined) patch.quoteId = body.quoteId ?? null;
    if (body.customerDeviceId !== undefined) patch.customerDeviceId = body.customerDeviceId ?? null;
    if (body.companyId !== undefined) patch.companyId = body.companyId ?? null;
    if (body.contactId !== undefined) patch.contactId = body.contactId ?? null;
    if (body.scheduledDate !== undefined) patch.scheduledDate = body.scheduledDate ?? null;
    if (body.assignedToUserId !== undefined) patch.assignedToUserId = body.assignedToUserId ?? null;
    if (body.location !== undefined) patch.location = body.location ?? null;
    if (body.locationType !== undefined) patch.locationType = body.locationType ?? null;
    if (body.durationMinutes !== undefined) patch.durationMinutes = body.durationMinutes ?? null;
    if (body.notes !== undefined) patch.notes = body.notes ?? null;
    if (body.formData !== undefined) patch.formData = body.formData ?? null;

    const [row] = await this.db.update(installationJobs).set(patch).where(eq(installationJobs.id, id)).returning();
    return row;
  }

  @RequirePermissions('installations.update')
  @Patch('installations/:id/status')
  async updateInstallationStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(installStatusUpdate)) body: z.infer<typeof installStatusUpdate>,
    @CurrentUser() user: AuthContext,
  ) {
    const job = await this.db.query.installationJobs.findFirst({
      where: and(
        eq(installationJobs.id, id),
        eq(installationJobs.tenantId, user.tenantId),
        isNull(installationJobs.deletedAt),
        resourceDivisionFilter(user, 'installations', installationJobs.divisionId) ?? sql`true`
      ),
    });
    if (!job) throw new NotFoundError('Kurulum');
    const statusId = await lookupIdByCode(this.db, installationStatuses, body.statusCode);
    const patch: Record<string, unknown> = { statusId };
    if (body.formData !== undefined) patch.formData = body.formData;
    if (body.statusCode === 'in_progress' && !job.startedAt) patch.startedAt = new Date();
    if (body.statusCode === 'completed') {
      const formData = body.formData ?? job.formData;
      assertInstallationCompletionReady(formData);
      const completedAt = body.installationDate ?? formDate((formData as any)?.kurulumTarihi) ?? new Date();
      patch.completedAt = completedAt;
      if (job.customerDeviceId) {
        const device = await this.db.query.customerDevices.findFirst({
          where: and(eq(customerDevices.id, job.customerDeviceId), eq(customerDevices.tenantId, user.tenantId), isNull(customerDevices.deletedAt)),
        });
        const deliveryDate = formDate((formData as any)?.teslimTarihi);
        const devicePatch: Record<string, unknown> = {
          installationDate: completedAt,
          warrantyStartDate: completedAt,
          warrantyEndDate: new Date(completedAt.getTime() + 365 * 24 * 60 * 60 * 1000),
        };
        if (deliveryDate) devicePatch.deliveryDate = deliveryDate;
        await this.db
          .update(customerDevices)
          .set(devicePatch)
          .where(and(eq(customerDevices.id, job.customerDeviceId), eq(customerDevices.tenantId, user.tenantId)));
        if (device?.inventoryItemId) {
          const machineSerial = formText((formData as any)?.tezgah?.seriNo);
          const cncSerial = formText((formData as any)?.cnc?.seriNo);
          const cncName = [formText((formData as any)?.cnc?.marka), formText((formData as any)?.cnc?.model)]
            .filter(Boolean)
            .join(' ');
          const inventoryPatch: Record<string, unknown> = {};
          if (machineSerial) inventoryPatch.serialNumber = machineSerial;
          if (cncName) inventoryPatch.controlUnit = cncName;
          if (cncSerial) inventoryPatch.controlUnitSerialNumber = cncSerial;
          if (Object.keys(inventoryPatch).length) {
            await this.db
              .update(inventoryItems)
              .set(inventoryPatch)
              .where(and(eq(inventoryItems.id, device.inventoryItemId), eq(inventoryItems.tenantId, user.tenantId)));
          }
        }
      }
    }
    const [row] = await this.db.update(installationJobs).set(patch).where(eq(installationJobs.id, id)).returning();
    const opportunityStageChanged = body.statusCode === 'completed'
      ? await this.markOpportunityDeliveredFromInstallation(job, user)
      : false;
    return { ...row, opportunityId: job.opportunityId, opportunityStageChanged };
  }

  @RequirePermissions('installations.delete')
  @Delete('installations/:id')
  async deleteInstallation(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const job = await this.db.query.installationJobs.findFirst({
      where: and(
        eq(installationJobs.id, id),
        eq(installationJobs.tenantId, user.tenantId),
        isNull(installationJobs.deletedAt),
        resourceDivisionFilter(user, 'installations', installationJobs.divisionId) ?? sql`true`
      ),
    });
    if (!job) throw new NotFoundError('Kurulum');
    await this.db
      .update(installationJobs)
      .set({ deletedAt: new Date() })
      .where(and(eq(installationJobs.id, id), eq(installationJobs.tenantId, user.tenantId), isNull(installationJobs.deletedAt)));
    return { ok: true };
  }

  @RequirePermissions('shipments.update')
  @Delete('shipments/:id')
  async deleteShipment(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const shipment = await this.db.query.shipments.findFirst({
      where: and(
        eq(shipments.id, id),
        eq(shipments.tenantId, user.tenantId),
        isNull(shipments.deletedAt),
        resourceDivisionFilter(user, 'shipments', shipments.divisionId) ?? sql`true`
      ),
    });
    if (!shipment) throw new NotFoundError('Sevkiyat');
    await this.db
      .update(shipments)
      .set({ deletedAt: new Date() })
      .where(and(eq(shipments.id, id), eq(shipments.tenantId, user.tenantId), isNull(shipments.deletedAt)));
    return { ok: true };
  }

  @RequirePermissions('shipments.update')
  @Delete('deliveries/:id')
  async deleteDelivery(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const delivery = await this.db.query.deliveries.findFirst({
      where: and(
        eq(deliveries.id, id),
        eq(deliveries.tenantId, user.tenantId),
        isNull(deliveries.deletedAt),
        resourceDivisionFilter(user, 'shipments', deliveries.divisionId) ?? sql`true`
      ),
    });
    if (!delivery) throw new NotFoundError('Teslimat');
    await this.db
      .update(deliveries)
      .set({ deletedAt: new Date() })
      .where(and(eq(deliveries.id, id), eq(deliveries.tenantId, user.tenantId), isNull(deliveries.deletedAt)));
    return { ok: true };
  }

  // ─────── SHIPMENTS ───────
  /** Sevkiyatı durum + firma + satır kalemleri (paketleme listesi) ile zenginleştirir; eski JSON-notes satırlarını da çözer. */
  private async enrichShipment(shipment: typeof shipments.$inferSelect) {
    const status = shipment.statusId
      ? await this.db.query.shipmentStatuses.findFirst({ where: eq(shipmentStatuses.id, shipment.statusId) })
      : null;
    const company = shipment.companyId
      ? await this.db.query.companies.findFirst({ where: eq(companies.id, shipment.companyId) })
      : null;
    const senderCompany = shipment.senderCompanyId
      ? await this.db.query.companies.findFirst({ where: eq(companies.id, shipment.senderCompanyId) })
      : null;
    const carrierCompany = shipment.carrierCompanyId
      ? await this.db.query.companies.findFirst({ where: eq(companies.id, shipment.carrierCompanyId) })
      : null;
    const destinationWarehouse = shipment.destinationWarehouseId
      ? await this.db.query.warehouses.findFirst({ where: eq(warehouses.id, shipment.destinationWarehouseId) })
      : null;
    const itemRows = await this.db
      .select({ item: shipmentItems, unit: { code: units.code, name: units.name } })
      .from(shipmentItems)
      .leftJoin(units, eq(shipmentItems.unitId, units.id))
      .where(and(eq(shipmentItems.shipmentId, shipment.id), isNull(shipmentItems.deletedAt)))
      .orderBy(shipmentItems.sortOrder);
    const items = itemRows.map(({ item, unit }) => ({ ...item, unit }));
    const legacy = this.decodeShipmentNotes(shipment.notes);
    const isLegacyMeta = !shipment.origin && !shipment.destination && !shipment.eta && !!(legacy.origin || legacy.destination || legacy.eta);
    return {
      ...shipment,
      origin: shipment.origin ?? legacy.origin ?? null,
      destination: shipment.destination ?? legacy.destination ?? null,
      eta: shipment.eta ?? (legacy.eta ? new Date(legacy.eta) : null),
      notes: isLegacyMeta ? legacy.notes ?? null : shipment.notes,
      status,
      company: company ? { id: company.id, legalTitle: company.legalTitle, shortName: company.shortName } : null,
      senderCompany: senderCompany ? { id: senderCompany.id, legalTitle: senderCompany.legalTitle, shortName: senderCompany.shortName, sector: senderCompany.sector } : null,
      carrierCompany: carrierCompany ? { id: carrierCompany.id, legalTitle: carrierCompany.legalTitle, shortName: carrierCompany.shortName, sector: carrierCompany.sector } : null,
      destinationWarehouse: destinationWarehouse ? { id: destinationWarehouse.id, name: destinationWarehouse.name, type: destinationWarehouse.type } : null,
      items,
    };
  }

  @RequirePermissions('shipments.read')
  @Get('shipments')
  async listShipments(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(
      eq(shipments.tenantId, user.tenantId),
      isNull(shipments.deletedAt),
      resourceDivisionFilter(user, 'shipments', shipments.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(shipments).where(where);
    const rows = await this.db.select().from(shipments).where(where).orderBy(desc(shipments.createdAt)).limit(limit).offset(offset);
    const enriched = await Promise.all(rows.map((s) => this.enrichShipment(s)));
    return buildPaginated(enriched, count, p);
  }

  @RequirePermissions('shipments.read')
  @Get('shipments/company-options')
  async shipmentCompanyOptions(
    @Query(new ZodValidationPipe(shipmentCompanyOptionsQuery)) query: z.infer<typeof shipmentCompanyOptionsQuery>,
    @CurrentUser() user: AuthContext,
  ) {
    const filters = [eq(companies.tenantId, user.tenantId), isNull(companies.deletedAt)];
    const sector = query.purpose === 'carrier' ? this.expectedCarrierSector(query.transportMode) : null;
    if (sector) filters.push(eq(companies.sector, sector));
    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      filters.push(or(ilike(companies.legalTitle, search), ilike(companies.shortName, search)) ?? sql`true`);
    }
    return this.db
      .select({
        id: companies.id,
        legalTitle: companies.legalTitle,
        shortName: companies.shortName,
        sector: companies.sector,
      })
      .from(companies)
      .where(and(...filters))
      .orderBy(asc(companies.legalTitle))
      .limit(100);
  }

  @RequirePermissions('shipments.read')
  @Get('shipments/:id')
  async getShipment(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const shipment = await this.assertShipment(id, user.tenantId, user);
    return this.enrichShipment(shipment);
  }

  @RequirePermissions('shipments.create')
  @Post('shipments')
  async createShipment(@Body(new ZodValidationPipe(shipmentCreateSchema)) body: z.infer<typeof shipmentCreateSchema>, @CurrentUser() user: AuthContext) {
    const opportunity = body.opportunityId ? await this.assertOpportunity(body.opportunityId, user.tenantId) : null;
    if (body.companyId) await this.assertCompany(body.companyId, user.tenantId);
    if (body.senderCompanyId) await this.assertCompany(body.senderCompanyId, user.tenantId);
    if (body.carrierCompanyId) await this.assertCarrierCompany(body.carrierCompanyId, user.tenantId, body.transportMode);
    if (body.destinationWarehouseId) await this.assertWarehouse(body.destinationWarehouseId, user.tenantId);
    const companyId = body.companyId ?? opportunity?.companyId ?? null;
    let deliveryAddressSnapshot = body.deliveryAddressSnapshot ?? null;
    if (body.deliveryAddressId) {
      if (!companyId) throw new ValidationError('Sevkiyat adresi için müşteri seçilmelidir', { field: 'deliveryAddressId' });
      const address = await this.db.query.companyAddresses.findFirst({
        where: and(
          eq(companyAddresses.id, body.deliveryAddressId),
          eq(companyAddresses.tenantId, user.tenantId),
          eq(companyAddresses.companyId, companyId),
          isNull(companyAddresses.deletedAt)
        ),
      });
      if (!address) throw new ValidationError('Seçilen sevkiyat adresi firmaya ait değil', { field: 'deliveryAddressId' });
      deliveryAddressSnapshot = [
        address.fullAddress,
        address.street,
        address.buildingNumber,
        address.locality,
        address.district,
        address.province,
        address.country,
      ].filter(Boolean).join(' ');
    }
    if (body.quoteId) await this.assertQuote(body.quoteId, user.tenantId, companyId, body.opportunityId);
    if (body.salesOrderId) await this.assertSalesOrder(body.salesOrderId, user.tenantId, companyId);
    const statusId = await lookupIdByCode(this.db, shipmentStatuses, body.statusCode);
    const divisionId = resolveAssignedResourceDivision(
      user,
      'shipments',
      body.divisionId ?? opportunity?.divisionId ?? null
    );
    if (!divisionId && (await this.tenantHasActiveDivisions(user))) {
      throw new ValidationError('Sevkiyat için bölüm ataması zorunludur', { field: 'divisionId' });
    }
    const [row] = await this.db
      .insert(shipments)
      .values({
        tenantId: user.tenantId,
        divisionId,
        opportunityId: body.opportunityId ?? null,
        quoteId: body.quoteId ?? null,
        salesOrderId: body.salesOrderId ?? null,
        companyId,
        deliveryAddressId: body.deliveryAddressId ?? null,
        deliveryAddressSnapshot,
        senderCompanyId: body.senderCompanyId ?? null,
        senderName: body.senderName ?? null,
        carrierCompanyId: body.carrierCompanyId ?? null,
        transportMode: body.transportMode ?? null,
        productCategoryCode: body.productCategoryCode ?? null,
        destinationWarehouseId: body.destinationWarehouseId ?? null,
        loadingDate: body.loadingDate ?? null,
        shipmentNo: body.shipmentNo ?? null,
        carrier: body.carrier ?? null,
        trackingNo: body.trackingNo ?? null,
        statusId,
        origin: body.origin ?? null,
        destination: body.destination ?? null,
        eta: body.eta ?? null,
        incoterm: body.incoterm ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    if (body.items?.length) await this.insertShipmentItems(row.id, user.tenantId, companyId, body.items);
    if (body.statusCode === 'in_transit') {
      const loadingDate = body.loadingDate ?? new Date();
      await this.markInventoryInTransit(row.id, user.tenantId, user.userId, loadingDate);
      const [updated] = await this.db
        .update(shipments)
        .set({ shippedAt: loadingDate, loadingDate })
        .where(eq(shipments.id, row.id))
        .returning();
      return this.enrichShipment(updated);
    }
    return this.enrichShipment(row);
  }

  @RequirePermissions('shipments.update')
  @Post('shipments/:id/start')
  async startShipment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(shipmentStartSchema)) body: z.infer<typeof shipmentStartSchema>,
    @CurrentUser() user: AuthContext,
  ) {
    const shipment = await this.assertShipment(id, user.tenantId, user);
    await this.assertShipmentItemsResolved(id, user.tenantId);
    const statusId = await lookupIdByCode(this.db, shipmentStatuses, 'in_transit');
    const loadingDate = body.loadingDate ?? shipment.loadingDate ?? new Date();
    const [updated] = await this.db
      .update(shipments)
      .set({ statusId, shippedAt: shipment.shippedAt ?? loadingDate, loadingDate })
      .where(eq(shipments.id, id))
      .returning();
    await this.markInventoryInTransit(id, user.tenantId, user.userId, loadingDate);
    return this.enrichShipment(updated);
  }

  @RequirePermissions('shipments.update')
  @Patch('shipments/:id/status')
  async updateShipmentStatus(@Param('id') id: string, @Body(new ZodValidationPipe(shipmentStatusUpdateSchema)) body: z.infer<typeof shipmentStatusUpdateSchema>, @CurrentUser() user: AuthContext) {
    const shipment = await this.assertShipment(id, user.tenantId, user);
    const statusId = await lookupIdByCode(this.db, shipmentStatuses, body.statusCode);
    const now = new Date();
    const patch: Record<string, unknown> = { statusId };
    if (body.statusCode === 'in_transit') {
      const loadingDate = body.loadingDate ?? shipment.loadingDate ?? now;
      patch.shippedAt = shipment.shippedAt ?? loadingDate;
      patch.loadingDate = loadingDate;
    }
    if (body.statusCode === 'cleared' && !shipment.customsClearedAt) patch.customsClearedAt = now;
    let destinationWarehouseId = body.destinationWarehouseId ?? shipment.destinationWarehouseId ?? null;
    let arrivalDate = body.arrivedAt ?? now;
    if (body.statusCode === 'delivered') {
      if (!destinationWarehouseId) {
        throw new ValidationError('Sevkiyat tamamlanmadan önce varış deposu seçilmelidir', { field: 'destinationWarehouseId' });
      }
      await this.assertWarehouse(destinationWarehouseId, user.tenantId);
      patch.destinationWarehouseId = destinationWarehouseId;
      patch.arrivedAt = shipment.arrivedAt ?? arrivalDate;
      arrivalDate = patch.arrivedAt as Date;
    }
    await this.db.update(shipments).set(patch).where(eq(shipments.id, id));

    // Durum geçişlerinde seri-numaralı stoğu senkronla.
    if (body.statusCode === 'in_transit') {
      await this.markInventoryInTransit(shipment.id, user.tenantId, user.userId, (patch.loadingDate as Date) ?? now);
    } else if (body.statusCode === 'delivered') {
      await this.receiveShipmentInventory(shipment.id, user.tenantId, destinationWarehouseId!, arrivalDate, user.userId);
    }
    return { ok: true };
  }

  // ───── DELIVERIES ─────
  @RequirePermissions('shipments.read')
  @Get('deliveries')
  async listDeliveries(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(
      eq(deliveries.tenantId, user.tenantId),
      isNull(deliveries.deletedAt),
      resourceDivisionFilter(user, 'shipments', deliveries.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(deliveries).where(where);
    const rows = await this.db
      .select()
      .from(deliveries)
      .where(where)
      .orderBy(desc(deliveries.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows, count, p);
  }

  @RequirePermissions('shipments.create')
  @Post('deliveries')
  async createDelivery(@Body(new ZodValidationPipe(deliveryCreateSchema)) body: z.infer<typeof deliveryCreateSchema>, @CurrentUser() user: AuthContext) {
    await this.assertCompany(body.companyId, user.tenantId);
    if (body.opportunityId) await this.assertOpportunity(body.opportunityId, user.tenantId, body.companyId);
    if (body.salesOrderId) await this.assertSalesOrder(body.salesOrderId, user.tenantId, body.companyId);
    if (body.shipmentId) await this.assertShipment(body.shipmentId, user.tenantId, user);
    const divisionId = resolveAssignedResourceDivision(user, 'shipments', body.divisionId ?? null);
    if (!divisionId && (await this.tenantHasActiveDivisions(user))) {
      throw new ValidationError('Teslimat için bölüm ataması zorunludur', { field: 'divisionId' });
    }
    const [row] = await this.db
      .insert(deliveries)
      .values({
        tenantId: user.tenantId,
        divisionId,
        opportunityId: body.opportunityId ?? null,
        companyId: body.companyId,
        shipmentId: body.shipmentId ?? null,
        salesOrderId: body.salesOrderId ?? null,
        deliveryDate: body.deliveryDate,
        signedBy: body.signedBy ?? null,
        status: body.status,
        notes: body.notes ?? null,
        formData: body.formData ?? null,
      })
      .returning();
    if (body.status === 'completed' && body.shipmentId) {
      await this.markInventoryDelivered(body.shipmentId, user.tenantId, body.companyId, body.deliveryDate, 'delivery', row.id, user.userId);
    }
    return row;
  }

  @RequirePermissions('shipments.update')
  @Patch('deliveries/:id')
  async updateDelivery(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deliveryUpdateSchema)) body: z.infer<typeof deliveryUpdateSchema>,
    @CurrentUser() user: AuthContext,
  ) {
    const delivery = await this.db.query.deliveries.findFirst({
      where: and(
        eq(deliveries.id, id),
        eq(deliveries.tenantId, user.tenantId),
        isNull(deliveries.deletedAt),
        resourceDivisionFilter(user, 'shipments', deliveries.divisionId) ?? sql`true`
      ),
    });
    if (!delivery) throw new NotFoundError('Teslimat');
    if (body.companyId) await this.assertCompany(body.companyId, user.tenantId);
    if (body.opportunityId) await this.assertOpportunity(body.opportunityId, user.tenantId, body.companyId ?? delivery.companyId);
    if (body.salesOrderId) await this.assertSalesOrder(body.salesOrderId, user.tenantId, body.companyId ?? delivery.companyId);
    if (body.shipmentId) await this.assertShipment(body.shipmentId, user.tenantId, user);

    const patch: Partial<typeof deliveries.$inferInsert> = {};
    if (body.opportunityId !== undefined) patch.opportunityId = body.opportunityId ?? null;
    if (body.companyId !== undefined) patch.companyId = body.companyId;
    if (body.shipmentId !== undefined) patch.shipmentId = body.shipmentId ?? null;
    if (body.salesOrderId !== undefined) patch.salesOrderId = body.salesOrderId ?? null;
    if (body.deliveryDate !== undefined) patch.deliveryDate = body.deliveryDate;
    if (body.signedBy !== undefined) patch.signedBy = body.signedBy ?? null;
    if (body.status !== undefined) patch.status = body.status;
    if (body.notes !== undefined) patch.notes = body.notes ?? null;
    if (body.formData !== undefined) patch.formData = body.formData ?? null;

    const [row] = await this.db.update(deliveries).set(patch).where(eq(deliveries.id, id)).returning();
    if (body.status === 'completed' && row.shipmentId) {
      await this.markInventoryDelivered(row.shipmentId, user.tenantId, row.companyId, row.deliveryDate, 'delivery', row.id, user.userId);
    }
    return row;
  }

  @RequirePermissions('shipments.update')
  @Patch('deliveries/:id/status')
  async updateDeliveryStatus(@Param('id') id: string, @Body(new ZodValidationPipe(deliveryStatusUpdateSchema)) body: z.infer<typeof deliveryStatusUpdateSchema>, @CurrentUser() user: AuthContext) {
    const delivery = await this.db.query.deliveries.findFirst({
      where: and(
        eq(deliveries.id, id),
        eq(deliveries.tenantId, user.tenantId),
        isNull(deliveries.deletedAt),
        resourceDivisionFilter(user, 'shipments', deliveries.divisionId) ?? sql`true`
      ),
    });
    if (!delivery) throw new NotFoundError('Teslimat');
    await this.db.update(deliveries).set({ status: body.status }).where(eq(deliveries.id, id));
    if (body.status === 'completed' && delivery.shipmentId) {
      await this.markInventoryDelivered(delivery.shipmentId, user.tenantId, delivery.companyId, delivery.deliveryDate, 'delivery', delivery.id, user.userId);
    }
    return { ok: true };
  }
}
