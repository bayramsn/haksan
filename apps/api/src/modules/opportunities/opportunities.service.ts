import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  opportunities,
  opportunityApprovals,
  opportunityQualificationHistory,
  opportunityStageHistory,
  leadAssignmentCursors,
  leadAssignmentRules,
  leadContactEvents,
  salesActivities,
  visits,
  calls,
  cancellationReasons,
  competitors,
} from '../../db/schema/crm';
import {
  companies,
  companyAddresses,
  companyDivisions,
  companyEmails,
  companyPhones,
  contactCompanies,
  contacts,
  notifications,
} from '../../db/schema/companies';
import { roles, userDivisions, userRoles, users } from '../../db/schema/users';
import { auditLogs } from '../../db/schema/audit';
import { quotes, proformas } from '../../db/schema/quotes';
import { inventoryItems, inventoryMovements, customerDevices } from '../../db/schema/inventory';
import { installationJobs, shipments } from '../../db/schema/service';
import { divisions } from '../../db/schema/tenants';
import {
  pipelineStages,
  currencies,
  opportunityStatuses,
  contactSources,
  inventoryStatuses,
  warrantyStatuses,
  installationStatuses,
  companyRelationTypes,
  companyStatuses,
  activityTypes,
} from '../../db/schema/lookup';
import { commercialInvoices, contracts } from '../../db/schema/quotes';
import { opportunityProcessChecks } from '../../db/schema/crm';
import { receivables } from '../../db/schema/finance';
import { DB } from '../../shared/database/database.module';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type {
  OpportunityCompanyLinkInput,
  OpportunityCreateInput,
  OpportunityApprovalDecisionInput,
  OpportunityConvertInput,
  LeadAssignmentRuleCreateInput,
  LeadAssignmentRuleUpdateInput,
  LeadContactEventInput,
  OpportunityQualificationChangeInput,
  OpportunityUpdateInput,
  OpportunityStageChangeInput,
  TrelloImportCommitRequest,
  TrelloImportPreviewRequest,
  TrelloImportRowInput,
  TrelloCompanyCandidate,
  Pagination,
} from '@haksan/shared';
import {
  LEAD_DISQUALIFY_REASONS,
  LEAD_FOLLOW_UP_SLA_HOURS,
  LEAD_MAX_CONTACT_ATTEMPTS,
  calculateLeadInsights,
  PIPELINE_STAGE_QUALIFICATION,
  PIPELINE_STAGE_FLOW,
  PIPELINE_STAGES,
  QUALIFICATION_STAGE_ENTRY,
  QUALIFICATION_STAGE_AGE_LIMIT_DAYS,
  QUALIFICATION_STAGES,
  STAGE_TRANSITIONS,
  requiresPaymentPlan,
  trelloImportRowSchema,
  trelloResolvedImportRowSchema,
  type LeadFollowUpStatusCode,
  type LeadContactOutcomeCode,
  type PipelineStageCode,
  type OpportunityApprovalType,
  type OpportunityProcessReadiness,
  type OpportunityProcessActionKey,
  type OpportunityProcessCheckUpsertInput,
  type ProcessCheck,
  type ProcessTarget,
  type QualificationStageCode,
} from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';
import {
  resourceCompanyPortfolioFilter,
  resourceDivisionFilter,
  resolveAssignedResourceDivision,
} from '../../shared/utils/division-scope';
import {
  allowUnlinkedCompanyRecords,
  companyVisibilityFilter,
  companyVisibilityExistsFilter,
} from '../../shared/utils/company-visibility';
import { ContactsService } from '../contacts/contacts.service';
import { normalizeCompanyName, normalizePersonName } from '../../shared/utils/text-normalization';
import {
  extractTrelloCompanyCandidate,
  normalizeTrelloMatchText,
  normalizeTrelloPhone,
  scoreTrelloCompanyCandidate,
  type TrelloCompanyMatch,
} from '../../shared/utils/trello-company-resolution';

type TrelloImportStatus = 'create' | 'skip' | 'error';

const LOST_REASON_NAMES: Record<string, string> = {
  price: 'Fiyat / Bütçe Yetersiz',
  competitor: 'Rakip Tercih Edildi',
  timing: 'Zamanlama / Yatırım Ertelendi',
  spec: 'Teknik Şartname Karşılanamadı',
  no_budget: 'Bütçe Onayı Çıkmadı',
  other: 'Diğer',
};

type TrelloImportPreviewRow = TrelloImportRowInput & {
  candidate: TrelloCompanyCandidate;
  matches: Array<
    TrelloCompanyMatch & {
      contactMatch?: { id: string; fullName: string; reason: string };
    }
  >;
  status: TrelloImportStatus;
  errors: string[];
  warnings: string[];
};

const TRELLO_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const TRELLO_IMPORT_MAX_ROWS = 500;

const QUALIFICATION_SEQUENCE: QualificationStageCode[] = ['lead', 'c', 'b', 'a', 'a_plus', 'win'];

/**
 * İlk temas alanı: kart Lead kolonunda doğar ve C alanında da hâlâ ilk temas
 * takibindedir. Temas durumu / temas olayı yalnız bu iki derecede yazılır.
 */
const isFirstContactStage = (stage: QualificationStageCode) => stage === 'lead' || stage === 'c';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const APPROVAL_LABELS: Record<OpportunityApprovalType, string> = {
  payment: 'Ödeme onayı',
  customs: 'Gümrük onayı',
  invoice: 'Fatura onayı',
  installation: 'Kurulum onayı',
  win: 'Süperadmin nihai WIN onayı',
};

type QualificationContext = {
  company: { id: string; sector: string | null } | null;
  hasLocation: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasCall: boolean;
  hasVisit: boolean;
  hasQuote: boolean;
  approvals: Partial<Record<OpportunityApprovalType, 'pending' | 'approved' | 'rejected'>>;
};

type LeadActivityContext = {
  latestActivityAt: Date | null;
  latestContactOutcome: LeadContactOutcomeCode | null;
};

type ProcessEvidence = {
  hasQuote: boolean;
  hasApprovedQuote: boolean;
  hasProforma: boolean;
  hasContract: boolean;
  hasPaymentPlan: boolean;
  hasCommercialInvoice: boolean;
  hasCommercialInvoiceFile: boolean;
  hasStockReservation: boolean;
  hasShipment: boolean;
  hasArrivedShipment: boolean;
  hasInstallation: boolean;
  hasCompletedInstallation: boolean;
};

type CheckDefinition = ProcessCheck & { requiredAt: PipelineStageCode };

const TRELLO_FIELD_ALIASES: Record<string, string[]> = {
  trelloCardId: ['card id', 'card id long', 'id', 'kart id', 'kart kimligi', 'kart kimliği'],
  title: ['card name', 'name', 'title', 'kart adi', 'kart adı', 'baslik', 'başlık'],
  description: ['card description', 'description', 'desc', 'kart aciklamasi', 'kart açıklaması', 'aciklama', 'açıklama'],
  boardName: ['board name', 'board', 'pano adi', 'pano adı', 'pano'],
  listName: ['list name', 'list', 'liste adi', 'liste adı', 'liste'],
  cardUrl: ['card url', 'url', 'card link', 'link', 'kart url', 'kart baglantisi', 'kart bağlantısı'],
  labels: ['labels', 'label', 'etiketler', 'etiket'],
  members: ['members', 'member', 'uyeler', 'üyeler', 'uye', 'üye'],
  dueAt: ['due date', 'due', 'deadline', 'son tarih', 'bitis tarihi', 'bitiş tarihi'],
  trelloCreatedAt: ['created date', 'date created', 'created at', 'olusturma tarihi', 'oluşturma tarihi'],
  archived: ['archived', 'is archived', 'arsivlenmis', 'arşivlenmiş'],
};

function normalizeTrelloHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const TRELLO_HEADER_MAP = Object.entries(TRELLO_FIELD_ALIASES).reduce<Record<string, string>>(
  (map, [field, aliases]) => {
    for (const alias of aliases) map[normalizeTrelloHeader(alias)] = field;
    return map;
  },
  {}
);

function parseTrelloCsv(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else if (character !== '\r') {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function cleanTrelloCell(value: unknown): string {
  return String(value ?? '').replace(/\0/g, '').trim();
}

function parseTrelloDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseTrelloBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'evet', 'x'].includes(normalizeTrelloHeader(value));
}

function safeTrelloUrl(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function suggestedStageForTrelloList(listName: string): PipelineStageCode {
  const value = normalizeTrelloHeader(listName);
  const rules: Array<[PipelineStageCode, string[]]> = [
    ['cancelled', ['iptal', 'kaybedildi', 'lost', 'cancelled', 'vazgecildi']],
    ['delivered', ['teslim', 'tamamlandi', 'done', 'completed', 'complete']],
    ['installation', ['kurulum', 'montaj', 'installation']],
    ['shipping', ['sevkiyat', 'kargo', 'shipping', 'shipment']],
    ['stock_picking', ['stok', 'depo', 'stock']],
    ['customs_approved', ['gumruk', 'customs']],
    ['commercial_invoice', ['ticari fatura', 'commercial invoice']],
    ['payment_plan', ['odeme plani', 'payment plan']],
    ['contract', ['sozlesme', 'contract']],
    ['proforma', ['proforma']],
    ['quote', ['teklif', 'offer', 'proposal', 'quotation']],
    ['visit', ['ziyaret', 'visit']],
    ['call', ['arama', 'telefon', 'call']],
    ['sales', ['satis', 'sales', 'gorusme', 'temas']],
  ];
  return rules.find(([, keywords]) => keywords.some((keyword) => value.includes(keyword)))?.[0] ?? 'sales';
}

@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService,
    private readonly contactsService: ContactsService
  ) {}

  private async stageRowByCode(code: string) {
    const row = await this.db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, code) });
    if (!row) throw new ValidationError(`Bilinmeyen aşama: ${code}`);
    return row;
  }

  private qualificationStage(value: string | null | undefined): QualificationStageCode {
    return QUALIFICATION_STAGES.includes(value as QualificationStageCode)
      ? (value as QualificationStageCode)
      : 'c';
  }

  private async qualificationContexts(rows: Array<typeof opportunities.$inferSelect>) {
    const opportunityIds = rows.map((row) => row.id);
    const companyIds = [...new Set(rows.map((row) => row.companyId).filter((id): id is string => Boolean(id)))];
    if (!opportunityIds.length) return new Map<string, QualificationContext>();

    const [companyRows, addressRows, phoneRows, emailRows, callRows, visitRows, activityRows, approvalRows, quoteRows] = await Promise.all([
      companyIds.length
        ? this.db
            .select({ id: companies.id, sector: companies.sector })
            .from(companies)
            .where(
              and(
                eq(companies.tenantId, rows[0].tenantId),
                inArray(companies.id, companyIds),
                isNull(companies.deletedAt)
              )
            )
        : Promise.resolve([]),
      companyIds.length
        ? this.db
            .select({
              companyId: companyAddresses.companyId,
              province: companyAddresses.province,
              district: companyAddresses.district,
              fullAddress: companyAddresses.fullAddress,
            })
            .from(companyAddresses)
            .where(
              and(
                eq(companyAddresses.tenantId, rows[0].tenantId),
                inArray(companyAddresses.companyId, companyIds),
                isNull(companyAddresses.deletedAt)
              )
            )
        : Promise.resolve([]),
      companyIds.length
        ? this.db
            .select({ companyId: companyPhones.companyId })
            .from(companyPhones)
            .where(
              and(
                eq(companyPhones.tenantId, rows[0].tenantId),
                inArray(companyPhones.companyId, companyIds),
                isNull(companyPhones.deletedAt)
              )
            )
        : Promise.resolve([]),
      companyIds.length
        ? this.db
            .select({ companyId: companyEmails.companyId })
            .from(companyEmails)
            .where(
              and(
                eq(companyEmails.tenantId, rows[0].tenantId),
                inArray(companyEmails.companyId, companyIds),
                isNull(companyEmails.deletedAt)
              )
            )
        : Promise.resolve([]),
      this.db
        .select({ opportunityId: calls.opportunityId })
        .from(calls)
        .where(and(eq(calls.tenantId, rows[0].tenantId), inArray(calls.opportunityId, opportunityIds), isNull(calls.deletedAt))),
      this.db
        .select({ opportunityId: visits.opportunityId })
        .from(visits)
        .where(and(eq(visits.tenantId, rows[0].tenantId), inArray(visits.opportunityId, opportunityIds), isNull(visits.deletedAt))),
      this.db
        .select({
          opportunityId: salesActivities.opportunityId,
          activityTypeCode: activityTypes.code,
        })
        .from(salesActivities)
        .innerJoin(activityTypes, eq(salesActivities.activityTypeId, activityTypes.id))
        .where(
          and(
            eq(salesActivities.tenantId, rows[0].tenantId),
            inArray(salesActivities.opportunityId, opportunityIds),
            isNull(salesActivities.deletedAt),
            inArray(activityTypes.code, [
              'incoming_call',
              'outgoing_call',
              'customer_visit',
              'call',
              'visit',
              'demo',
            ])
          )
        ),
      this.db
        .select({
          opportunityId: opportunityApprovals.opportunityId,
          approvalType: opportunityApprovals.approvalType,
          status: opportunityApprovals.status,
        })
        .from(opportunityApprovals)
        .where(
          and(
            eq(opportunityApprovals.tenantId, rows[0].tenantId),
            inArray(opportunityApprovals.opportunityId, opportunityIds),
            isNull(opportunityApprovals.deletedAt)
          )
        ),
      this.db
        .select({ opportunityId: quotes.opportunityId })
        .from(quotes)
        .where(
          and(
            eq(quotes.tenantId, rows[0].tenantId),
            inArray(quotes.opportunityId, opportunityIds),
            isNull(quotes.deletedAt)
          )
        ),
    ]);

    const companiesById = new Map(companyRows.map((row) => [row.id, row]));
    const addressesByCompany = new Map<string, typeof addressRows>();
    for (const row of addressRows) {
      const items = addressesByCompany.get(row.companyId) ?? [];
      items.push(row);
      addressesByCompany.set(row.companyId, items);
    }
    const phones = new Set(phoneRows.map((row) => row.companyId));
    const emails = new Set(emailRows.map((row) => row.companyId));
    const callsByOpportunity = new Set([
      ...callRows.map((row) => row.opportunityId).filter(Boolean),
      ...activityRows
        .filter((row) => ['incoming_call', 'outgoing_call', 'call'].includes(row.activityTypeCode))
        .map((row) => row.opportunityId)
        .filter(Boolean),
    ]);
    const visitsByOpportunity = new Set([
      ...visitRows.map((row) => row.opportunityId).filter(Boolean),
      ...activityRows
        .filter((row) => ['customer_visit', 'visit', 'demo'].includes(row.activityTypeCode))
        .map((row) => row.opportunityId)
        .filter(Boolean),
    ]);
    const quotesByOpportunity = new Set(quoteRows.map((row) => row.opportunityId).filter(Boolean));
    const approvalsByOpportunity = new Map<
      string,
      Partial<Record<OpportunityApprovalType, 'pending' | 'approved' | 'rejected'>>
    >();
    for (const row of approvalRows) {
      const approvals = approvalsByOpportunity.get(row.opportunityId) ?? {};
      approvals[row.approvalType as OpportunityApprovalType] = row.status as 'pending' | 'approved' | 'rejected';
      approvalsByOpportunity.set(row.opportunityId, approvals);
    }

    return new Map(
      rows.map((row) => {
        const companyId = row.companyId;
        const addresses = companyId ? addressesByCompany.get(companyId) ?? [] : [];
        return [
          row.id,
          {
            company: companyId ? companiesById.get(companyId) ?? null : null,
            hasLocation: addresses.some((address) => Boolean(address.province?.trim() && address.district?.trim())),
            hasAddress: addresses.some((address) => Boolean(address.fullAddress?.trim())),
            hasPhone: Boolean(companyId && phones.has(companyId)),
            hasEmail: Boolean(companyId && emails.has(companyId)),
            hasCall: callsByOpportunity.has(row.id),
            hasVisit: visitsByOpportunity.has(row.id),
            hasQuote: quotesByOpportunity.has(row.id),
            approvals: approvalsByOpportunity.get(row.id) ?? {},
          } satisfies QualificationContext,
        ] as const;
      })
    );
  }

  private async leadActivityContexts(rows: Array<typeof opportunities.$inferSelect>) {
    const opportunityIds = rows.map((row) => row.id);
    if (!opportunityIds.length) return new Map<string, LeadActivityContext>();

    const [activityRows, contactRows] = await Promise.all([
      this.db
        .select({
          opportunityId: salesActivities.opportunityId,
          latestActivityAt: sql<Date | null>`max(${salesActivities.activityDate})`,
        })
        .from(salesActivities)
        .where(
          and(
            eq(salesActivities.tenantId, rows[0].tenantId),
            inArray(salesActivities.opportunityId, opportunityIds),
            isNull(salesActivities.deletedAt)
          )
        )
        .groupBy(salesActivities.opportunityId),
      this.db
        .select({
          opportunityId: leadContactEvents.opportunityId,
          outcome: leadContactEvents.outcome,
        })
        .from(leadContactEvents)
        .where(
          and(
            eq(leadContactEvents.tenantId, rows[0].tenantId),
            inArray(leadContactEvents.opportunityId, opportunityIds)
          )
        )
        .orderBy(desc(leadContactEvents.occurredAt)),
    ]);

    const result = new Map<string, LeadActivityContext>();
    for (const opportunityId of opportunityIds) {
      result.set(opportunityId, { latestActivityAt: null, latestContactOutcome: null });
    }
    for (const row of activityRows) {
      if (!row.opportunityId) continue;
      const current = result.get(row.opportunityId);
      if (current) current.latestActivityAt = row.latestActivityAt ? new Date(row.latestActivityAt) : null;
    }
    for (const row of contactRows) {
      const current = result.get(row.opportunityId);
      if (current && !current.latestContactOutcome) {
        current.latestContactOutcome = row.outcome as LeadContactOutcomeCode;
      }
    }
    return result;
  }

  private leadInsights(row: typeof opportunities.$inferSelect, activity?: LeadActivityContext) {
    const status = (row.leadFollowUpStatus ?? 'new') as LeadFollowUpStatusCode;
    return calculateLeadInsights({
      requestedProduct: row.title,
      requestedMachine: row.requestedMachine,
      leadNeedSummary: row.leadNeedSummary,
      leadAuthorityStatus: row.leadAuthorityStatus as Parameters<typeof calculateLeadInsights>[0]['leadAuthorityStatus'],
      leadBudgetStatus: row.leadBudgetStatus as Parameters<typeof calculateLeadInsights>[0]['leadBudgetStatus'],
      leadPurchaseTimeframe:
        row.leadPurchaseTimeframe as Parameters<typeof calculateLeadInsights>[0]['leadPurchaseTimeframe'],
      leadTechnicalFit: row.leadTechnicalFit as Parameters<typeof calculateLeadInsights>[0]['leadTechnicalFit'],
      leadFollowUpStatus: status,
      firstContactAt: row.firstContactAt,
      createdAt: row.createdAt,
      leadSlaHours: LEAD_FOLLOW_UP_SLA_HOURS[status],
      nextAction: row.nextAction,
      nextActionAt: row.nextActionAt,
      latestActivityAt: activity?.latestActivityAt,
      latestContactOutcome: activity?.latestContactOutcome,
    });
  }

  private qualificationReadiness(
    row: typeof opportunities.$inferSelect,
    context: QualificationContext
  ) {
    const stage = this.qualificationStage(row.qualificationStage);
    const nextStage =
      stage === 'lost' || stage === 'win'
        ? null
        : QUALIFICATION_SEQUENCE[QUALIFICATION_SEQUENCE.indexOf(stage) + 1] ?? null;
    const checks: Array<{ key: string; label: string; complete: boolean }> = [];
    if (stage === 'lead') {
      checks.push(
        { key: 'owner', label: 'Sorumlu atandı', complete: Boolean(row.ownerUserId) },
        { key: 'subject', label: 'Konu girildi', complete: Boolean(row.title?.trim()) }
      );
    } else if (stage === 'c') {
      checks.push(
        { key: 'company', label: 'Firma bağlı', complete: Boolean(context.company) },
        { key: 'contact', label: 'Kontak bağlı', complete: Boolean(row.primaryContactId) },
        { key: 'location', label: 'İl ve ilçe girildi', complete: context.hasLocation },
        { key: 'address', label: 'Açık adres girildi', complete: context.hasAddress },
        { key: 'email', label: 'E-posta girildi', complete: context.hasEmail },
        { key: 'sector', label: 'Sektör girildi', complete: Boolean(context.company?.sector?.trim()) },
        { key: 'phone', label: 'Telefon girildi', complete: context.hasPhone },
        { key: 'subject', label: 'Konu girildi', complete: Boolean(row.title?.trim()) }
      );
    } else if (stage === 'b') {
      checks.push(
        { key: 'call', label: 'Arama yapıldı', complete: context.hasCall },
        { key: 'visit', label: 'Ziyaret yapıldı', complete: context.hasVisit },
        { key: 'machine', label: 'İstenen makine belirlendi', complete: Boolean(row.requestedMachine?.trim()) },
        {
          key: 'payment_method',
          label: 'Ödeme biçimi belirlendi',
          complete: Boolean(row.paymentMethod && row.paymentMethod !== 'undecided'),
        },
        { key: 'quote', label: 'Teklif oluşturuldu', complete: context.hasQuote }
      );
    } else if (stage === 'a') {
      checks.push(
        { key: 'contract_terms', label: 'Sözleşme şartları girildi', complete: Boolean(row.contractTerms?.trim()) },
        { key: 'payment_terms', label: 'Ödeme koşulları girildi', complete: Boolean(row.paymentTerms?.trim()) }
      );
    } else if (stage === 'a_plus') {
      for (const approvalType of ['payment', 'customs', 'invoice', 'installation', 'win'] as OpportunityApprovalType[]) {
        checks.push({
          key: approvalType,
          label: APPROVAL_LABELS[approvalType],
          complete: context.approvals[approvalType] === 'approved',
        });
      }
    }
    const blockers = checks.filter((check) => !check.complete).map((check) => check.label);
    return {
      stage,
      nextStage,
      ready: blockers.length === 0,
      blockers,
      checks,
      approvals: context.approvals,
      health: this.processHealth(row, stage),
    };
  }

  private async processEvidence(opportunityId: string, actor: AuthContext): Promise<ProcessEvidence> {
    const [
      quoteRows,
      proformaRows,
      contractRows,
      paymentPlanRows,
      invoiceRows,
      reservationRows,
      shipmentRows,
      installationRows,
    ] = await Promise.all([
      this.db
        .select({ id: quotes.id, approvedAt: quotes.approvedAt })
        .from(quotes)
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, opportunityId), isNull(quotes.deletedAt))),
      this.db
        .select({ id: proformas.id })
        .from(proformas)
        .innerJoin(quotes, eq(proformas.quoteId, quotes.id))
        .where(
          and(
            eq(proformas.tenantId, actor.tenantId),
            eq(quotes.opportunityId, opportunityId),
            isNull(proformas.deletedAt),
            isNull(quotes.deletedAt)
          )
        ),
      this.db
        .select({ id: contracts.id })
        .from(contracts)
        .innerJoin(quotes, eq(contracts.quoteId, quotes.id))
        .where(
          and(
            eq(contracts.tenantId, actor.tenantId),
            eq(quotes.opportunityId, opportunityId),
            isNull(contracts.deletedAt),
            isNull(quotes.deletedAt)
          )
        ),
      this.db
        .select({ id: receivables.id })
        .from(receivables)
        .innerJoin(quotes, eq(receivables.quoteId, quotes.id))
        .where(
          and(
            eq(receivables.tenantId, actor.tenantId),
            eq(quotes.opportunityId, opportunityId),
            isNull(receivables.deletedAt),
            isNull(quotes.deletedAt)
          )
        ),
      this.db
        .select({ id: commercialInvoices.id, fileId: commercialInvoices.fileId })
        .from(commercialInvoices)
        .innerJoin(quotes, eq(commercialInvoices.quoteId, quotes.id))
        .where(
          and(
            eq(commercialInvoices.tenantId, actor.tenantId),
            eq(quotes.opportunityId, opportunityId),
            isNull(commercialInvoices.deletedAt),
            isNull(quotes.deletedAt)
          )
        ),
      this.db
        .select({ id: inventoryMovements.id })
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.tenantId, actor.tenantId),
            eq(inventoryMovements.referenceType, 'opportunity'),
            eq(inventoryMovements.referenceId, opportunityId),
            eq(inventoryMovements.movementType, 'reserve')
          )
        ),
      this.db
        .select({ id: shipments.id, arrivedAt: shipments.arrivedAt })
        .from(shipments)
        .where(
          and(
            eq(shipments.tenantId, actor.tenantId),
            eq(shipments.opportunityId, opportunityId),
            eq(shipments.direction, 'outgoing'),
            isNull(shipments.deletedAt)
          )
        ),
      this.db
        .select({ id: installationJobs.id, completedAt: installationJobs.completedAt })
        .from(installationJobs)
        .where(
          and(
            eq(installationJobs.tenantId, actor.tenantId),
            eq(installationJobs.opportunityId, opportunityId),
            isNull(installationJobs.deletedAt)
          )
        ),
    ]);

    return {
      hasQuote: quoteRows.length > 0,
      hasApprovedQuote: quoteRows.some((quote) => Boolean(quote.approvedAt)),
      hasProforma: proformaRows.length > 0,
      hasContract: contractRows.length > 0,
      hasPaymentPlan: paymentPlanRows.length > 0,
      hasCommercialInvoice: invoiceRows.length > 0,
      hasCommercialInvoiceFile: invoiceRows.some((invoice) => Boolean(invoice.fileId)),
      hasStockReservation: reservationRows.length > 0,
      hasShipment: shipmentRows.length > 0,
      hasArrivedShipment: shipmentRows.some((shipment) => Boolean(shipment.arrivedAt)),
      hasInstallation: installationRows.length > 0,
      hasCompletedInstallation: installationRows.some((installation) => Boolean(installation.completedAt)),
    };
  }

  /**
   * Elle işaretlenebilen adımlar: A+ alanındaki işlerin bir kısmı CRM dışında
   * yürüdüğü için (gümrükçü, nakliyeci, saha ekibi) satışçı adımı kendi
   * kararıyla kapatabilir. Diğer alanlar kanıta bağlı kalır; aksi hâlde
   * "teklifi yok ama teklif adımı tamam" gibi yalan bir kayıt doğar.
   */
  private manualCheckAllowed(definition: CheckDefinition) {
    return definition.qualificationStage === 'a_plus';
  }

  private async manualProcessChecks(opportunityId: string, actor: AuthContext) {
    const rows = await this.db
      .select({
        checkKey: opportunityProcessChecks.checkKey,
        status: opportunityProcessChecks.status,
        note: opportunityProcessChecks.note,
        updatedAt: opportunityProcessChecks.updatedAt,
        updatedByName: users.fullName,
      })
      .from(opportunityProcessChecks)
      .leftJoin(users, eq(opportunityProcessChecks.updatedBy, users.id))
      .where(
        and(
          eq(opportunityProcessChecks.tenantId, actor.tenantId),
          eq(opportunityProcessChecks.opportunityId, opportunityId)
        )
      );
    return new Map(rows.map((row) => [row.checkKey, row]));
  }

  private applyManualProcessCheck(
    definition: CheckDefinition,
    manual?: {
      status: string;
      note: string | null;
      updatedAt: Date;
      updatedByName: string | null;
    }
  ): CheckDefinition {
    const manualEditable = this.manualCheckAllowed(definition);
    if (!manualEditable || !manual) return { ...definition, manualEditable };
    const status = manual.status === 'done' || manual.status === 'not_done' ? manual.status : null;
    return {
      ...definition,
      manualEditable,
      manualStatus: status,
      note: manual.note ?? null,
      noteUpdatedAt: manual.updatedAt?.toISOString() ?? null,
      noteUpdatedByName: manual.updatedByName ?? null,
      // Elle verilen karar kanıttan türetilen değerin yerine geçer.
      complete: status === 'done' ? true : status === 'not_done' ? false : definition.complete,
    };
  }

  /** A+ adımını "yapıldı / yapılmadı" olarak işaretler; `status: null` işareti kaldırır. */
  async setProcessCheck(
    id: string,
    checkKey: string,
    input: OpportunityProcessCheckUpsertInput,
    actor: AuthContext
  ) {
    const opp = await this.findScopedOpp(id, actor);
    const contexts = await this.qualificationContexts([opp]);
    const evidence = await this.processEvidence(opp.id, actor);
    const definition = this.processCheckDefinitions(opp, contexts.get(opp.id)!, evidence).find(
      (item) => item.key === checkKey
    );
    if (!definition) throw new ValidationError('Bilinmeyen süreç adımı', { field: 'checkKey' });
    if (!this.manualCheckAllowed(definition)) {
      throw new ValidationError('Yalnız A+ adımları elle işaretlenebilir', { field: 'checkKey' });
    }

    const note = input.note?.trim() || null;
    if (input.status === null && !note) {
      await this.db
        .delete(opportunityProcessChecks)
        .where(
          and(
            eq(opportunityProcessChecks.tenantId, actor.tenantId),
            eq(opportunityProcessChecks.opportunityId, id),
            eq(opportunityProcessChecks.checkKey, checkKey)
          )
        );
    } else {
      await this.db
        .insert(opportunityProcessChecks)
        .values({
          tenantId: actor.tenantId,
          opportunityId: id,
          checkKey,
          // İşaret kaldırılıp yalnız yorum bırakıldığında adım kanıta döner;
          // `not_done` burada "kanıt yok" anlamını taşır, kararı bozmaz.
          status: input.status ?? 'not_done',
          note,
          updatedBy: actor.userId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [opportunityProcessChecks.opportunityId, opportunityProcessChecks.checkKey],
          set: {
            status: input.status ?? 'not_done',
            note,
            updatedBy: actor.userId,
            updatedAt: new Date(),
          },
        });
    }

    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.process_check.updated',
      resourceType: 'opportunity',
      resourceId: id,
      newValues: { checkKey, status: input.status ?? null, note },
    });
    return this.get(id, actor);
  }

  private processCheckDefinitions(
    row: typeof opportunities.$inferSelect,
    context: QualificationContext,
    evidence: ProcessEvidence
  ): CheckDefinition[] {
    const check = (
      key: string,
      label: string,
      complete: boolean,
      actionKey: OpportunityProcessActionKey,
      requiredAt: PipelineStageCode,
      qualificationStage: QualificationStageCode
    ): CheckDefinition => ({
      key,
      label,
      complete,
      actionKey,
      requiredAt,
      stageCode: requiredAt,
      qualificationStage,
    });

    return [
      check('owner', 'Sorumlu atandı', Boolean(row.ownerUserId), 'assign_owner', 'sales', 'lead'),
      check('subject', 'Konu girildi', Boolean(row.title?.trim()), 'edit_subject', 'sales', 'lead'),
      /**
       * İlk temas lead alanının işi: `leadSlaBreached` zaten bunun gecikmesini
       * ölçüyordu ama adım listesinde karşılığı yoktu, kaydetme düğmesi iletişim
       * kutusunun dibinde duruyordu. `call` aşamasında zorunlu — lead'den C'ye
       * geçişi kilitlemez, B alanına ilerlemeyi kilitler.
       */
      check('first_contact', 'İlk temas kuruldu', Boolean(row.firstContactAt), 'record_first_contact', 'call', 'lead'),
      check('company', 'Firma bağlı', Boolean(context.company), 'link_company', 'call', 'c'),
      check('contact', 'Kontak bağlı', Boolean(row.primaryContactId), 'link_contact', 'call', 'c'),
      check('location', 'İl ve ilçe girildi', context.hasLocation, 'edit_company', 'call', 'c'),
      check('address', 'Açık adres girildi', context.hasAddress, 'edit_company', 'call', 'c'),
      check('email', 'E-posta girildi', context.hasEmail, 'edit_company', 'call', 'c'),
      check('sector', 'Sektör girildi', Boolean(context.company?.sector?.trim()), 'edit_company', 'call', 'c'),
      check('phone', 'Telefon girildi', context.hasPhone, 'edit_company', 'call', 'c'),
      check('call', 'Arama kaydı oluşturuldu', context.hasCall, 'record_call', 'visit', 'b'),
      check('visit', 'Ziyaret durumu', context.hasVisit, 'record_visit', 'quote', 'b'),
      check('machine', 'İstenen makine belirlendi', Boolean(row.requestedMachine?.trim()), 'edit_machine', 'quote', 'b'),
      check(
        'payment_method',
        'Ödeme biçimi belirlendi',
        Boolean(row.paymentMethod && row.paymentMethod !== 'undecided'),
        'edit_payment_method',
        'quote',
        'b'
      ),
      check('quote', 'Teklif oluşturuldu', evidence.hasQuote, 'create_quote', 'quote', 'b'),
      check('quote_approved', 'Teklif onaylandı', evidence.hasApprovedQuote, 'approve_quote', 'proforma', 'a'),
      check('proforma', 'Proforma oluşturuldu', evidence.hasProforma, 'create_proforma', 'proforma', 'a'),
      check('contract', 'Sözleşme oluşturuldu', evidence.hasContract, 'create_contract', 'contract', 'a'),
      check(
        'contract_terms',
        'Sözleşme şartları girildi',
        Boolean(row.contractTerms?.trim()),
        'edit_contract_terms',
        'contract',
        'a'
      ),
      check(
        'payment_terms',
        'Ödeme koşulları girildi',
        Boolean(row.paymentTerms?.trim()),
        'edit_payment_terms',
        'payment_plan',
        'a'
      ),
      // Peşin ve leasingde vade satırı yoktur; adım plan beklemeden tamamlanmış
      // sayılır, aksi hâlde kart hiç üretilmeyecek bir plana takılı kalıyordu.
      check(
        'payment_plan',
        requiresPaymentPlan(row.paymentMethod) ? 'Ödeme planı oluşturuldu' : 'Ödeme planı gerekmiyor (peşin/leasing)',
        evidence.hasPaymentPlan || !requiresPaymentPlan(row.paymentMethod),
        'create_payment_plan',
        'payment_plan',
        'a'
      ),
      // Ticari fatura A+ alanının İÇİNDE kesilir, A+'ya girmenin koşulu değildir.
      // Kurulumla birlikte WIN kapısında (delivered) aranır.
      check(
        'commercial_invoice',
        'Ticari fatura kaydı oluşturuldu',
        evidence.hasCommercialInvoice,
        'create_commercial_invoice',
        'delivered',
        'a_plus'
      ),
      check(
        'commercial_invoice_file',
        'Ticari fatura dosyası bağlandı',
        evidence.hasCommercialInvoiceFile,
        'create_commercial_invoice',
        'delivered',
        'a_plus'
      ),
      check(
        'customs',
        'Gümrük onayı verildi',
        context.approvals.customs === 'approved',
        'approve_customs',
        'stock_picking',
        'a_plus'
      ),
      check(
        'stock',
        'Geçerli seri numarası rezerve edildi',
        evidence.hasStockReservation,
        'reserve_stock',
        'stock_picking',
        'a_plus'
      ),
      check('shipment', 'Giden sevkiyat oluşturuldu', evidence.hasShipment, 'create_shipment', 'shipping', 'a_plus'),
      check(
        'shipment_arrived',
        'Giden sevkiyatın varış bilgisi tamamlandı',
        evidence.hasArrivedShipment,
        'complete_shipment',
        'installation',
        'a_plus'
      ),
      check(
        'installation',
        'Kurulum kaydı oluşturuldu',
        evidence.hasInstallation,
        'open_installation',
        'delivered',
        'a_plus'
      ),
      check(
        'installation_completed',
        'Kurulum tamamlandı',
        evidence.hasCompletedInstallation,
        'complete_installation',
        'delivered',
        'a_plus'
      ),
      check(
        'payment_approval',
        APPROVAL_LABELS.payment,
        context.approvals.payment === 'approved',
        'approve_payment',
        'delivered',
        'a_plus'
      ),
      check(
        'invoice_approval',
        APPROVAL_LABELS.invoice,
        context.approvals.invoice === 'approved',
        'approve_invoice',
        'delivered',
        'a_plus'
      ),
      check(
        'installation_approval',
        APPROVAL_LABELS.installation,
        context.approvals.installation === 'approved',
        'approve_installation',
        'delivered',
        'a_plus'
      ),
      check(
        'win_approval',
        APPROVAL_LABELS.win,
        context.approvals.win === 'approved',
        'approve_win',
        'delivered',
        'a_plus'
      ),
    ];
  }

  private approvalsInvalidatedByBackwardTarget(targetCode: PipelineStageCode): OpportunityApprovalType[] {
    const targetIndex = PIPELINE_STAGE_FLOW.indexOf(targetCode);
    const invalidated = new Set<OpportunityApprovalType>();
    if (targetIndex < PIPELINE_STAGE_FLOW.indexOf('delivered')) invalidated.add('win');
    if (targetIndex < PIPELINE_STAGE_FLOW.indexOf('installation')) invalidated.add('installation');
    if (targetIndex < PIPELINE_STAGE_FLOW.indexOf('customs_approved')) invalidated.add('customs');
    if (targetIndex < PIPELINE_STAGE_FLOW.indexOf('commercial_invoice')) invalidated.add('invoice');
    if (targetIndex < PIPELINE_STAGE_FLOW.indexOf('payment_plan')) invalidated.add('payment');
    return [...invalidated];
  }

  private async invalidateApprovals(
    opportunityId: string,
    approvalTypes: OpportunityApprovalType[],
    actor: AuthContext,
    reason: string
  ) {
    if (!approvalTypes.length) return;
    await this.db
      .update(opportunityApprovals)
      .set({
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        note: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(opportunityApprovals.tenantId, actor.tenantId),
          eq(opportunityApprovals.opportunityId, opportunityId),
          inArray(opportunityApprovals.approvalType, approvalTypes),
          isNull(opportunityApprovals.deletedAt)
        )
      );
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.approvals.invalidated',
      resourceType: 'opportunity',
      resourceId: opportunityId,
      oldValues: { approvalTypes },
      newValues: { status: 'pending', reason },
    });
  }

  private processTarget(
    axis: ProcessTarget['axis'],
    code: ProcessTarget['code'],
    currentCode: ProcessTarget['code'],
    currentIndex: number,
    targetIndex: number,
    checks: CheckDefinition[],
    targetOperationIndex: number,
    closed: boolean
  ): ProcessTarget {
    const direction = targetIndex === currentIndex ? 'current' : targetIndex > currentIndex ? 'forward' : 'backward';
    const blockers =
      direction === 'forward'
        ? checks
            .filter((item) => PIPELINE_STAGE_FLOW.indexOf(item.requiredAt) <= targetOperationIndex && !item.complete)
            .map(({ requiredAt: _requiredAt, ...item }) => item)
        : [];
    const targetOperationCode = PIPELINE_STAGE_FLOW[Math.max(0, targetOperationIndex)] ?? 'sales';
    const selectable = !closed && direction !== 'current';
    return {
      axis,
      code,
      direction,
      selectable,
      canTransition: selectable && (direction === 'backward' || blockers.length === 0),
      requiresReason: direction === 'backward',
      blockers,
      invalidatedApprovals:
        direction === 'backward' ? this.approvalsInvalidatedByBackwardTarget(targetOperationCode) : [],
    };
  }

  private async opportunityProcessReadiness(
    row: typeof opportunities.$inferSelect,
    currentOperationStage: PipelineStageCode,
    context: QualificationContext,
    actor: AuthContext
  ): Promise<OpportunityProcessReadiness> {
    const evidence = await this.processEvidence(row.id, actor);
    const manualChecks = await this.manualProcessChecks(row.id, actor);
    const definitions = this.processCheckDefinitions(row, context, evidence).map((definition) =>
      this.applyManualProcessCheck(definition, manualChecks.get(definition.key))
    );
    const currentQualificationStage = this.qualificationStage(row.qualificationStage);
    const currentQualificationIndex = QUALIFICATION_SEQUENCE.indexOf(currentQualificationStage);
    const currentOperationIndex = PIPELINE_STAGE_FLOW.indexOf(currentOperationStage);
    const closed = Boolean(row.closedAt) || currentQualificationStage === 'lost';

    const qualificationTargets = QUALIFICATION_SEQUENCE.map((code, targetIndex) => {
      const operationCode = QUALIFICATION_STAGE_ENTRY[code].stage;
      return this.processTarget(
        'qualification',
        code,
        currentQualificationStage,
        currentQualificationIndex,
        targetIndex,
        definitions,
        PIPELINE_STAGE_FLOW.indexOf(operationCode),
        closed
      );
    });
    const operationTargets = PIPELINE_STAGE_FLOW.map((code, targetIndex) =>
      this.processTarget(
        'operation',
        code,
        currentOperationStage,
        currentOperationIndex,
        targetIndex,
        definitions,
        targetIndex,
        closed
      )
    );

    return {
      currentQualificationStage,
      currentOperationStage,
      closed,
      targets: [...qualificationTargets, ...operationTargets],
      checks: definitions.map(({ requiredAt: _requiredAt, ...item }) => item),
    };
  }

  /**
   * Kartın süreç sağlığı: aşamada ne kadar beklediği, lead SLA'sını aşıp aşmadığı
   * ve takip aksiyonunun durumu. Hiçbiri geçişi engellemez; pano ve bildirimler
   * bu alanlara bakar. Aşama yaşı `qualificationUpdatedAt` üzerinden hesaplanır —
   * bu kolon yalnız satış derecesi değiştiğinde yazıldığı için aşamaya giriş anıdır.
   */
  private processHealth(row: typeof opportunities.$inferSelect, stage: QualificationStageCode) {
    const now = Date.now();
    const days = (value: Date | null | undefined) =>
      value ? Math.floor((now - new Date(value).getTime()) / DAY_MS) : null;

    const stageAgeDays = days(row.qualificationUpdatedAt ?? row.createdAt);
    const stageAgeLimitDays = QUALIFICATION_STAGE_AGE_LIMIT_DAYS[stage];
    const terminal = stage === 'win' || stage === 'lost';

    const leadStatus = (row.leadFollowUpStatus ?? 'new') as LeadFollowUpStatusCode;
    const leadSlaHours = isFirstContactStage(stage) ? LEAD_FOLLOW_UP_SLA_HOURS[leadStatus] : null;
    const leadStatusSince = row.leadStatusUpdatedAt ?? row.createdAt;
    const leadStatusAgeHours = leadStatusSince
      ? Math.floor((now - new Date(leadStatusSince).getTime()) / HOUR_MS)
      : null;

    const nextActionAt = row.nextActionAt ? new Date(row.nextActionAt).getTime() : null;

    return {
      stageAgeDays,
      stageAgeLimitDays,
      // Çürüyen kart: aşamada izin verilen süreyi aşmış, kapanmamış kart.
      rotting:
        !terminal &&
        !row.closedAt &&
        stageAgeLimitDays !== null &&
        stageAgeDays !== null &&
        stageAgeDays > stageAgeLimitDays,
      leadStatus,
      leadSlaHours,
      leadStatusAgeHours,
      leadSlaBreached:
        leadSlaHours !== null && leadStatusAgeHours !== null && leadStatusAgeHours > leadSlaHours,
      contactAttemptCount: row.contactAttemptCount ?? 0,
      attemptLimitReached: (row.contactAttemptCount ?? 0) >= LEAD_MAX_CONTACT_ATTEMPTS,
      firstContactAt: row.firstContactAt ?? null,
      // Takip tarihi geçmiş ya da hiç planlanmamış açık kart.
      actionOverdue: !terminal && !row.closedAt && nextActionAt !== null && nextActionAt < now,
      actionMissing: !terminal && !row.closedAt && !row.nextActionAt,
    };
  }

  private async assertCompany(companyId: string, actor: AuthContext) {
    const company = await this.db.query.companies.findFirst({
      where: and(
        eq(companies.id, companyId),
        eq(companies.tenantId, actor.tenantId),
        isNull(companies.deletedAt),
        resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
        (await companyVisibilityFilter(this.db, actor)) ?? sql`true`
      ),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private async assertContact(contactId: string, actor: AuthContext, companyId: string) {
    const contact = await this.db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)),
    });
    if (!contact) throw new NotFoundError('Kontak');
    const [link] = await this.db
      .select({ contactId: contactCompanies.contactId })
      .from(contactCompanies)
      .where(and(eq(contactCompanies.contactId, contactId), eq(contactCompanies.companyId, companyId)))
      .limit(1);
    if (contact.companyId !== companyId && !link) throw new ValidationError('Kontak seçilen firmaya ait değil');
    return contact;
  }

  private hasPermission(actor: AuthContext, permission: string): boolean {
    return actor.roles.includes('super_admin') || actor.permissions.has(permission);
  }

  private async trelloMatchCatalog(actor: AuthContext) {
    const visibility = await companyVisibilityFilter(this.db, actor);
    const filters = [
      eq(companies.tenantId, actor.tenantId),
      isNull(companies.deletedAt),
      resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
      visibility ?? sql`true`,
    ];
    const companyRows = await this.db
      .select({
        id: companies.id,
        legalTitle: companies.legalTitle,
        shortName: companies.shortName,
        taxNumber: companies.taxNumber,
        website: companies.website,
      })
      .from(companies)
      .where(and(...filters));
    const ids = companyRows.map((row) => row.id);
    if (!ids.length) return [];
    const [phones, emails, addresses, contactRows] = await Promise.all([
      this.db
        .select()
        .from(companyPhones)
        .where(and(inArray(companyPhones.companyId, ids), isNull(companyPhones.deletedAt))),
      this.db
        .select()
        .from(companyEmails)
        .where(and(inArray(companyEmails.companyId, ids), isNull(companyEmails.deletedAt))),
      this.db
        .select()
        .from(companyAddresses)
        .where(and(inArray(companyAddresses.companyId, ids), isNull(companyAddresses.deletedAt))),
      this.db
        .select({
          id: contacts.id,
          companyId: contacts.companyId,
          fullName: contacts.fullName,
          workPhone: contacts.workPhone,
          mobilePhone: contacts.mobilePhone,
          workEmail: contacts.workEmail,
          personalEmail: contacts.personalEmail,
        })
        .from(contacts)
        .where(and(inArray(contacts.companyId, ids), isNull(contacts.deletedAt))),
    ]);

    return companyRows.map((company) => {
      const rowPhones = phones.filter((row) => row.companyId === company.id);
      const rowEmails = emails.filter((row) => row.companyId === company.id);
      const rowAddresses = addresses.filter((row) => row.companyId === company.id);
      const primaryAddress =
        rowAddresses.find((row) => row.isDefault) ??
        rowAddresses.find((row) => row.addressType === 'office') ??
        rowAddresses[0];
      return {
        ...company,
        primaryPhone:
          rowPhones.find((row) => row.phoneType === 'main')?.phone ??
          rowPhones.find((row) => row.isDefault)?.phone ??
          null,
        secondaryPhone: rowPhones.find((row) => row.phoneType === 'secondary')?.phone ?? null,
        primaryEmail:
          rowEmails.find((row) => row.emailType === 'main')?.email ??
          rowEmails.find((row) => row.isDefault)?.email ??
          null,
        secondaryEmail: rowEmails.find((row) => row.emailType === 'secondary')?.email ?? null,
        province: primaryAddress?.province ?? null,
        district: primaryAddress?.district ?? null,
        contacts: contactRows.filter((row) => row.companyId === company.id),
      };
    });
  }

  private matchTrelloCandidate(
    candidate: TrelloCompanyCandidate,
    catalog: Awaited<ReturnType<OpportunitiesService['trelloMatchCatalog']>>
  ): TrelloImportPreviewRow['matches'] {
    const candidatePhone = normalizeTrelloPhone(candidate.phone);
    const candidateEmail = candidate.email?.toLocaleLowerCase('en-US') ?? '';
    return catalog
      .map((company) => {
        const match = scoreTrelloCompanyCandidate(candidate, company);
        if (!match) return null;
        const contactMatch = company.contacts.find((contact) => {
          const phones = [contact.workPhone, contact.mobilePhone].map(normalizeTrelloPhone).filter(Boolean);
          const emails = [contact.workEmail, contact.personalEmail]
            .map((value) => value?.toLocaleLowerCase('en-US') ?? '')
            .filter(Boolean);
          return Boolean(
            (candidatePhone && phones.includes(candidatePhone)) ||
              (candidateEmail && emails.includes(candidateEmail))
          );
        });
        return {
          ...match,
          ...(contactMatch
            ? {
                contactMatch: {
                  id: contactMatch.id,
                  fullName: contactMatch.fullName,
                  reason:
                    candidateEmail &&
                    [contactMatch.workEmail, contactMatch.personalEmail]
                      .map((value) => value?.toLocaleLowerCase('en-US') ?? '')
                      .includes(candidateEmail)
                      ? 'E-posta aynı'
                      : 'Telefon aynı',
                },
              }
            : {}),
        };
      })
      .filter((match): match is NonNullable<typeof match> => Boolean(match))
      .sort((left, right) => right.score - left.score || left.legalTitle.localeCompare(right.legalTitle, 'tr'))
      .slice(0, 3);
  }

  private async createTrelloContact(
    tx: any,
    actor: AuthContext,
    companyId: string,
    candidate: TrelloCompanyCandidate
  ): Promise<string | null> {
    if (!candidate.contactName?.trim()) return null;
    if (!this.hasPermission(actor, 'contacts.create')) {
      throw new ForbiddenError('Kontak oluşturmak için contacts.create yetkisi gerekli');
    }
    const normalizedPhone = normalizeTrelloPhone(candidate.phone);
    const normalizedEmail = candidate.email?.toLocaleLowerCase('en-US') ?? '';
    const existing = await tx
      .select({
        id: contacts.id,
        workPhone: contacts.workPhone,
        mobilePhone: contacts.mobilePhone,
        workEmail: contacts.workEmail,
        personalEmail: contacts.personalEmail,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, actor.tenantId),
          eq(contacts.companyId, companyId),
          isNull(contacts.deletedAt)
        )
      );
    const duplicate = existing.find((contact: any) => {
      const phoneMatches =
        normalizedPhone &&
        [contact.workPhone, contact.mobilePhone].some(
          (value) => normalizeTrelloPhone(value) === normalizedPhone
        );
      const emailMatches =
        normalizedEmail &&
        [contact.workEmail, contact.personalEmail].some(
          (value) => value?.toLocaleLowerCase('en-US') === normalizedEmail
        );
      return phoneMatches || emailMatches;
    });
    if (duplicate) return duplicate.id;

    const [created] = await tx
      .insert(contacts)
      .values({
        tenantId: actor.tenantId,
        companyId,
        fullName: normalizePersonName(candidate.contactName),
        mobilePhone: candidate.phone ?? null,
        workEmail: candidate.email ?? null,
        isPrimary: true,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning({ id: contacts.id });
    await tx
      .insert(contactCompanies)
      .values({
        tenantId: actor.tenantId,
        contactId: created.id,
        companyId,
        isPrimary: true,
      })
      .onConflictDoNothing();
    return created.id;
  }

  private async assertUser(userId: string, actor: AuthContext) {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.tenantId, actor.tenantId), isNull(users.deletedAt)),
    });
    if (!user) throw new NotFoundError('Kullanıcı');
    return user;
  }

  async listAssignableOwners(actor: AuthContext) {
    const [userRows, divisionRows] = await Promise.all([
      this.db
        .select({ id: users.id, fullName: users.fullName, email: users.email })
        .from(users)
        .where(
          and(
            eq(users.tenantId, actor.tenantId),
            eq(users.status, 'active'),
            isNull(users.deletedAt)
          )
        )
        .orderBy(asc(users.fullName)),
      this.db
        .select({ userId: userDivisions.userId, divisionId: userDivisions.divisionId })
        .from(userDivisions)
        .innerJoin(users, eq(userDivisions.userId, users.id))
        .where(
          and(
            eq(users.tenantId, actor.tenantId),
            eq(users.status, 'active'),
            isNull(users.deletedAt)
          )
        ),
    ]);
    const divisionIdsByUser = new Map<string, string[]>();
    for (const row of divisionRows) {
      const divisionIds = divisionIdsByUser.get(row.userId) ?? [];
      divisionIds.push(row.divisionId);
      divisionIdsByUser.set(row.userId, divisionIds);
    }
    return userRows.map((row) => ({
      id: row.id,
      name: row.fullName?.trim() || row.email,
      divisionIds: divisionIdsByUser.get(row.id) ?? [],
    }));
  }

  private normalizeAssignmentValue(value: string | null | undefined) {
    return (value ?? '')
      .trim()
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private async eligibleAssignmentUsers(
    assigneeUserIds: string[],
    tenantId: string,
    divisionId: string | null
  ) {
    if (!assigneeUserIds.length) return [];
    const activeSalesRows = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.status, 'active'),
          isNull(users.deletedAt),
          eq(roles.code, 'sales'),
          inArray(users.id, assigneeUserIds)
        )
      );
    const activeIds = new Set(activeSalesRows.map((row) => row.id));
    if (!activeIds.size) return [];
    if (divisionId) {
      const memberships = await this.db
        .select({ userId: userDivisions.userId })
        .from(userDivisions)
        .where(
          and(
            eq(userDivisions.divisionId, divisionId),
            inArray(userDivisions.userId, [...activeIds])
          )
        );
      const divisionIds = new Set(memberships.map((row) => row.userId));
      for (const userId of activeIds) {
        if (!divisionIds.has(userId)) activeIds.delete(userId);
      }
    }
    return assigneeUserIds.filter((userId) => activeIds.has(userId));
  }

  private async assertAssignmentAssignees(
    assigneeUserIds: string[],
    tenantId: string,
    divisionId: string | null
  ) {
    const eligible = await this.eligibleAssignmentUsers(assigneeUserIds, tenantId, divisionId);
    if (eligible.length !== assigneeUserIds.length) {
      throw new ValidationError(
        'Atama kuralındaki tüm kullanıcılar aktif satış kullanıcısı olmalı ve seçilen bölüme bağlı olmalıdır',
        { field: 'assigneeUserIds' }
      );
    }
  }

  private async resolveLeadOwner(input: {
    tenantId: string;
    divisionId: string | null;
    city?: string | null;
    product?: string | null;
    sourceCode?: string | null;
  }) {
    const rules = await this.db
      .select()
      .from(leadAssignmentRules)
      .where(
        and(
          eq(leadAssignmentRules.tenantId, input.tenantId),
          eq(leadAssignmentRules.active, true),
          isNull(leadAssignmentRules.deletedAt),
          input.divisionId
            ? or(eq(leadAssignmentRules.divisionId, input.divisionId), isNull(leadAssignmentRules.divisionId))
            : isNull(leadAssignmentRules.divisionId)
        )
      )
      .orderBy(asc(leadAssignmentRules.priority), asc(leadAssignmentRules.createdAt));

    const city = this.normalizeAssignmentValue(input.city);
    const product = this.normalizeAssignmentValue(input.product);
    const sourceCode = this.normalizeAssignmentValue(input.sourceCode);
    for (const rule of rules) {
      const criteria = rule.criteria ?? { cities: [], productTerms: [], sourceCodes: [] };
      const cityMatches =
        !criteria.cities.length ||
        criteria.cities.some((value) => this.normalizeAssignmentValue(value) === city);
      const productMatches =
        !criteria.productTerms.length ||
        criteria.productTerms.some((value) => product.includes(this.normalizeAssignmentValue(value)));
      const sourceMatches =
        !criteria.sourceCodes.length ||
        criteria.sourceCodes.some((value) => this.normalizeAssignmentValue(value) === sourceCode);
      if (!cityMatches || !productMatches || !sourceMatches) continue;

      const eligible = await this.eligibleAssignmentUsers(
        rule.assigneeUserIds,
        input.tenantId,
        input.divisionId
      );
      if (!eligible.length) continue;

      const ownerUserId = await this.db.transaction(async (tx) => {
        await tx
          .insert(leadAssignmentCursors)
          .values({ ruleId: rule.id, nextIndex: 0 })
          .onConflictDoNothing();
        const cursorResult = await tx.execute(
          sql`select next_index from lead_assignment_cursors where rule_id = ${rule.id} for update`
        );
        const row = cursorResult.rows[0] as { next_index?: number | string } | undefined;
        const nextIndex = Number(row?.next_index ?? 0);
        const selected = eligible[nextIndex % eligible.length];
        await tx
          .update(leadAssignmentCursors)
          .set({ nextIndex: nextIndex + 1, updatedAt: new Date() })
          .where(eq(leadAssignmentCursors.ruleId, rule.id));
        return selected;
      });
      return { ownerUserId, ruleId: rule.id };
    }
    return { ownerUserId: null, ruleId: null };
  }

  private async notifyUnassignedLead(
    opportunityId: string,
    title: string,
    tenantId: string,
    divisionId: string | null
  ) {
    await this.db.insert(notifications).values({
      tenantId,
      divisionId,
      type: 'lead_unassigned',
      title: 'Sahipsiz fırsat atama bekliyor',
      body: `${title} için eşleşen aktif satış kullanıcısı bulunamadı.`,
      entityType: 'opportunity',
      entityId: opportunityId,
    });
  }

  async listAssignmentRules(actor: AuthContext) {
    const filters = [
      eq(leadAssignmentRules.tenantId, actor.tenantId),
      isNull(leadAssignmentRules.deletedAt),
    ];
    const scoped = resourceDivisionFilter(actor, 'lead_assignment_rules', leadAssignmentRules.divisionId);
    if (scoped) filters.push(scoped);
    return this.db
      .select()
      .from(leadAssignmentRules)
      .where(and(...filters))
      .orderBy(asc(leadAssignmentRules.priority), asc(leadAssignmentRules.createdAt));
  }

  private resolveAssignmentRuleDivision(actor: AuthContext, requested: string | null | undefined) {
    if (requested) {
      return resolveAssignedResourceDivision(actor, 'lead_assignment_rules', requested);
    }
    const resourceScopes = actor.accessScopes.filter(
      (scope) => scope.resource === 'lead_assignment_rules'
    );
    const canManageAllDivisions = resourceScopes.length
      ? resourceScopes.some((scope) => scope.divisionId === null)
      : actor.canViewAllDivisions;
    if (canManageAllDivisions) return null;
    const scopedDivision = resolveAssignedResourceDivision(actor, 'lead_assignment_rules', null);
    if (!scopedDivision) {
      throw new ForbiddenError('Fırsat atama kuralı için erişilebilir bir bölüm bulunamadı');
    }
    return scopedDivision;
  }

  async createAssignmentRule(input: LeadAssignmentRuleCreateInput, actor: AuthContext) {
    const divisionId = this.resolveAssignmentRuleDivision(actor, input.divisionId);
    await this.assertAssignmentAssignees(input.assigneeUserIds, actor.tenantId, divisionId);
    const [row] = await this.db
      .insert(leadAssignmentRules)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        name: input.name,
        priority: input.priority,
        active: input.active,
        criteria: input.criteria,
        assigneeUserIds: input.assigneeUserIds,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'lead_assignment_rule.created',
      resourceType: 'lead_assignment_rule',
      resourceId: row.id,
      newValues: row,
    });
    return row;
  }

  private async findAssignmentRule(id: string, actor: AuthContext) {
    const row = await this.db.query.leadAssignmentRules.findFirst({
      where: and(
        eq(leadAssignmentRules.id, id),
        eq(leadAssignmentRules.tenantId, actor.tenantId),
        isNull(leadAssignmentRules.deletedAt),
        resourceDivisionFilter(actor, 'lead_assignment_rules', leadAssignmentRules.divisionId) ?? sql`true`
      ),
    });
    if (!row) throw new NotFoundError('Fırsat atama kuralı');
    return row;
  }

  async updateAssignmentRule(id: string, input: LeadAssignmentRuleUpdateInput, actor: AuthContext) {
    const existing = await this.findAssignmentRule(id, actor);
    const divisionId =
      input.divisionId !== undefined
        ? this.resolveAssignmentRuleDivision(actor, input.divisionId)
        : existing.divisionId;
    const assigneeUserIds = input.assigneeUserIds ?? existing.assigneeUserIds;
    await this.assertAssignmentAssignees(assigneeUserIds, actor.tenantId, divisionId);
    const patch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.criteria !== undefined ? { criteria: input.criteria } : {}),
      ...(input.assigneeUserIds !== undefined ? { assigneeUserIds: input.assigneeUserIds } : {}),
      ...(input.divisionId !== undefined ? { divisionId } : {}),
      updatedAt: new Date(),
      updatedBy: actor.userId,
    };
    const [updated] = await this.db
      .update(leadAssignmentRules)
      .set(patch)
      .where(eq(leadAssignmentRules.id, id))
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'lead_assignment_rule.updated',
      resourceType: 'lead_assignment_rule',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return updated;
  }

  async deleteAssignmentRule(id: string, actor: AuthContext) {
    const existing = await this.findAssignmentRule(id, actor);
    const deletedAt = new Date();
    await this.db
      .update(leadAssignmentRules)
      .set({ active: false, deletedAt, updatedAt: deletedAt, updatedBy: actor.userId })
      .where(eq(leadAssignmentRules.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'lead_assignment_rule.deleted',
      resourceType: 'lead_assignment_rule',
      resourceId: id,
      oldValues: existing,
      newValues: { deletedAt: deletedAt.toISOString() },
    });
    return { ok: true };
  }

  private async tenantHasActiveDivisions(actor: AuthContext): Promise<boolean> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(divisions)
      .where(and(eq(divisions.tenantId, actor.tenantId), eq(divisions.isActive, true)));
    return (row?.count ?? 0) > 0;
  }

  private inventoryScopeFilters(actor: AuthContext, divisionId?: string | null) {
    const filters = [resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId) ?? sql`true`];
    if (divisionId) filters.push(or(eq(inventoryItems.divisionId, divisionId), isNull(inventoryItems.divisionId)) ?? sql`true`);
    return filters;
  }

  async leadSummary(actor: AuthContext) {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const visibility = await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId);
    const filters = [
      eq(opportunities.tenantId, actor.tenantId),
      isNull(opportunities.deletedAt),
      sql`${opportunities.createdAt} >= ${since}`,
      resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`,
      allowUnlinkedCompanyRecords(opportunities.companyId, visibility),
    ];
    const rows = await this.db
      .select({
        opp: opportunities,
        sourceCode: contactSources.code,
        sourceName: contactSources.name,
        ownerId: users.id,
        ownerName: users.fullName,
      })
      .from(opportunities)
      .leftJoin(contactSources, eq(opportunities.sourceId, contactSources.id))
      .leftJoin(users, eq(opportunities.ownerUserId, users.id))
      .where(and(...filters));

    const firstStageRows = rows.filter((row) => isFirstContactStage(this.qualificationStage(row.opp.qualificationStage)));
    const firstContactHours = rows
      .filter((row) => row.opp.firstContactAt)
      .map((row) =>
        Math.max(0, (new Date(row.opp.firstContactAt!).getTime() - new Date(row.opp.createdAt).getTime()) / HOUR_MS)
      )
      .sort((a, b) => a - b);
    const middle = Math.floor(firstContactHours.length / 2);
    const medianFirstContactHours = firstContactHours.length
      ? firstContactHours.length % 2
        ? firstContactHours[middle]
        : (firstContactHours[middle - 1] + firstContactHours[middle]) / 2
      : null;
    const progressed = rows.filter((row) => !isFirstContactStage(this.qualificationStage(row.opp.qualificationStage)));
    const conversionHistory = await this.db
      .select({
        conversionOverride: opportunityQualificationHistory.conversionOverride,
      })
      .from(opportunityQualificationHistory)
      .innerJoin(opportunities, eq(opportunityQualificationHistory.opportunityId, opportunities.id))
      .where(
        and(
          eq(opportunityQualificationHistory.tenantId, actor.tenantId),
          eq(opportunityQualificationHistory.fromStage, 'c'),
          eq(opportunityQualificationHistory.toStage, 'b'),
          sql`${opportunityQualificationHistory.createdAt} >= ${since}`,
          resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`,
          allowUnlinkedCompanyRecords(opportunities.companyId, visibility)
        )
      );

    const breakdown = (
      keyFor: (row: (typeof rows)[number]) => { key: string; label: string }
    ) => {
      const grouped = new Map<string, { key: string; label: string; total: number; converted: number }>();
      for (const row of rows) {
        const item = keyFor(row);
        const current = grouped.get(item.key) ?? { ...item, total: 0, converted: 0 };
        current.total += 1;
        if (!isFirstContactStage(this.qualificationStage(row.opp.qualificationStage))) current.converted += 1;
        grouped.set(item.key, current);
      }
      return [...grouped.values()]
        .map((item) => ({
          ...item,
          conversionRate: item.total ? Math.round((item.converted / item.total) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.total - a.total);
    };

    return {
      periodDays: 30,
      totalCreated: rows.length,
      activeLeads: firstStageRows.length,
      medianFirstContactHours:
        medianFirstContactHours === null ? null : Math.round(medianFirstContactHours * 10) / 10,
      contactedWithinFourHoursRate: firstContactHours.length
        ? Math.round((firstContactHours.filter((hours) => hours <= 4).length / firstContactHours.length) * 1000) / 10
        : null,
      slaBreaches: firstStageRows.filter((row) =>
        this.processHealth(row.opp, 'c').leadSlaBreached
      ).length,
      actionlessLeads: firstStageRows.filter((row) => !row.opp.nextAction?.trim() || !row.opp.nextActionAt).length,
      unassignedLeads: firstStageRows.filter((row) => !row.opp.ownerUserId).length,
      conversionRate: rows.length ? Math.round((progressed.length / rows.length) * 1000) / 10 : 0,
      justifiedConversionRate: conversionHistory.length
        ? Math.round(
            (conversionHistory.filter((row) => row.conversionOverride).length / conversionHistory.length) * 1000
          ) / 10
        : 0,
      bySource: breakdown((row) => ({
        key: row.sourceCode ?? 'unknown',
        label: row.sourceName ?? 'Kaynak yok',
      })),
      byProduct: breakdown((row) => ({
        key: row.opp.requestedMachine?.trim() || row.opp.title,
        label: row.opp.requestedMachine?.trim() || row.opp.title,
      })),
      byOwner: breakdown((row) => ({
        key: row.ownerId ?? 'unassigned',
        label: row.ownerName ?? 'Sahipsiz havuz',
      })),
    };
  }

  async list(
    actor: AuthContext,
    query: {
      search?: string;
      stageCode?: string;
      qualificationStage?: QualificationStageCode;
      lifecycle?: 'lead' | 'opportunity';
      companyId?: string;
      view?: 'active' | 'closed' | 'all';
    },
    page: Pagination
  ) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt)];
    // Mantıksal kapanış filtresi (deletedAt'ten ayrı): aktif pano kapatılmamışları;
    // "Geçmiş/Arşiv" (view=closed) kapatılanları (teslim+iptal); all=ikisi de gösterir.
    const view = query.view ?? 'active';
    if (view === 'active') filters.push(isNull(opportunities.closedAt));
    else if (view === 'closed') filters.push(isNotNull(opportunities.closedAt));
    if (query.search) {
      filters.push(
        or(
          ilike(opportunities.title, `%${query.search}%`),
          ilike(opportunities.leadContactName, `%${query.search}%`),
          ilike(opportunities.leadCompanyTitle, `%${query.search}%`)
        )!
      );
    }
    if (query.companyId) filters.push(eq(opportunities.companyId, query.companyId));
    if (query.qualificationStage) filters.push(eq(opportunities.qualificationStage, query.qualificationStage));
    if (query.lifecycle === 'lead') filters.push(eq(opportunities.qualificationStage, 'lead'));
    if (query.lifecycle === 'opportunity') filters.push(sql`${opportunities.qualificationStage} <> 'lead'`);
    if (query.stageCode) {
      const stage = await this.stageRowByCode(query.stageCode);
      filters.push(eq(opportunities.currentStageId, stage.id));
    }
    const scoped = resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId);
    if (scoped) filters.push(scoped);
    const visibility = await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId);
    filters.push(allowUnlinkedCompanyRecords(opportunities.companyId, visibility));
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(where);
    const rows = await this.db
      .select({
        opp: opportunities,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        primaryContact: { id: contacts.id, fullName: contacts.fullName },
        stage: { id: pipelineStages.id, code: pipelineStages.code, name: pipelineStages.name },
        currency: { id: currencies.id, code: currencies.code },
        source: { id: contactSources.id, code: contactSources.code, name: contactSources.name },
        lostReason: { id: cancellationReasons.id, code: cancellationReasons.code, name: cancellationReasons.name },
        lostCompetitor: { id: competitors.id, name: competitors.name },
      })
      .from(opportunities)
      .leftJoin(
        companies,
        and(
          eq(opportunities.companyId, companies.id),
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
        ),
      )
      .leftJoin(
        contacts,
        and(
          eq(opportunities.primaryContactId, contacts.id),
          eq(contacts.tenantId, actor.tenantId),
          isNull(contacts.deletedAt),
        ),
      )
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .leftJoin(currencies, eq(opportunities.currencyId, currencies.id))
      .leftJoin(contactSources, eq(opportunities.sourceId, contactSources.id))
      .leftJoin(cancellationReasons, eq(opportunities.lostReasonId, cancellationReasons.id))
      .leftJoin(competitors, eq(opportunities.lostCompetitorId, competitors.id))
      .where(where)
      .orderBy(desc(opportunities.createdAt))
      .limit(limit)
      .offset(offset);
    const opportunityRows = rows.map((row) => row.opp);
    const [contexts, activityContexts] = await Promise.all([
      this.qualificationContexts(opportunityRows),
      this.leadActivityContexts(opportunityRows),
    ]);
    return buildPaginated(
      rows.map((r) => ({
        ...r.opp,
        company: r.company?.id ? r.company : null,
        primaryContact: r.primaryContact?.id ? r.primaryContact : null,
        stage: r.stage,
        currency: r.currency,
        source: r.source?.id ? r.source : null,
        lostReason: r.lostReason?.id ? r.lostReason : null,
        lostCompetitor: r.lostCompetitor?.id ? r.lostCompetitor : null,
        qualificationReadiness: this.qualificationReadiness(r.opp, contexts.get(r.opp.id)!),
        leadInsights: this.leadInsights(r.opp, activityContexts.get(r.opp.id)),
      })),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId);
    const row = await this.db
      .select({
        opp: opportunities,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        primaryContact: { id: contacts.id, fullName: contacts.fullName },
        stage: { id: pipelineStages.id, code: pipelineStages.code, name: pipelineStages.name },
        currency: { id: currencies.id, code: currencies.code },
        source: { id: contactSources.id, code: contactSources.code, name: contactSources.name },
        lostReason: { id: cancellationReasons.id, code: cancellationReasons.code, name: cancellationReasons.name },
        lostCompetitor: { id: competitors.id, name: competitors.name },
      })
      .from(opportunities)
      .leftJoin(
        companies,
        and(
          eq(opportunities.companyId, companies.id),
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
        ),
      )
      .leftJoin(
        contacts,
        and(
          eq(opportunities.primaryContactId, contacts.id),
          eq(contacts.tenantId, actor.tenantId),
          isNull(contacts.deletedAt),
        ),
      )
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .leftJoin(currencies, eq(opportunities.currencyId, currencies.id))
      .leftJoin(contactSources, eq(opportunities.sourceId, contactSources.id))
      .leftJoin(cancellationReasons, eq(opportunities.lostReasonId, cancellationReasons.id))
      .leftJoin(competitors, eq(opportunities.lostCompetitorId, competitors.id))
      .where(
        and(
          eq(opportunities.id, id),
          eq(opportunities.tenantId, actor.tenantId),
          isNull(opportunities.deletedAt),
          resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`,
          allowUnlinkedCompanyRecords(opportunities.companyId, visibility)
        )
      )
      .limit(1);
    if (!row.length) throw new NotFoundError('Fırsat');
    const r = row[0];

    const history = await this.db
      .select()
      .from(opportunityStageHistory)
      .where(eq(opportunityStageHistory.opportunityId, id))
      .orderBy(desc(opportunityStageHistory.createdAt));
    const historyStageIds = Array.from(
      new Set(
        history
          .flatMap((item) => [item.fromStageId, item.toStageId])
          .filter((stageId): stageId is string => Boolean(stageId))
      )
    );
    const historyStages = historyStageIds.length
      ? await this.db
          .select({ id: pipelineStages.id, code: pipelineStages.code, name: pipelineStages.name })
          .from(pipelineStages)
          .where(inArray(pipelineStages.id, historyStageIds))
      : [];
    const historyStageMap = new Map(historyStages.map((stage) => [stage.id, stage]));
    const qualificationHistory = await this.db
      .select()
      .from(opportunityQualificationHistory)
      .where(
        and(
          eq(opportunityQualificationHistory.tenantId, actor.tenantId),
          eq(opportunityQualificationHistory.opportunityId, id)
        )
      )
      .orderBy(desc(opportunityQualificationHistory.createdAt));
    const approvalRows = await this.db
      .select({
        approval: opportunityApprovals,
        decidedByUser: { id: users.id, fullName: users.fullName, email: users.email },
      })
      .from(opportunityApprovals)
      .leftJoin(users, eq(opportunityApprovals.decidedBy, users.id))
      .where(
        and(
          eq(opportunityApprovals.tenantId, actor.tenantId),
          eq(opportunityApprovals.opportunityId, id),
          isNull(opportunityApprovals.deletedAt)
        )
      )
      .orderBy(opportunityApprovals.approvalType);
    const auditHistory = await this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        oldValues: auditLogs.oldValues,
        newValues: auditLogs.newValues,
        createdAt: auditLogs.createdAt,
        actor: { id: users.id, fullName: users.fullName, email: users.email },
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(
        and(
          eq(auditLogs.tenantId, actor.tenantId),
          eq(auditLogs.resourceType, 'opportunity'),
          eq(auditLogs.resourceId, id)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    const [contexts, activityContexts, contactEventRows] = await Promise.all([
      this.qualificationContexts([r.opp]),
      this.leadActivityContexts([r.opp]),
      this.db
        .select({
          id: leadContactEvents.id,
          channel: leadContactEvents.channel,
          outcome: leadContactEvents.outcome,
          occurredAt: leadContactEvents.occurredAt,
          activityId: leadContactEvents.activityId,
          subject: salesActivities.subject,
          note: salesActivities.description,
          result: salesActivities.result,
          nextFollowUpAt: salesActivities.nextFollowUpAt,
          actor: { id: users.id, fullName: users.fullName },
        })
        .from(leadContactEvents)
        .innerJoin(salesActivities, eq(leadContactEvents.activityId, salesActivities.id))
        .leftJoin(users, eq(leadContactEvents.actorUserId, users.id))
        .where(
          and(
            eq(leadContactEvents.tenantId, actor.tenantId),
            eq(leadContactEvents.opportunityId, id)
          )
        )
        .orderBy(desc(leadContactEvents.occurredAt))
        .limit(100),
    ]);
    const qualificationContext = contexts.get(r.opp.id)!;
    const currentOperationStage = (r.stage?.code ?? 'sales') as PipelineStageCode;
    return {
      ...r.opp,
      company: r.company?.id ? r.company : null,
      primaryContact: r.primaryContact?.id ? r.primaryContact : null,
      stage: r.stage,
      currency: r.currency,
      source: r.source?.id ? r.source : null,
      lostReason: r.lostReason?.id ? r.lostReason : null,
      lostCompetitor: r.lostCompetitor?.id ? r.lostCompetitor : null,
      history: history.map((item) => ({
        ...item,
        fromStage: item.fromStageId ? historyStageMap.get(item.fromStageId) ?? null : null,
        toStage: historyStageMap.get(item.toStageId) ?? null,
      })),
      qualificationHistory,
      approvals: approvalRows.map((approval) => ({
        ...approval.approval,
        decidedByUser: approval.decidedByUser?.id ? approval.decidedByUser : null,
      })),
      auditHistory,
      contactEvents: contactEventRows.map((event) => ({
        ...event,
        actor: event.actor?.id ? event.actor : null,
      })),
      leadInsights: this.leadInsights(r.opp, activityContexts.get(r.opp.id)),
      qualificationReadiness: this.qualificationReadiness(r.opp, qualificationContext),
      processReadiness: await this.opportunityProcessReadiness(
        r.opp,
        currentOperationStage,
        qualificationContext,
        actor
      ),
    };
  }

  async create(input: OpportunityCreateInput, actor: AuthContext) {
    if (input.companyId) await this.assertCompany(input.companyId, actor);
    let sourceActivity: { id: string; companyId: string | null; opportunityId: string | null } | null = null;
    if (input.sourceActivityId) {
      if (!this.hasPermission(actor, 'activities.convert')) {
        throw new ForbiddenError('Fırsat dışı aktiviteyi fırsata dönüştürme yetkisi gerekir');
      }
      const filters = [
        eq(salesActivities.id, input.sourceActivityId),
        eq(salesActivities.tenantId, actor.tenantId),
        isNull(salesActivities.deletedAt),
        resourceDivisionFilter(actor, 'activities', salesActivities.divisionId) ?? sql`true`,
      ];
      const activityVisibility = await companyVisibilityExistsFilter(this.db, actor, salesActivities.companyId);
      filters.push(allowUnlinkedCompanyRecords(salesActivities.companyId, activityVisibility));
      const [activity] = await this.db
        .select({
          id: salesActivities.id,
          companyId: salesActivities.companyId,
          opportunityId: salesActivities.opportunityId,
        })
        .from(salesActivities)
        .where(and(...filters))
        .limit(1);
      if (!activity) throw new NotFoundError('Fırsat dışı aktivite');
      if (activity.opportunityId) throw new ConflictError('Bu aktivite zaten bir fırsata bağlı');
      if (!input.companyId || activity.companyId !== input.companyId) {
        throw new ValidationError('Aktivite yalnızca kendi firmasındaki bir fırsata dönüştürülebilir');
      }
      sourceActivity = activity;
    }
    if (input.primaryContactId) {
      if (!input.companyId) throw new ValidationError('Kontak bağlamak için önce firma seçilmelidir');
      await this.assertContact(input.primaryContactId, actor, input.companyId);
    }
    const canAssignOthers = actor.roles.includes('super_admin') || actor.roles.includes('sales');
    if (!canAssignOthers && input.ownerUserId && input.ownerUserId !== actor.userId) {
      throw new ForbiddenError('Başka bir kullanıcıya lead atamak için satış kartı güncelleme yetkisi gerekir');
    }
    const requestedOwner = input.ownerUserId ? await this.assertUser(input.ownerUserId, actor) : null;
    if (requestedOwner && requestedOwner.status !== 'active') {
      throw new ValidationError('Yalnızca aktif kullanıcılar sorumlu olarak atanabilir', { field: 'ownerUserId' });
    }

    // Yeni kart fırsatın ilk adımında (Lead kolonu) doğar.
    const entryStage = await this.stageRowByCode(QUALIFICATION_STAGE_ENTRY.lead.stage);
    const currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    const sourceId = await lookupIdByCode(this.db, contactSources, input.sourceCode);
    const disqualifyReasonId = input.disqualifyReasonCode
      ? (await this.resolveCancellationReason(input.disqualifyReasonCode.trim(), actor)).id
      : null;
    const openStatus = await this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'open') });
    const divisionId = resolveAssignedResourceDivision(actor, 'opportunities', input.divisionId ?? null);
    if (!divisionId && (await this.tenantHasActiveDivisions(actor))) {
      throw new ValidationError('Fırsat için bölüm ataması zorunludur', { field: 'divisionId' });
    }
    const assignment = input.ownerUserId
      ? { ownerUserId: input.ownerUserId, ruleId: null }
      : await this.resolveLeadOwner({
          tenantId: actor.tenantId,
          divisionId,
          city: input.leadCity,
          product: `${input.title} ${input.requestedMachine ?? ''}`,
          sourceCode: input.sourceCode,
        });

    const row = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(opportunities)
        .values({
        tenantId: actor.tenantId,
        divisionId,
        companyId: input.companyId ?? null,
        primaryContactId: input.primaryContactId ?? null,
        ownerUserId: assignment.ownerUserId,
        title: input.title,
        description: input.description ?? null,
        leadContactName: input.leadContactName?.trim() || null,
        leadCompanyTitle: input.leadCompanyTitle?.trim() || null,
        leadContactValue: input.leadContactValue?.trim() || null,
        leadCity: input.leadCity?.trim() || null,
        leadDistrict: input.leadDistrict?.trim() || null,
        leadPhone: input.leadPhone?.trim() || null,
        leadEmail: input.leadEmail?.trim() || null,
        leadTemperature: input.leadTemperature ?? 'unknown',
        leadNeedSummary: input.leadNeedSummary?.trim() || null,
        leadAuthorityStatus: input.leadAuthorityStatus ?? 'unknown',
        leadBudgetStatus: input.leadBudgetStatus ?? 'unknown',
        leadPurchaseTimeframe: input.leadPurchaseTimeframe ?? 'unknown',
        leadTechnicalFit: input.leadTechnicalFit ?? 'unknown',
        leadTechnicalNote: input.leadTechnicalNote?.trim() || null,
        leadFollowUpStatus: input.leadFollowUpStatus ?? 'new',
        // SLA saati kartın havuza düştüğü andan itibaren işler.
        leadStatusUpdatedAt: new Date(),
        disqualifyReasonId,
        nextAction: input.nextAction?.trim() || null,
        nextActionAt: input.nextActionAt ?? null,
        currentStageId: entryStage.id,
        estimatedValue: input.estimatedValue?.toString() ?? null,
        currencyId,
        probability: input.probability,
        expectedCloseDate: input.expectedCloseDate ?? null,
        paymentTermDays: input.paymentTermDays ?? null,
        paymentMethod: input.paymentMethod ?? 'undecided',
        qualificationStage: 'lead',
        qualificationNote: input.qualificationNote?.trim() || null,
        qualificationUpdatedAt: new Date(),
        requestedMachine: input.requestedMachine?.trim() || null,
        contractTerms: input.contractTerms?.trim() || null,
        paymentTerms: input.paymentTerms?.trim() || null,
        sourceId,
        statusId: openStatus?.id ?? null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
        })
        .returning();
      await tx.insert(opportunityStageHistory).values({
        tenantId: actor.tenantId,
        opportunityId: created.id,
        fromStageId: null,
        toStageId: entryStage.id,
        changedBy: actor.userId,
        changeReason: sourceActivity ? 'Fırsat dışı aktiviteden oluşturuldu (Lead adımı)' : 'Fırsat oluşturuldu (Lead adımı)',
      });
      await tx.insert(opportunityQualificationHistory).values({
        tenantId: actor.tenantId,
        opportunityId: created.id,
        fromStage: null,
        toStage: 'lead',
        changedBy: actor.userId,
        changeReason: sourceActivity ? 'Fırsat dışı aktiviteden oluşturuldu (Lead adımı)' : 'Fırsat oluşturuldu (Lead adımı)',
      });

      if (sourceActivity) {
        const [linked] = await tx
          .update(salesActivities)
          .set({
            opportunityId: created.id,
            divisionId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(salesActivities.id, sourceActivity.id),
              eq(salesActivities.tenantId, actor.tenantId),
              eq(salesActivities.companyId, input.companyId!),
              isNull(salesActivities.opportunityId),
              isNull(salesActivities.deletedAt),
            ),
          )
          .returning({ id: salesActivities.id });
        if (!linked) throw new ConflictError('Aktivite başka bir fırsata taşındı; yeni fırsat oluşturulmadı');
      }

      return created;
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.created',
      resourceType: 'opportunity',
      resourceId: row.id,
      newValues: {
        title: row.title,
        ownerUserId: row.ownerUserId,
        assignmentRuleId: assignment.ruleId,
        sourceActivityId: sourceActivity?.id ?? null,
      },
    });
    if (!row.ownerUserId) {
      await this.notifyUnassignedLead(row.id, row.title, actor.tenantId, divisionId);
    }
    return this.get(row.id, actor);
  }

  async previewTrelloImport(input: TrelloImportPreviewRequest, actor: AuthContext) {
    const cleanBase64 = input.fileBase64.includes(',') ? input.fileBase64.split(',').pop() ?? '' : input.fileBase64;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
      throw new ValidationError('CSV dosyası geçerli Base64 biçiminde değil');
    }
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (!buffer.length) throw new ValidationError('CSV dosyası okunamadı');
    if (buffer.length > TRELLO_IMPORT_MAX_BYTES) {
      throw new ValidationError('Trello CSV dosyası en fazla 2 MB olabilir');
    }

    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter: ',' | ';' =
      (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
    const matrix = parseTrelloCsv(text, delimiter);
    const headerRowIndex = matrix
      .slice(0, 10)
      .findIndex((row) => row.some((cell) => TRELLO_HEADER_MAP[normalizeTrelloHeader(cell)] === 'title'));
    if (headerRowIndex < 0) {
      throw new ValidationError('CSV içinde "Card Name" / "Kart Adı" kolonu bulunamadı');
    }

    const headers = matrix[headerRowIndex].map((header) => TRELLO_HEADER_MAP[normalizeTrelloHeader(header)]);
    const rawRows = matrix.slice(headerRowIndex + 1).filter((row) => row.some((cell) => cleanTrelloCell(cell)));
    if (!rawRows.length) throw new ValidationError('CSV dosyasında aktarılacak Trello kartı bulunamadı');
    if (rawRows.length > TRELLO_IMPORT_MAX_ROWS) {
      throw new ValidationError(`Tek aktarımda en fazla ${TRELLO_IMPORT_MAX_ROWS} Trello kartı yüklenebilir`);
    }

    const matchCatalog = await this.trelloMatchCatalog(actor);
    const rows: TrelloImportPreviewRow[] = rawRows.map((rawRow, rawIndex) => {
      const source: Record<string, string> = {};
      headers.forEach((field, columnIndex) => {
        if (field && source[field] === undefined) source[field] = cleanTrelloCell(rawRow[columnIndex]);
      });

      const warnings: string[] = [];
      const errors: string[] = [];
      const rawTitle = source.title ?? '';
      const rawDescription = source.description ?? '';
      const rawCardUrl = source.cardUrl ?? '';
      const cardUrl = safeTrelloUrl(rawCardUrl);
      const trelloCardId = source.trelloCardId?.slice(0, 128) || undefined;
      if (!rawTitle) errors.push('Kart adı boş');
      if (!trelloCardId && !cardUrl) errors.push('Kart kimliği veya bağlantısı yok');
      if (rawTitle.length > 255) warnings.push('Kart adı 255 karaktere kısaltıldı');
      if (rawDescription.length > 3200) warnings.push('Açıklama 3200 karaktere kısaltıldı');
      if (rawCardUrl && !cardUrl) warnings.push('Geçersiz kart bağlantısı yok sayıldı');
      if (source.dueAt && !parseTrelloDate(source.dueAt)) warnings.push('Geçersiz son tarih yok sayıldı');
      if (source.trelloCreatedAt && !parseTrelloDate(source.trelloCreatedAt)) {
        warnings.push('Geçersiz oluşturma tarihi yok sayıldı');
      }

      const externalReference = (
        trelloCardId
          ? `trello:${trelloCardId}`
          : cardUrl
            ? `trello:url:${cardUrl}`
            : `trello:satir:${rawIndex + headerRowIndex + 2}`
      ).slice(0, 320);
      const parsed = trelloImportRowSchema.safeParse({
        rowNumber: rawIndex + headerRowIndex + 2,
        trelloCardId,
        externalReference,
        title: rawTitle.slice(0, 255),
        description: rawDescription.slice(0, 3200) || undefined,
        boardName: source.boardName?.slice(0, 255) || undefined,
        listName: source.listName?.slice(0, 255) || undefined,
        cardUrl,
        labels: source.labels?.slice(0, 1000) || undefined,
        members: source.members?.slice(0, 1000) || undefined,
        dueAt: parseTrelloDate(source.dueAt ?? ''),
        trelloCreatedAt: parseTrelloDate(source.trelloCreatedAt ?? ''),
        archived: parseTrelloBoolean(source.archived ?? ''),
        stageCode: suggestedStageForTrelloList(source.listName ?? ''),
      });
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((issue) => issue.message));
      }
      const fallback = {
        rowNumber: rawIndex + headerRowIndex + 2,
        trelloCardId,
        externalReference,
        title: rawTitle.slice(0, 255) || '(Adsız Trello kartı)',
        description: rawDescription.slice(0, 3200) || undefined,
        boardName: source.boardName?.slice(0, 255) || undefined,
        listName: source.listName?.slice(0, 255) || undefined,
        cardUrl,
        labels: source.labels?.slice(0, 1000) || undefined,
        members: source.members?.slice(0, 1000) || undefined,
        dueAt: parseTrelloDate(source.dueAt ?? ''),
        trelloCreatedAt: parseTrelloDate(source.trelloCreatedAt ?? ''),
        archived: parseTrelloBoolean(source.archived ?? ''),
        stageCode: suggestedStageForTrelloList(source.listName ?? ''),
      } satisfies TrelloImportRowInput;
      const row = parsed.success ? parsed.data : fallback;
      const candidate = extractTrelloCompanyCandidate(row.title, row.description);
      if (row.archived) warnings.push('Arşivlenmiş Trello kartı');
      return {
        ...row,
        candidate,
        matches: this.matchTrelloCandidate(candidate, matchCatalog),
        status: errors.length ? 'error' : 'create',
        errors: Array.from(new Set(errors)),
        warnings: Array.from(new Set(warnings)),
      };
    });

    const candidateReferences = Array.from(
      new Set(rows.filter((row) => row.status === 'create').map((row) => row.externalReference))
    );
    const legacyReferences = rows
      .filter((row) => row.status === 'create')
      .flatMap((row) => [row.cardUrl, row.trelloCardId ? `trello:${row.trelloCardId}` : undefined])
      .filter((value): value is string => Boolean(value));
    const existingReferences = candidateReferences.length
      ? await this.db
          .select({
            externalReference: opportunities.externalKey,
            legacyReference: opportunities.leadContactValue,
          })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.tenantId, actor.tenantId),
              isNull(opportunities.deletedAt),
              or(
                inArray(opportunities.externalKey, candidateReferences),
                legacyReferences.length
                  ? inArray(opportunities.leadContactValue, legacyReferences)
                  : sql`false`
              )
            )
          )
      : [];
    const duplicates = new Set(
      existingReferences
        .flatMap((row) => [row.externalReference, row.legacyReference])
        .filter((value): value is string => Boolean(value))
    );
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.status !== 'create') continue;
      const legacyDuplicate = Boolean(
        (row.cardUrl && duplicates.has(row.cardUrl)) ||
          (row.trelloCardId && duplicates.has(`trello:${row.trelloCardId}`))
      );
      if (duplicates.has(row.externalReference) || legacyDuplicate || seen.has(row.externalReference)) {
        row.status = 'skip';
        row.warnings.push(
          duplicates.has(row.externalReference) || legacyDuplicate
            ? 'Bu Trello kartı daha önce aktarıldı'
            : 'Dosyada aynı kart birden fazla kez var'
        );
      }
      seen.add(row.externalReference);
    }

    const summary = {
      total: rows.length,
      create: rows.filter((row) => row.status === 'create').length,
      skip: rows.filter((row) => row.status === 'skip').length,
      error: rows.filter((row) => row.status === 'error').length,
    };
    return {
      fileName: input.fileName,
      headerRowNumber: headerRowIndex + 1,
      rows,
      summary,
      capabilities: {
        canCreateCompany: this.hasPermission(actor, 'companies.create'),
        canUpdateCompany: this.hasPermission(actor, 'companies.update'),
        canCreateContact: this.hasPermission(actor, 'contacts.create'),
      },
    };
  }

  async commitTrelloImport(input: TrelloImportCommitRequest, actor: AuthContext) {
    const divisionId = resolveAssignedResourceDivision(actor, 'opportunities', input.divisionId);
    if (!divisionId) throw new ValidationError('Trello kartları için bölüm seçimi zorunludur', { field: 'divisionId' });
    const [currencyId, customerRelationId, potentialStatusId] = await Promise.all([
      lookupIdByCode(this.db, currencies, input.currencyCode),
      lookupIdByCode(this.db, companyRelationTypes, 'customer'),
      lookupIdByCode(this.db, companyStatuses, 'potential'),
    ]);
    const openStatus = await this.db.query.opportunityStatuses.findFirst({
      where: eq(opportunityStatuses.code, 'open'),
    });
    const candidateReferences = Array.from(new Set(input.rows.map((row) => row.externalReference)));
    const existingRows = await this.db
      .select({
        externalReference: opportunities.externalKey,
        legacyReference: opportunities.leadContactValue,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenantId, actor.tenantId),
          isNull(opportunities.deletedAt),
          or(
            inArray(opportunities.externalKey, candidateReferences),
            inArray(opportunities.leadContactValue, candidateReferences)
          )
        )
      );
    const seen = new Set(
      existingRows
        .flatMap((row) => [row.externalReference, row.legacyReference])
        .filter((value): value is string => Boolean(value))
    );
    const stageCache = new Map<PipelineStageCode, Awaited<ReturnType<OpportunitiesService['stageRowByCode']>>>();
    const results: Array<{
      rowNumber: number;
      trelloCardId?: string;
      title: string;
      status: TrelloImportStatus;
      opportunityId?: string;
      errors: string[];
    }> = [];

    for (const candidate of input.rows) {
      const parsed = trelloResolvedImportRowSchema.safeParse(candidate);
      if (!parsed.success) {
        results.push({
          rowNumber: candidate.rowNumber,
          trelloCardId: candidate.trelloCardId,
          title: candidate.title,
          status: 'error',
          errors: parsed.error.issues.map((issue) => issue.message),
        });
        continue;
      }
      const row = parsed.data;
      if (row.resolution.action === 'skip') {
        await this.audit.write({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'opportunity.trello_import_skipped',
          resourceType: 'trello_import',
          newValues: {
            externalKey: row.externalReference,
            trelloCardId: row.trelloCardId ?? null,
            trelloCardUrl: row.cardUrl ?? null,
            candidate: row.candidate,
            decision: 'skip',
          },
        });
        results.push({
          rowNumber: row.rowNumber,
          trelloCardId: row.trelloCardId,
          title: row.title,
          status: 'skip',
          errors: [],
        });
        continue;
      }
      const resolution = row.resolution;
      if (seen.has(row.externalReference)) {
        results.push({
          rowNumber: row.rowNumber,
          trelloCardId: row.trelloCardId,
          title: row.title,
          status: 'skip',
          errors: [],
        });
        continue;
      }

      try {
        let selectedCompany: typeof companies.$inferSelect | null = null;
        // Eski istemcilerden gelebilecek `lead` eşlemesini de savunmacı olarak
        // C'nin operasyon başlangıcı olan `sales` alanına taşırız.
        const effectiveStageCode: PipelineStageCode = row.stageCode === 'lead' ? 'sales' : row.stageCode;
        let stage = stageCache.get(effectiveStageCode);
        if (!stage) {
          stage = await this.stageRowByCode(effectiveStageCode);
          stageCache.set(effectiveStageCode, stage);
        }
        const assignment =
          stage.code === 'sales'
            ? await this.resolveLeadOwner({
                tenantId: actor.tenantId,
                divisionId,
                city: row.candidate.province,
                product: row.title,
                sourceCode: 'trello',
              })
            : { ownerUserId: actor.userId, ruleId: null };
        if (resolution.action === 'existing') {
          selectedCompany = await this.assertCompany(resolution.companyId, actor);
          if (resolution.primaryContactId) {
            await this.assertContact(resolution.primaryContactId, actor, resolution.companyId);
          }
          if (
            (resolution.addSecondaryPhone || resolution.addSecondaryEmail) &&
            !this.hasPermission(actor, 'companies.update')
          ) {
            throw new ForbiddenError('Firma iletişim bilgisini güncellemek için companies.update yetkisi gerekli');
          }
        } else if (!this.hasPermission(actor, 'companies.create')) {
          throw new ForbiddenError('Yeni firma oluşturmak için companies.create yetkisi gerekli');
        }

        let createdCompanyId: string | null = null;
        let addedSecondaryPhone = false;
        let addedSecondaryEmail = false;
        let acceptedPhoneAction: 'filled_primary' | 'added_secondary' | null = null;
        let acceptedEmailAction: 'filled_primary' | 'added_secondary' | null = null;
        let phoneDifference = false;
        let emailDifference = false;
        let locationDifference = false;
        let existingPhones: string[] = [];
        let existingEmails: string[] = [];
        let existingLocations: Array<{ province: string | null; district: string | null }> = [];
        const created = await this.db.transaction(async (tx) => {
          let companyId: string;
          let primaryContactId =
            resolution.action === 'existing' ? resolution.primaryContactId ?? null : null;

          if (resolution.action === 'create') {
            const [company] = await tx
              .insert(companies)
              .values({
                tenantId: actor.tenantId,
                companyType: 'company',
                relationTypeId: customerRelationId,
                customerStatusId: potentialStatusId,
                legalTitle: normalizeCompanyName(row.candidate.companyTitle),
                website: row.candidate.website ?? null,
                taxNumber: row.candidate.taxNumber ?? null,
                notes: 'Trello CSV aktarımından Potansiyel firma olarak oluşturuldu.',
                createdBy: actor.userId,
                updatedBy: actor.userId,
              })
              .returning({ id: companies.id });
            companyId = company.id;
            createdCompanyId = company.id;
            await tx.insert(companyDivisions).values({
              tenantId: actor.tenantId,
              companyId,
              divisionId,
              addedByUserId: actor.userId,
            });
            if (row.candidate.phone) {
              await tx.insert(companyPhones).values({
                tenantId: actor.tenantId,
                companyId,
                phoneType: 'main',
                phone: row.candidate.phone,
                isDefault: true,
              });
            }
            if (row.candidate.email) {
              await tx.insert(companyEmails).values({
                tenantId: actor.tenantId,
                companyId,
                emailType: 'main',
                email: row.candidate.email,
                isDefault: true,
              });
            }
            if (row.candidate.province || row.candidate.district) {
              await tx.insert(companyAddresses).values({
                tenantId: actor.tenantId,
                companyId,
                addressType: 'office',
                country: 'Türkiye',
                province: row.candidate.province ?? null,
                district: row.candidate.district ?? null,
                fullAddress: row.candidate.locationHint ?? null,
                isDefault: true,
                isShipping: false,
                isBilling: false,
              });
            }
            if (resolution.createContact) {
              primaryContactId = await this.createTrelloContact(tx, actor, companyId, row.candidate);
            }
          } else {
            companyId = resolution.companyId;
            if (row.candidate.phone) {
              const storedPhones = await tx
                .select({ phone: companyPhones.phone })
                .from(companyPhones)
                .where(
                  and(
                    eq(companyPhones.companyId, companyId),
                    isNull(companyPhones.deletedAt)
                  )
                );
              existingPhones = storedPhones.map((item: any) => item.phone).filter(Boolean);
              const normalized = normalizeTrelloPhone(row.candidate.phone);
              phoneDifference = !storedPhones.some(
                (item: any) => normalizeTrelloPhone(item.phone) === normalized
              );
              if (resolution.addSecondaryPhone && phoneDifference) {
                const fillPrimary = storedPhones.length === 0;
                await tx.insert(companyPhones).values({
                  tenantId: actor.tenantId,
                  companyId,
                  phoneType: fillPrimary ? 'main' : 'secondary',
                  phone: row.candidate.phone,
                  isDefault: fillPrimary,
                });
                acceptedPhoneAction = fillPrimary ? 'filled_primary' : 'added_secondary';
                addedSecondaryPhone = !fillPrimary;
              }
            }
            if (row.candidate.email) {
              const storedEmails = await tx
                .select({ email: companyEmails.email })
                .from(companyEmails)
                .where(
                  and(
                    eq(companyEmails.companyId, companyId),
                    isNull(companyEmails.deletedAt)
                  )
                );
              existingEmails = storedEmails.map((item: any) => item.email).filter(Boolean);
              emailDifference = !storedEmails.some(
                (item: any) =>
                  item.email.toLocaleLowerCase('en-US') ===
                  row.candidate.email?.toLocaleLowerCase('en-US')
              );
              if (resolution.addSecondaryEmail && emailDifference) {
                const fillPrimary = storedEmails.length === 0;
                await tx.insert(companyEmails).values({
                  tenantId: actor.tenantId,
                  companyId,
                  emailType: fillPrimary ? 'main' : 'secondary',
                  email: row.candidate.email,
                  isDefault: fillPrimary,
                });
                acceptedEmailAction = fillPrimary ? 'filled_primary' : 'added_secondary';
                addedSecondaryEmail = !fillPrimary;
              }
            }
            if (row.candidate.province || row.candidate.district) {
              existingLocations = await tx
                .select({
                  province: companyAddresses.province,
                  district: companyAddresses.district,
                })
                .from(companyAddresses)
                .where(
                  and(
                    eq(companyAddresses.companyId, companyId),
                    isNull(companyAddresses.deletedAt)
                  )
                );
              locationDifference = !existingLocations.some((address) => {
                const provinceMatches =
                  !row.candidate.province ||
                  normalizeTrelloMatchText(address.province) ===
                    normalizeTrelloMatchText(row.candidate.province);
                const districtMatches =
                  !row.candidate.district ||
                  normalizeTrelloMatchText(address.district) ===
                    normalizeTrelloMatchText(row.candidate.district);
                return provinceMatches && districtMatches;
              });
            }
            if (!primaryContactId && resolution.createContact) {
              primaryContactId = await this.createTrelloContact(tx, actor, companyId, row.candidate);
            }
          }

          const [opportunity] = await tx
            .insert(opportunities)
            .values({
              tenantId: actor.tenantId,
              divisionId,
              companyId,
              primaryContactId,
              ownerUserId: assignment.ownerUserId,
              title: row.title,
              description: row.description?.trim() || null,
              leadContactName: null,
              leadCompanyTitle: null,
              leadContactValue: null,
              externalSource: 'trello',
              externalKey: row.externalReference,
              externalUrl: row.cardUrl ?? null,
              externalMetadata: {
                boardName: row.boardName ?? null,
                listName: row.listName ?? null,
                labels: row.labels ?? null,
                members: row.members ?? null,
                trelloCardId: row.trelloCardId ?? null,
                candidate: row.candidate,
                resolution: resolution.action,
              },
              currentStageId: stage.id,
              qualificationStage: PIPELINE_STAGE_QUALIFICATION[stage.code as PipelineStageCode] ?? 'c',
              qualificationUpdatedAt: new Date(),
              currencyId,
              probability: 50,
              expectedCloseDate: row.dueAt ? new Date(row.dueAt) : null,
              statusId: openStatus?.id ?? null,
              createdBy: actor.userId,
              updatedBy: actor.userId,
              ...(row.trelloCreatedAt ? { createdAt: new Date(row.trelloCreatedAt) } : {}),
            })
            .returning();
          await tx.insert(opportunityStageHistory).values({
            tenantId: actor.tenantId,
            opportunityId: opportunity.id,
            fromStageId: null,
            toStageId: stage.id,
            changedBy: actor.userId,
            changeReason: row.listName
              ? `Trello CSV aktarımı · Liste: ${row.listName}`
              : 'Trello CSV aktarımı',
          });
          await tx.insert(opportunityQualificationHistory).values({
            tenantId: actor.tenantId,
            opportunityId: opportunity.id,
            fromStage: null,
            toStage: PIPELINE_STAGE_QUALIFICATION[stage.code as PipelineStageCode] ?? 'c',
            changedBy: actor.userId,
            changeReason: 'Trello CSV aktarımı',
          });
          return opportunity;
        });

        if (createdCompanyId) {
          await this.audit.write({
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: 'company.created',
            resourceType: 'company',
            resourceId: createdCompanyId,
            newValues: {
              legalTitle: row.candidate.companyTitle,
              customerStatusCode: 'potential',
              source: 'trello',
            },
          });
        }
        if (stage.code === 'sales' && !created.ownerUserId) {
          await this.notifyUnassignedLead(created.id, created.title, actor.tenantId, divisionId);
        }
        if (acceptedPhoneAction || acceptedEmailAction) {
          await this.audit.write({
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: 'company.trello_contact_data_accepted',
            resourceType: 'company',
            resourceId:
              resolution.action === 'existing'
                ? resolution.companyId
                : createdCompanyId,
            newValues: {
              phoneAction: acceptedPhoneAction,
              emailAction: acceptedEmailAction,
              addedSecondaryPhone,
              addedSecondaryEmail,
              trelloCardId: row.trelloCardId,
            },
          });
        }
        if (resolution.action === 'existing' && selectedCompany) {
          const titleDifference =
            normalizeTrelloMatchText(selectedCompany.legalTitle) !==
            normalizeTrelloMatchText(row.candidate.companyTitle);
          const differences: Record<string, unknown> = {};
          if (titleDifference) {
            differences.title = {
              crm: selectedCompany.legalTitle,
              trello: row.candidate.companyTitle,
              decision: 'crm_preserved',
            };
          }
          if (phoneDifference) {
            differences.phone = {
              crm: existingPhones,
              trello: row.candidate.phone,
              decision: acceptedPhoneAction ?? 'rejected',
            };
          }
          if (emailDifference) {
            differences.email = {
              crm: existingEmails,
              trello: row.candidate.email,
              decision: acceptedEmailAction ?? 'rejected',
            };
          }
          if (locationDifference) {
            differences.location = {
              crm: existingLocations,
              trello: {
                province: row.candidate.province ?? null,
                district: row.candidate.district ?? null,
              },
              decision: 'crm_preserved',
            };
          }
          if (row.candidate.contactName) {
            differences.contact = {
              trello: row.candidate.contactName,
              decision: resolution.primaryContactId
                ? 'linked_existing'
                : resolution.createContact
                  ? 'create_or_reuse_approved'
                  : 'rejected',
              contactId: created.primaryContactId ?? null,
            };
          }
          if (Object.keys(differences).length) {
            await this.audit.write({
              tenantId: actor.tenantId,
              actorUserId: actor.userId,
              action: 'company.trello_differences_resolved',
              resourceType: 'company',
              resourceId: resolution.companyId,
              oldValues: { crmMasterRecord: true },
              newValues: {
                externalKey: row.externalReference,
                trelloCardId: row.trelloCardId ?? null,
                differences,
              },
            });
          }
        }
        await this.audit.write({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'opportunity.trello_imported',
          resourceType: 'opportunity',
          resourceId: created.id,
          newValues: {
            title: created.title,
            trelloCardId: row.trelloCardId,
            trelloCardUrl: row.cardUrl,
            trelloBoard: row.boardName,
            trelloList: row.listName,
            candidate: row.candidate,
            companyResolution: resolution,
          },
        });
        seen.add(row.externalReference);
        results.push({
          rowNumber: row.rowNumber,
          trelloCardId: row.trelloCardId,
          title: row.title,
          status: 'create',
          opportunityId: created.id,
          errors: [],
        });
      } catch (error: any) {
        const isDuplicate = (error?.code ?? error?.cause?.code) === '23505';
        results.push({
          rowNumber: row.rowNumber,
          trelloCardId: row.trelloCardId,
          title: row.title,
          status: isDuplicate ? 'skip' : 'error',
          errors: isDuplicate
            ? []
            : [
                error instanceof ValidationError ||
                error instanceof ForbiddenError ||
                error instanceof NotFoundError
                  ? error.message
                  : 'Satış kartı oluşturulamadı',
              ],
        });
      }
    }

    return {
      rows: results,
      summary: {
        total: results.length,
        create: results.filter((row) => row.status === 'create').length,
        skip: results.filter((row) => row.status === 'skip').length,
        error: results.filter((row) => row.status === 'error').length,
      },
    };
  }

  /**
   * Lead takip durumu değiştiğinde SLA sayaçlarını yürütür: duruma giriş anı,
   * temas deneme sayısı, ilk temas anı ve eleme nedeni. Durum yalnız kart hâlâ
   * Lead havuzundayken değiştirilebilir; fırsata çevrilmiş kartta bu alanlar
   * geçmiş kaydı olarak dondurulur.
   */
  private async applyLeadFollowUpTransition(
    patch: Record<string, unknown>,
    existing: { qualificationStage?: string | null; leadFollowUpStatus?: string | null; contactAttemptCount?: number | null; firstContactAt?: Date | null },
    input: OpportunityUpdateInput,
    actor: AuthContext
  ) {
    const nextStatus = input.leadFollowUpStatus ?? undefined;
    if (nextStatus === undefined) {
      // Durum değişmiyorsa yalnız neden kodu güncellemesi anlamsızdır.
      if (input.disqualifyReasonCode !== undefined && existing.leadFollowUpStatus !== 'disqualified') {
        throw new ValidationError('Eleme nedeni yalnız lead elenirken girilebilir', {
          field: 'disqualifyReasonCode',
        });
      }
      if (input.disqualifyReasonCode) {
        patch.disqualifyReasonId = (await this.resolveCancellationReason(input.disqualifyReasonCode, actor)).id;
      }
      return;
    }

    const currentStatus = (existing.leadFollowUpStatus ?? 'new') as LeadFollowUpStatusCode;
    if (nextStatus === currentStatus) return;
    if (!isFirstContactStage(this.qualificationStage(existing.qualificationStage))) {
      throw new ValidationError('İlk temas durumu yalnız Lead ve C alanındaki fırsatlarda değiştirilebilir', {
        field: 'leadFollowUpStatus',
      });
    }

    const now = new Date();
    patch.leadStatusUpdatedAt = now;

    if (nextStatus === 'disqualified') {
      if (!input.disqualifyReasonCode?.trim()) {
        throw new ValidationError('Fırsat uygun değil olarak işaretlenirken neden zorunludur', {
          field: 'disqualifyReasonCode',
        });
      }
      patch.disqualifyReasonId = (await this.resolveCancellationReason(input.disqualifyReasonCode.trim(), actor)).id;
    } else if (currentStatus === 'disqualified') {
      // Lead geri açılıyor; eski eleme nedeni artık geçerli değil.
      patch.disqualifyReasonId = null;
    }

    // "Deneniyor" her seçilişinde bir temas denemesi sayılır.
    if (nextStatus === 'attempting') {
      patch.contactAttemptCount = (existing.contactAttemptCount ?? 0) + 1;
    }
    // Temas kurulduysa ilk temas anı bir kez yazılır (speed-to-lead ölçümü).
    if (nextStatus === 'contacted') {
      if (!existing.firstContactAt) patch.firstContactAt = now;
      if ((existing.contactAttemptCount ?? 0) === 0) patch.contactAttemptCount = 1;
    }
  }

  async update(id: string, input: OpportunityUpdateInput, actor: AuthContext) {
    const existing = await this.get(id, actor);
    const resultingNextAction =
      input.nextAction !== undefined ? input.nextAction?.trim() || null : existing.nextAction?.trim() || null;
    const resultingNextActionAt =
      input.nextActionAt !== undefined ? input.nextActionAt : existing.nextActionAt;
    if (resultingNextActionAt && !resultingNextAction) {
      throw new ValidationError('Takip zamanı için sonraki aksiyon zorunludur', { field: 'nextAction' });
    }
    if (input.companyId === null && existing.companyId) {
      throw new ValidationError('Satış kartına bağlanan firma kaldırılamaz; gerekirse başka bir firma bağlayın');
    }
    const companyId = input.companyId !== undefined ? input.companyId : existing.companyId;
    if (input.companyId) await this.assertCompany(input.companyId, actor);
    if (input.primaryContactId !== undefined) {
      if (input.primaryContactId) {
        if (!companyId) throw new ValidationError('Kontak bağlamak için önce firma seçilmelidir');
        await this.assertContact(input.primaryContactId, actor, companyId);
      }
    } else if (input.companyId !== undefined && existing.primaryContactId) {
      if (companyId) await this.assertContact(existing.primaryContactId, actor, companyId);
    }
    const canReassignOwner = actor.roles.includes('super_admin') || actor.roles.includes('sales');
    if (input.ownerUserId !== undefined && !canReassignOwner) {
      throw new ForbiddenError('Sorumlu kullanıcıyı yalnızca satış veya süper admin değiştirebilir');
    }
    const assignedOwner = input.ownerUserId ? await this.assertUser(input.ownerUserId, actor) : null;
    if (assignedOwner && assignedOwner.status !== 'active') {
      throw new ValidationError('Yalnızca aktif kullanıcılar sorumlu olarak atanabilir', { field: 'ownerUserId' });
    }
    const ownerChanged =
      input.ownerUserId !== undefined
      && (input.ownerUserId ?? null) !== (existing.ownerUserId ?? null);
    const patch: Record<string, unknown> = { updatedBy: actor.userId };
    await this.applyLeadFollowUpTransition(patch, existing, input, actor);
    if (input.currencyCode !== undefined) patch.currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    if (input.sourceCode !== undefined) patch.sourceId = await lookupIdByCode(this.db, contactSources, input.sourceCode);
    if (input.estimatedValue !== undefined) patch.estimatedValue = input.estimatedValue?.toString() ?? null;
    for (const k of [
      'companyId',
      'primaryContactId',
      'ownerUserId',
      'title',
      'description',
      'leadContactName',
      'leadCompanyTitle',
      'leadContactValue',
      'leadCity',
      'leadDistrict',
      'leadPhone',
      'leadEmail',
      'leadTemperature',
      'leadNeedSummary',
      'leadAuthorityStatus',
      'leadBudgetStatus',
      'leadPurchaseTimeframe',
      'leadTechnicalFit',
      'leadTechnicalNote',
      'leadFollowUpStatus',
      'nextAction',
      'nextActionAt',
      'probability',
      'expectedCloseDate',
      'paymentTermDays',
      'paymentMethod',
      'requestedMachine',
      'contractTerms',
      'paymentTerms',
      'qualificationNote',
      'wonReason',
    ] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.companyId === null && input.primaryContactId === undefined) patch.primaryContactId = null;
    const paymentEvidenceChanged =
      (input.paymentMethod !== undefined && (input.paymentMethod ?? null) !== (existing.paymentMethod ?? null)) ||
      (input.paymentTerms !== undefined && (input.paymentTerms?.trim() || null) !== (existing.paymentTerms?.trim() || null)) ||
      (input.paymentTermDays !== undefined && (input.paymentTermDays ?? null) !== (existing.paymentTermDays ?? null));
    const broadEvidenceChanged =
      (input.companyId !== undefined && (input.companyId ?? null) !== (existing.companyId ?? null)) ||
      (input.requestedMachine !== undefined &&
        (input.requestedMachine?.trim() || null) !== (existing.requestedMachine?.trim() || null));
    const invalidatedApprovalTypes: OpportunityApprovalType[] = broadEvidenceChanged
      ? ['payment', 'customs', 'invoice', 'installation', 'win']
      : paymentEvidenceChanged
        ? ['payment', 'win']
        : [];

    await this.db.transaction(async (tx) => {
      await tx.update(opportunities).set(patch).where(eq(opportunities.id, id));
      if (invalidatedApprovalTypes.length) {
        await tx
          .update(opportunityApprovals)
          .set({
            status: 'pending',
            decidedBy: null,
            decidedAt: null,
            note: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(opportunityApprovals.tenantId, actor.tenantId),
              eq(opportunityApprovals.opportunityId, id),
              inArray(opportunityApprovals.approvalType, invalidatedApprovalTypes),
              isNull(opportunityApprovals.deletedAt)
            )
          );
      }
      if (ownerChanged && assignedOwner && assignedOwner.id !== actor.userId) {
        const isLead = existing.qualificationStage === 'lead';
        await tx.insert(notifications).values({
          tenantId: actor.tenantId,
          userId: assignedOwner.id,
          divisionId: existing.divisionId,
          type: isLead ? 'lead_assigned' : 'opportunity_assigned',
          title: isLead ? 'Yeni lead size atandı' : 'Yeni fırsat size atandı',
          body: existing.title,
          entityType: 'opportunity',
          entityId: id,
        });
      }
    });
    if (invalidatedApprovalTypes.length) {
      await this.audit.write({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'opportunity.approvals.invalidated',
        resourceType: 'opportunity',
        resourceId: id,
        oldValues: { approvalTypes: invalidatedApprovalTypes },
        newValues: {
          status: 'pending',
          reason: broadEvidenceChanged ? 'Firma veya makine bilgisi değişti' : 'Ödeme bilgisi değişti',
        },
      });
    }
    if (ownerChanged) {
      await this.audit.write({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'opportunity.owner_changed',
        resourceType: 'opportunity',
        resourceId: id,
        oldValues: { ownerUserId: existing.ownerUserId ?? null },
        newValues: { ownerUserId: input.ownerUserId ?? null },
      });
    }
    return this.get(id, actor);
  }

  async linkCompany(
    id: string,
    input: OpportunityCompanyLinkInput,
    actor: AuthContext
  ) {
    const existing = await this.findScopedOpp(id, actor);
    await this.assertCompany(input.companyId, actor);

    let primaryContactId =
      existing.companyId === input.companyId ? existing.primaryContactId : null;
    if (
      !primaryContactId &&
      input.createContact &&
      actor.permissions.has('contacts.create') &&
      existing.leadContactName?.trim()
    ) {
      const source = existing.sourceId
        ? await this.db.query.contactSources.findFirst({
            where: eq(contactSources.id, existing.sourceId),
          })
        : null;
      const contactValue = existing.leadContactValue?.trim() ?? '';
      // Hızlı lead artık telefon/e-postayı ayrı kolonlarda tutar; eski kayıtlarda
      // tek alanda geldiği için irtibat şekline bakarak ayrıştırılır.
      const isEmail = source?.code === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue);
      const isPhone = source?.code === 'phone' && contactValue.length > 0 && contactValue.length <= 32;
      const phone = existing.leadPhone?.trim() || (isPhone ? contactValue : '');
      const email = existing.leadEmail?.trim() || (isEmail ? contactValue : '');
      const contact = await this.contactsService.create(
        {
          companyId: input.companyId,
          fullName: existing.leadContactName,
          mobilePhone: phone || undefined,
          workEmail: email || undefined,
          notes: [
            'Hızlı lead satış kartından firma kaydına aktarıldı.',
            contactValue && contactValue !== phone && contactValue !== email
              ? `İrtibat bilgisi${source?.name ? ` (${source.name})` : ''}: ${contactValue}`
              : null,
            existing.leadCity?.trim()
              ? `Şehir: ${[existing.leadCity.trim(), existing.leadDistrict?.trim()].filter(Boolean).join(' / ')}`
              : null,
          ]
            .filter(Boolean)
            .join('\n'),
          isPrimary: true,
          isBlacklisted: false,
        },
        actor
      );
      primaryContactId = contact.id;
    }

    await this.db
      .update(opportunities)
      .set({
        companyId: input.companyId,
        primaryContactId,
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, id));
    if (existing.companyId && existing.companyId !== input.companyId) {
      await this.invalidateApprovals(
        id,
        ['payment', 'customs', 'invoice', 'installation', 'win'],
        actor,
        'Fırsata bağlı firma değişti'
      );
    }
    // Firma oluşturulmadan önce karta eklenen aktiviteleri de yeni firmaya bağla.
    await this.db
      .update(salesActivities)
      .set({ companyId: input.companyId, updatedAt: new Date() })
      .where(
        and(
          eq(salesActivities.opportunityId, id),
          eq(salesActivities.tenantId, actor.tenantId),
          isNull(salesActivities.companyId)
        )
      );
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.company_linked',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: { companyId: existing.companyId },
      newValues: { companyId: input.companyId, primaryContactId },
    });
    return this.get(id, actor);
  }

  async delete(id: string, actor: AuthContext) {
    const existing = await this.get(id, actor);
    const deletedAt = new Date();
    await this.db
      .update(opportunities)
      .set({ deletedAt, updatedAt: deletedAt, updatedBy: actor.userId })
      .where(and(eq(opportunities.id, id), eq(opportunities.tenantId, actor.tenantId)));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.deleted',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: {
        title: existing.title,
        qualificationStage: existing.qualificationStage,
        companyId: existing.companyId,
      },
      newValues: { deletedAt: deletedAt.toISOString() },
    });
    return { ok: true, deletedAt: deletedAt.toISOString() };
  }

  private async findScopedOpp(id: string, actor: AuthContext) {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId);
    const opp = await this.db.query.opportunities.findFirst({
      where: and(
        eq(opportunities.id, id),
        eq(opportunities.tenantId, actor.tenantId),
        isNull(opportunities.deletedAt),
        resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`,
        allowUnlinkedCompanyRecords(opportunities.companyId, visibility)
      ),
    });
    if (!opp) throw new NotFoundError('Fırsat');
    return opp;
  }

  private async recordQualificationChange(
    opportunityId: string,
    tenantId: string,
    actorUserId: string,
    fromStage: QualificationStageCode,
    toStage: QualificationStageCode,
    note?: string,
    conversion?: {
      override: boolean;
      fitScore: number;
      engagementScore: number;
      priorityScore: number;
    }
  ) {
    await this.db.insert(opportunityQualificationHistory).values({
      tenantId,
      opportunityId,
      fromStage,
      toStage,
      changedBy: actorUserId,
      changeReason: note?.trim() || null,
      conversionOverride: conversion?.override ?? false,
      fitScore: conversion?.fitScore ?? null,
      engagementScore: conversion?.engagementScore ?? null,
      priorityScore: conversion?.priorityScore ?? null,
    });
  }

  async recordLeadContactEvent(id: string, input: LeadContactEventInput, actor: AuthContext) {
    const opp = await this.findScopedOpp(id, actor);
    if (!isFirstContactStage(this.qualificationStage(opp.qualificationStage))) {
      throw new ValidationError('Temas sonucu yalnızca Lead ve C alanındaki fırsatlarda kullanılabilir');
    }
    if (opp.closedAt) throw new ValidationError('Arşivlenmiş fırsat için temas sonucu kaydedilemez');

    const existingEvent = await this.db.query.leadContactEvents.findFirst({
      where: and(
        eq(leadContactEvents.tenantId, actor.tenantId),
        eq(leadContactEvents.opportunityId, id),
        eq(leadContactEvents.idempotencyKey, input.idempotencyKey)
      ),
    });
    if (existingEvent) return this.get(id, actor);

    const channelLabels: Record<LeadContactEventInput['channel'], string> = {
      phone: 'Giden Arama',
      email: 'E-posta',
      whatsapp: 'WhatsApp',
    };
    const outcomeLabels: Record<LeadContactOutcomeCode, string> = {
      no_answer: 'Yanıt yok',
      contacted: 'Temas kuruldu',
      callback: 'Geri arama istendi',
      requested_info: 'Bilgi istendi',
      meeting_booked: 'Toplantı planlandı',
      not_interested: 'İlgilenmiyor',
      wrong_contact: 'Yanlış kontak',
    };
    const requestedActivityType = input.channel === 'phone' ? 'outgoing_call' : input.channel;
    const activityTypeId =
      (await lookupIdByCode(this.db, activityTypes, requestedActivityType)) ??
      (requestedActivityType === 'outgoing_call'
        ? await lookupIdByCode(this.db, activityTypes, 'call')
        : null);
    if (!activityTypeId) throw new ValidationError('Temas kanalı için aktivite tipi bulunamadı');
    const now = new Date();
    const nextAttemptCount = (opp.contactAttemptCount ?? 0) + 1;
    const successfulContact = !['no_answer', 'wrong_contact'].includes(input.outcome);
    const nextStatus: LeadFollowUpStatusCode =
      input.outcome === 'callback' || input.outcome === 'not_interested'
        ? 'waiting'
        : successfulContact
          ? 'contacted'
          : nextAttemptCount >= LEAD_MAX_CONTACT_ATTEMPTS
            ? 'waiting'
            : 'attempting';

    try {
      await this.db.transaction(async (tx) => {
        const [activity] = await tx
          .insert(salesActivities)
          .values({
            tenantId: actor.tenantId,
            divisionId: opp.divisionId,
            opportunityId: opp.id,
            companyId: opp.companyId,
            contactId: opp.primaryContactId,
            activityTypeId,
            subject: `${channelLabels[input.channel]} · ${outcomeLabels[input.outcome]}`,
            description: input.note?.trim() || null,
            activityDate: now,
            nextFollowUpAt: input.nextActionAt ?? null,
            result: outcomeLabels[input.outcome],
            createdBy: actor.userId,
          })
          .returning({ id: salesActivities.id });
        await tx.insert(leadContactEvents).values({
          tenantId: actor.tenantId,
          opportunityId: opp.id,
          activityId: activity.id,
          idempotencyKey: input.idempotencyKey,
          channel: input.channel,
          outcome: input.outcome,
          actorUserId: actor.userId,
          occurredAt: now,
        });
        await tx
          .update(opportunities)
          .set({
            contactAttemptCount: nextAttemptCount,
            firstContactAt: successfulContact && !opp.firstContactAt ? now : opp.firstContactAt,
            leadFollowUpStatus: nextStatus,
            leadStatusUpdatedAt: now,
            ...(input.nextAction !== undefined
              ? {
                  nextAction: input.nextAction?.trim() || null,
                  nextActionAt: input.nextActionAt ?? null,
                }
              : {}),
            updatedAt: now,
            updatedBy: actor.userId,
          })
          .where(
            and(
              eq(opportunities.id, opp.id),
              eq(opportunities.tenantId, actor.tenantId),
              isNull(opportunities.deletedAt)
            )
          );
      });
    } catch (error) {
      const code = (error as { code?: string; cause?: { code?: string } })?.code
        ?? (error as { cause?: { code?: string } })?.cause?.code;
      if (code === '23505') return this.get(id, actor);
      throw error;
    }

    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'lead.contact_recorded',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: {
        leadFollowUpStatus: opp.leadFollowUpStatus,
        contactAttemptCount: opp.contactAttemptCount,
        nextAction: opp.nextAction,
        nextActionAt: opp.nextActionAt,
      },
      newValues: {
        channel: input.channel,
        outcome: input.outcome,
        leadFollowUpStatus: nextStatus,
        contactAttemptCount: nextAttemptCount,
        nextAction: input.nextAction,
        nextActionAt: input.nextActionAt,
      },
    });
    return this.get(id, actor);
  }

  async convertLead(id: string, input: OpportunityConvertInput, actor: AuthContext) {
    const opp = await this.findScopedOpp(id, actor);
    if (opp.closedAt) throw new ValidationError('Arşivlenmiş lead fırsata çevrilemez');
    const fromStage = this.qualificationStage(opp.qualificationStage);
    if (fromStage !== 'lead') throw new ValidationError('Kayıt zaten fırsata çevrilmiş');
    if (opp.leadFollowUpStatus === 'disqualified') {
      throw new ValidationError('Uygun değil durumundaki fırsat C alanına taşınamaz; önce ilk temas durumunu değiştirin');
    }
    const [contextMap, activityMap] = await Promise.all([
      this.qualificationContexts([opp]),
      this.leadActivityContexts([opp]),
    ]);
    const context = contextMap.get(opp.id)!;
    const insights = this.leadInsights(opp, activityMap.get(opp.id));
    // Lead, satış ekibinin kararıyla her an fırsata çevrilebilir. Eksik alanlar
    // dönüşümü engellemez; C aşamasının hazırlık listesinde görünmeye devam eder.
    // Uyarıları denetim kaydına alarak veri kalitesini görünür tutuyoruz.
    const conversionWarnings: string[] = [];
    if (!opp.ownerUserId) conversionWarnings.push('Sorumlu kullanıcı atanmamış');
    if (
      !opp.leadPhone?.trim() &&
      !opp.leadEmail?.trim() &&
      !opp.leadContactValue?.trim() &&
      !context.hasPhone &&
      !context.hasEmail
    ) {
      conversionWarnings.push('Telefon veya e-posta bilgisi eksik');
    }
    if (!opp.title?.trim() && !opp.requestedMachine?.trim()) {
      conversionWarnings.push('Ürün veya makine bilgisi eksik');
    }
    if (!opp.nextAction?.trim() || !opp.nextActionAt) {
      conversionWarnings.push('Tarihli bir sonraki aksiyon planlanmamış');
    }
    conversionWarnings.push(...new Set([
      ...insights.softBlockers,
      ...(insights.fitScore < 60 ? ['Uyum skoru 60 puanın altında'] : []),
      ...(opp.leadBudgetStatus === 'unavailable' ? ['Bütçe uygun değil'] : []),
      ...(opp.leadTechnicalFit === 'not_fit' ? ['Teknik uyum olumsuz'] : []),
    ]));
    const overrideReason = input.overrideReason?.trim();
    const now = new Date();
    // Fırsata çevrilen kart C alanının giriş aşamasına ("Satış") taşınır;
    // aksi hâlde derece C olurken operasyon ekseni lead'de takılı kalır.
    const entryStage = await this.pipelineStageForQualification(opp, 'c');
    await this.db
      .update(opportunities)
      .set({
        qualificationStage: 'c',
        qualificationNote: input.note?.trim() || overrideReason || opp.qualificationNote,
        qualificationUpdatedAt: now,
        ...(entryStage ? { currentStageId: entryStage.id } : {}),
        updatedAt: now,
        updatedBy: actor.userId,
      })
      .where(eq(opportunities.id, id));
    if (entryStage) {
      await this.db.insert(opportunityStageHistory).values({
        tenantId: actor.tenantId,
        opportunityId: id,
        fromStageId: opp.currentStageId,
        toStageId: entryStage.id,
        changedBy: actor.userId,
        changeReason: 'Fırsata çevrildi (C alanı)',
      });
    }
    const conversionNote = [
      input.note?.trim(),
      overrideReason ? `Dönüşüm gerekçesi: ${overrideReason}` : null,
    ].filter(Boolean).join('\n') || 'Fırsata çevrildi';
    await this.recordQualificationChange(
      id,
      actor.tenantId,
      actor.userId,
      fromStage,
      'c',
      conversionNote,
      {
        override: Boolean(overrideReason),
        fitScore: insights.fitScore,
        engagementScore: insights.engagementScore,
        priorityScore: insights.priorityScore,
      }
    );
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.converted',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: { qualificationStage: fromStage },
      newValues: {
        qualificationStage: 'c',
        conversionOverride: Boolean(overrideReason),
        overrideReason: overrideReason ?? null,
        conversionWarnings,
        fitScore: insights.fitScore,
        engagementScore: insights.engagementScore,
        priorityScore: insights.priorityScore,
      },
    });
    return this.get(id, actor);
  }

  /**
   * Neden kodunu tenant içinde bulur, yoksa açar. LOST nedeni ile lead eleme
   * nedeni aynı lookup tablosunu paylaştığı için iki akış da buradan geçer.
   */
  private async resolveCancellationReason(code: string, actor: AuthContext) {
    const existing = await this.db.query.cancellationReasons.findFirst({
      where: and(eq(cancellationReasons.tenantId, actor.tenantId), eq(cancellationReasons.code, code)),
    });
    if (existing) return existing;
    const [created] = await this.db
      .insert(cancellationReasons)
      .values({
        tenantId: actor.tenantId,
        code,
        // Kod bilinen bir lead eleme nedeniyse Türkçe etiketini kullan.
        name:
          LEAD_DISQUALIFY_REASONS.find((reason) => reason.code === code)?.name
          ?? LOST_REASON_NAMES[code]
          ?? code,
      })
      .returning();
    return created;
  }

  private async setLostQualification(
    opp: typeof opportunities.$inferSelect,
    input: OpportunityQualificationChangeInput,
    actor: AuthContext
  ) {
    if (!input.cancellationReasonCode) {
      throw new ValidationError('LOST aşamasına geçerken kayıp nedeni zorunludur', {
        field: 'cancellationReasonCode',
      });
    }
    const reason = await this.resolveCancellationReason(input.cancellationReasonCode, actor);
    const companySnapshot = opp.companyId
      ? await this.db.query.companies.findFirst({
          where: and(
            eq(companies.id, opp.companyId),
            eq(companies.tenantId, actor.tenantId),
            isNull(companies.deletedAt)
          ),
        })
      : null;
    const competitorSnapshot = input.lostCompetitorId
      ? await this.db.query.competitors.findFirst({
          where: and(
            eq(competitors.id, input.lostCompetitorId),
            eq(competitors.tenantId, actor.tenantId),
            isNull(competitors.deletedAt)
          ),
        })
      : null;
    if (input.lostCompetitorId && !competitorSnapshot) {
      throw new ValidationError('Seçilen rakip bulunamadı');
    }
    const lostStatus = await this.db.query.opportunityStatuses.findFirst({
      where: eq(opportunityStatuses.code, 'lost'),
    });
    const cancelledStage = await this.stageRowByCode('cancelled');
    await this.db
      .update(opportunities)
      .set({
        qualificationStage: 'lost',
        currentStageId: cancelledStage.id,
        qualificationNote: input.note?.trim() || input.lostUnmetConditions?.trim() || null,
        qualificationUpdatedAt: new Date(),
        lostReasonId: reason.id,
        lostCompetitorId: input.lostCompetitorId ?? null,
        lostCompetitorProductModel: input.lostCompetitorProductModel?.trim() || null,
        lostCompanyName:
          companySnapshot?.shortName?.trim()
          || companySnapshot?.legalTitle?.trim()
          || opp.leadCompanyTitle?.trim()
          || null,
        lostProductName:
          input.lostProductName?.trim()
          || opp.requestedMachine?.trim()
          || opp.title?.trim()
          || opp.description?.trim()
          || null,
        lostCompetitorName:
          competitorSnapshot?.name?.trim()
          || input.lostCompetitorName?.trim()
          || null,
        lostUnmetConditions: input.lostUnmetConditions?.trim() || input.note?.trim() || null,
        statusId: lostStatus?.id ?? opp.statusId,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      })
      .where(eq(opportunities.id, opp.id));
    await this.db.insert(opportunityStageHistory).values({
      tenantId: actor.tenantId,
      opportunityId: opp.id,
      fromStageId: opp.currentStageId,
      toStageId: cancelledStage.id,
      changedBy: actor.userId,
      changeReason: input.note?.trim() || 'Fırsat kaybedildi',
    });
  }

  async changeQualificationStage(
    id: string,
    input: OpportunityQualificationChangeInput,
    actor: AuthContext
  ) {
    const opp = await this.findScopedOpp(id, actor);
    if (opp.closedAt) throw new ValidationError('Arşivlenmiş fırsat taşınamaz; önce geri açın');
    const fromStage = this.qualificationStage(opp.qualificationStage);
    const toStage = input.toStage;
    if (fromStage === toStage) return this.get(id, actor);
    const reopeningLost = fromStage === 'lost';

    if (toStage === 'lost') {
      await this.setLostQualification(opp, input, actor);
    } else {
      // LOST satış derecesi dizisinin terminal ucudur. LOST'tan yapılan seçimler
      // hedef dereceye doğrudan geri geçiştir; kart Lead havuzuna düşürülmez.
      const fromIndex = reopeningLost ? QUALIFICATION_SEQUENCE.length : QUALIFICATION_SEQUENCE.indexOf(fromStage);
      const toIndex = QUALIFICATION_SEQUENCE.indexOf(toStage);
      if (toIndex < 0 || fromIndex < 0) throw new ValidationError('Geçersiz satış derecesi');
      const movingForward = !reopeningLost && toIndex > fromIndex;
      if (!movingForward && !input.note?.trim()) {
        throw new ValidationError('Geri geçişte gerekçe zorunludur', { field: 'note' });
      }
      if (movingForward) {
        const contexts = await this.qualificationContexts([opp]);
        const currentStage = await this.db.query.pipelineStages.findFirst({
          where: eq(pipelineStages.id, opp.currentStageId),
        });
        const readiness = await this.opportunityProcessReadiness(
          opp,
          (currentStage?.code ?? 'sales') as PipelineStageCode,
          contexts.get(opp.id)!,
          actor
        );
        const target = readiness.targets.find(
          (item) => item.axis === 'qualification' && item.code === toStage
        );
        if (!target?.canTransition) {
          throw new ValidationError('Hedef satış alanı için eksik gereklilikler var', {
            blockers: target?.blockers ?? [],
            blockerLabels: target?.blockers.map((blocker) => blocker.label) ?? [],
            fromStage,
            toStage,
          });
        }
      }

      const entry = QUALIFICATION_STAGE_ENTRY[toStage];
      const entryStage = await this.stageRowByCode(entry.stage);
      const patch: Record<string, unknown> = {
        qualificationStage: toStage,
        // LOST'tan çıkış gerekçesi geçmişe yazılır; kayıp anındaki kart notu
        // ayrı bir kayıt bilgisi olarak korunur.
        qualificationNote: reopeningLost ? opp.qualificationNote : input.note?.trim() || opp.qualificationNote,
        qualificationUpdatedAt: new Date(),
        currentStageId: entryStage.id,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      };
      if (toStage === 'win') {
        const wonStatus = await this.db.query.opportunityStatuses.findFirst({
          where: eq(opportunityStatuses.code, 'won'),
        });
        if (wonStatus) patch.statusId = wonStatus.id;
      } else if (fromStage === 'win' || reopeningLost) {
        const openStatus = await this.db.query.opportunityStatuses.findFirst({
          where: eq(opportunityStatuses.code, 'open'),
        });
        if (openStatus) patch.statusId = openStatus.id;
      }
      await this.db.update(opportunities).set(patch).where(eq(opportunities.id, id));
      await this.db.insert(opportunityStageHistory).values({
        tenantId: actor.tenantId,
        opportunityId: id,
        fromStageId: opp.currentStageId,
        toStageId: entryStage.id,
        changedBy: actor.userId,
        changeReason: input.note?.trim() || `Satış derecesi ${toStage.toUpperCase()} alanına taşındı`,
      });

      if (!movingForward) {
        await this.invalidateApprovals(
          id,
          this.approvalsInvalidatedByBackwardTarget(entry.stage),
          actor,
          input.note!.trim()
        );
      }
    }

    const qualificationChangeNote = input.note?.trim() || input.lostUnmetConditions?.trim();
    await this.recordQualificationChange(id, actor.tenantId, actor.userId, fromStage, toStage, qualificationChangeNote);
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.qualification.changed',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: { qualificationStage: fromStage },
      newValues: {
        qualificationStage: toStage,
        note: qualificationChangeNote ?? null,
        lostProductName: input.lostProductName ?? null,
        lostUnmetConditions: input.lostUnmetConditions ?? null,
        lostCompetitorId: input.lostCompetitorId ?? null,
        lostCompetitorProductModel: input.lostCompetitorProductModel ?? null,
      },
    });
    return this.get(id, actor);
  }

  private async assertApprovalEvidence(
    opp: typeof opportunities.$inferSelect,
    approvalType: OpportunityApprovalType,
    actor: AuthContext
  ) {
    if (approvalType === 'payment') {
      if (!opp.paymentMethod || opp.paymentMethod === 'undecided' || !opp.paymentTerms?.trim()) {
        throw new ValidationError('Ödeme onayı için ödeme biçimi ve koşulları tamamlanmalıdır');
      }
      return;
    }
    if (approvalType === 'customs') {
      const stage = await this.db.query.pipelineStages.findFirst({ where: eq(pipelineStages.id, opp.currentStageId) });
      const currentIndex = PIPELINE_STAGES.indexOf((stage?.code ?? 'sales') as PipelineStageCode);
      if (currentIndex < PIPELINE_STAGES.indexOf('customs_approved')) {
        throw new ValidationError('Gümrük onayı için operasyon aşaması Gümrük Onayı veya sonrasında olmalıdır');
      }
      return;
    }
    if (approvalType === 'invoice') {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(commercialInvoices)
        .innerJoin(quotes, eq(commercialInvoices.quoteId, quotes.id))
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, opp.id)));
      if (!row?.count) throw new ValidationError('Fatura onayı için satış kartına bağlı ticari fatura gereklidir');
      return;
    }
    if (approvalType === 'installation') {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(installationJobs)
        .where(
          and(
            eq(installationJobs.tenantId, actor.tenantId),
            eq(installationJobs.opportunityId, opp.id),
            isNotNull(installationJobs.completedAt),
            isNull(installationJobs.deletedAt)
          )
        );
      if (!row?.count) throw new ValidationError('Kurulum onayı için tamamlanmış kurulum kaydı gereklidir');
      return;
    }
    for (const evidenceType of ['payment', 'customs', 'invoice', 'installation'] as OpportunityApprovalType[]) {
      await this.assertApprovalEvidence(opp, evidenceType, actor);
    }
    const contexts = await this.qualificationContexts([opp]);
    const approvals = contexts.get(opp.id)!.approvals;
    const blockers = (['payment', 'customs', 'invoice', 'installation'] as OpportunityApprovalType[])
      .filter((type) => approvals[type] !== 'approved')
      .map((type) => APPROVAL_LABELS[type]);
    if (blockers.length) {
      throw new ValidationError('Nihai WIN onayı için önce operasyon onayları tamamlanmalıdır', { blockers });
    }
  }

  async decideQualificationApproval(
    id: string,
    approvalType: OpportunityApprovalType,
    input: OpportunityApprovalDecisionInput,
    actor: AuthContext
  ) {
    const opp = await this.findScopedOpp(id, actor);
    if (approvalType === 'win' && !actor.roles.includes('super_admin')) {
      throw new ForbiddenError('Nihai WIN kararını yalnızca Süperadmin verebilir');
    }
    if (this.qualificationStage(opp.qualificationStage) !== 'a_plus') {
      throw new ValidationError('Onaylar yalnız A+ aşamasındaki fırsatlar için verilebilir');
    }
    if (input.decision === 'approved') await this.assertApprovalEvidence(opp, approvalType, actor);
    const now = new Date();
    await this.db
      .insert(opportunityApprovals)
      .values({
        tenantId: actor.tenantId,
        opportunityId: id,
        approvalType,
        status: input.decision,
        decidedBy: actor.userId,
        decidedAt: now,
        note: input.note?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [opportunityApprovals.opportunityId, opportunityApprovals.approvalType],
        set: {
          status: input.decision,
          decidedBy: actor.userId,
          decidedAt: now,
          note: input.note?.trim() || null,
          deletedAt: null,
          updatedAt: now,
        },
      });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: input.decision === 'approved' ? 'opportunity.approval.approved' : 'opportunity.approval.rejected',
      resourceType: 'opportunity',
      resourceId: id,
      newValues: { approvalType, decision: input.decision, note: input.note ?? null },
    });
    return this.get(id, actor);
  }

  /**
   * Mantıksal kapanış ("Bitir"): WIN/LOST veya eski terminal operasyon aşamasındaki
   * fırsatı arşivler.
   * SİLMEZ — `closedAt` set edilir; aktif panodan düşer ama rapor/geçmiş/servis erişimi için
   * DB'de kalır (krş. `deletedAt`). delivered ise servise devir (customer_devices) idempotent
   * olarak garanti edilir. Yanlış kapanış `reopen` ile geri alınır.
   */
  async close(id: string, actor: AuthContext, reason?: string | null) {
    const opp = await this.findScopedOpp(id, actor);
    if (opp.closedAt) throw new ValidationError('Fırsat zaten kapatılmış');
    const stage = await this.db.query.pipelineStages.findFirst({ where: eq(pipelineStages.id, opp.currentStageId) });
    const qualificationStage = this.qualificationStage(opp.qualificationStage);
    const qualificationTerminal = qualificationStage === 'win' || qualificationStage === 'lost';
    const legacyTerminal = stage?.code === 'delivered' || stage?.code === 'cancelled';
    if (!qualificationTerminal && !legacyTerminal) {
      throw new ValidationError('Yalnız WIN veya LOST durumundaki fırsatlar kapatılabilir');
    }
    if (qualificationStage === 'win' || stage?.code === 'delivered') {
      // Cihaz/garanti kayıtları teslim aşamasında oluşmuş olmalı; oluşmadıysa (stok yok vb.)
      // kapanışı bloke etme — kurulu cihaz envanteri ayrıca düzeltilebilir.
      try {
        await this.ensureWarrantyDevices(opp, actor);
      } catch {
        /* best-effort servise devir */
      }
    }
    const now = new Date();
    await this.db.update(opportunities).set({ closedAt: now, closedBy: actor.userId }).where(eq(opportunities.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.closed',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: { stage: stage?.code ?? null, qualificationStage },
      newValues: { closedAt: now, reason: reason ?? null },
    });
    return this.get(id, actor);
  }

  /**
   * Geri Aç:
   * - LOST kartını satış/süper admin için önceki fırsat derecesine döndürür.
   *   Önceki derece bulunamazsa C kullanılır; kart Lead havuzuna düşmez.
   * - Kayıp snapshot alanları korunur; yalnız terminal durum kaldırılır.
   * - WIN arşivini önceki aktif dereceye döndüren davranışı korur.
   */
  async reopen(id: string, actor: AuthContext) {
    const opp = await this.findScopedOpp(id, actor);
    const terminalStage = this.qualificationStage(opp.qualificationStage);
    const reopeningLost = terminalStage === 'lost';
    if (reopeningLost && !actor.roles.some((role) => role === 'sales' || role === 'super_admin')) {
      throw new ForbiddenError('LOST fırsatı yalnızca satış veya süper admin aktif fırsatlara döndürebilir');
    }
    if (!reopeningLost && !opp.closedAt) throw new ValidationError('Fırsat zaten açık');
    const isQualificationTerminal = terminalStage === 'win' || terminalStage === 'lost';
    let reopenedStage: QualificationStageCode | null = null;
    let reopenedStatusId: string | null = null;
    let entryStage: { id: string } | null = null;

    if (isQualificationTerminal) {
      const previousChange = await this.db.query.opportunityQualificationHistory.findFirst({
        where: and(
          eq(opportunityQualificationHistory.tenantId, actor.tenantId),
          eq(opportunityQualificationHistory.opportunityId, id),
          eq(opportunityQualificationHistory.toStage, terminalStage)
        ),
        orderBy: desc(opportunityQualificationHistory.createdAt),
      });
      const previousStage = previousChange?.fromStage as QualificationStageCode | null | undefined;
      const validPreviousOpportunityStage =
        previousStage &&
        QUALIFICATION_STAGES.includes(previousStage) &&
        previousStage !== 'lead' &&
        previousStage !== 'lost' &&
        previousStage !== terminalStage;
      reopenedStage = validPreviousOpportunityStage
        ? previousStage
        : reopeningLost
          ? 'c'
          : 'a_plus';
      entryStage = await this.stageRowByCode(QUALIFICATION_STAGE_ENTRY[reopenedStage].stage);
      const reopenedStatus = await this.db.query.opportunityStatuses.findFirst({
        where: eq(opportunityStatuses.code, reopenedStage === 'win' ? 'won' : 'open'),
      });
      reopenedStatusId = reopenedStatus?.id ?? null;
    }

    const now = new Date();
    const reopenedStageLabel = reopenedStage === 'a_plus' ? 'A+' : reopenedStage?.toUpperCase();
    const reopenReason = reopeningLost
      ? `LOST kaydından ${reopenedStageLabel ?? 'önceki'} derecesine geri açıldı`
      : 'Geçmişten geri açıldı';
    await this.db.transaction(async (tx) => {
      await tx
        .update(opportunities)
        .set({
          closedAt: null,
          closedBy: null,
          ...(reopenedStage
            ? {
                qualificationStage: reopenedStage,
                qualificationNote: reopeningLost ? opp.qualificationNote : reopenReason,
                qualificationUpdatedAt: now,
                statusId: reopenedStatusId ?? opp.statusId,
                ...(entryStage ? { currentStageId: entryStage.id } : {}),
              }
            : {}),
          updatedAt: now,
          updatedBy: actor.userId,
        })
        .where(eq(opportunities.id, id));

      if (reopenedStage) {
        await tx
          .update(opportunityApprovals)
          .set({
            status: 'pending',
            decidedBy: null,
            decidedAt: null,
            note: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(opportunityApprovals.opportunityId, id),
              ...(reopeningLost ? [] : [eq(opportunityApprovals.approvalType, 'win')]),
              isNull(opportunityApprovals.deletedAt)
            )
          );
        if (entryStage && entryStage.id !== opp.currentStageId) {
          await tx.insert(opportunityStageHistory).values({
            tenantId: actor.tenantId,
            opportunityId: id,
            fromStageId: opp.currentStageId,
            toStageId: entryStage.id,
            changedBy: actor.userId,
            changeReason: reopenReason,
          });
        }
        await tx.insert(opportunityQualificationHistory).values({
          tenantId: actor.tenantId,
          opportunityId: id,
          fromStage: terminalStage,
          toStage: reopenedStage,
          changedBy: actor.userId,
          changeReason: reopenReason,
        });
      }
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.reopened',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: { qualificationStage: terminalStage, closedAt: opp.closedAt },
      newValues: {
        qualificationStage: reopenedStage ?? terminalStage,
        currentStageId: entryStage?.id ?? opp.currentStageId,
        closedAt: null,
      },
    });
    return this.get(id, actor);
  }

  /**
   * Kanban DnD endpoint. Enforces bölüm 3 transition rules:
   *  - cancelled → cancellation_reason zorunlu
   *  - quote → mevcut quote olmalı
   *  - contract → quote'a contract dosyası yüklenmeli
   *  - commercial_invoice → ödeme yöntemi gerektiriyorsa ödeme planı tamamlanmalı
   *  - customs_approved → öncesinde commercial_invoice tamamlanmış olmalı
   *  - stock_picking → customs_approved'tan sonra; inventory_item seçilmeli (reserved'a alınır)
   *  - delivered → ticari fatura + kurulum kanıtları doğrulanır, customer_device kaydı oluşturulur
   */
  /**
   * Derece ilerlediğinde kartı o derecenin giriş aşamasına taşır (ters yön
   * senkron). Kapılı giriş aşamaları (teklif, ticari fatura) atlanır: oralara
   * yalnız changeStage üzerinden, kanıt üretilerek girilir. Kart zaten yeni
   * derecenin alanında ya da ilerisindeyse dokunulmaz.
   */
  private async pipelineStageForQualification(
    opp: typeof opportunities.$inferSelect,
    toStage: QualificationStageCode
  ): Promise<{ id: string; code: PipelineStageCode } | null> {
    const entry = QUALIFICATION_STAGE_ENTRY[toStage];
    if (entry.gated) return null;

    const currentStage = await this.db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.id, opp.currentStageId),
    });
    const currentCode = (currentStage?.code ?? 'sales') as PipelineStageCode;
    // Kartın bulunduğu aşama zaten bu dereceye ya da ilerisine aitse taşıma.
    const currentGrade = PIPELINE_STAGE_QUALIFICATION[currentCode];
    if (currentGrade === toStage) return null;
    if (toStage !== 'lost') {
      const currentIndex = QUALIFICATION_SEQUENCE.indexOf(currentGrade);
      const targetIndex = QUALIFICATION_SEQUENCE.indexOf(toStage);
      if (currentIndex >= 0 && targetIndex >= 0 && currentIndex > targetIndex) return null;
    }

    const row = await this.stageRowByCode(entry.stage);
    return { id: row.id, code: entry.stage };
  }

  /**
   * Operasyon aşamasının karşılık geldiği satış derecesini döndürür — yalnız
   * kartın bulunduğu dereceden İLERİdeyse. Aynı ya da geride ise null döner ve
   * derece olduğu gibi kalır, böylece operasyonda geri adım atmak satış
   * derecesini düşürmez. WIN/LOST kartlar bu senkrondan muaftır.
   */
  private syncQualificationForPipeline(
    opp: typeof opportunities.$inferSelect,
    toStage: PipelineStageCode
  ): QualificationStageCode | null {
    const current = this.qualificationStage(opp.qualificationStage);
    if (current === 'win' || current === 'lost') return null;
    const mapped = PIPELINE_STAGE_QUALIFICATION[toStage];
    if (mapped === current) return null;
    // LOST tek başına kayıp nedeni ister; iptal akışı zaten onu yazıyor.
    if (mapped === 'lost') return 'lost';
    const currentIndex = QUALIFICATION_SEQUENCE.indexOf(current);
    const mappedIndex = QUALIFICATION_SEQUENCE.indexOf(mapped);
    if (currentIndex < 0 || mappedIndex < 0) return null;
    return mappedIndex > currentIndex ? mapped : null;
  }

  async changeStage(id: string, input: OpportunityStageChangeInput, actor: AuthContext) {
    const opp = await this.db.query.opportunities.findFirst({
      where: and(
        eq(opportunities.id, id),
        eq(opportunities.tenantId, actor.tenantId),
        isNull(opportunities.deletedAt),
        resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`
      ),
    });
    if (!opp) throw new NotFoundError('Fırsat');
    if (opp.closedAt) throw new ValidationError('Arşivlenmiş fırsat taşınamaz; önce geri açın');
    if (this.qualificationStage(opp.qualificationStage) === 'lost') {
      throw new ValidationError('LOST kaydını operasyon rayından değil, fırsat derecesi panosundan hedef dereceye taşıyın');
    }

    const fromStage = await this.db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.id, opp.currentStageId),
    });
    if (!fromStage) throw new ValidationError('Mevcut aşama bulunamadı');

    const toStage = await this.stageRowByCode(input.toStage);

    if (input.toStage === 'quote' && !opp.companyId) {
      throw new ValidationError(
        'Teklif aşamasına geçmeden önce firma kaydı oluşturup satış kartına bağlayın',
        { field: 'companyId' }
      );
    }

    if (!PIPELINE_STAGES.includes(input.toStage)) {
      throw new ValidationError(`Bilinmeyen aşama: ${input.toStage}`);
    }
    if (fromStage.code === input.toStage) return this.get(id, actor);

    const fromIndex = PIPELINE_STAGE_FLOW.indexOf(fromStage.code as PipelineStageCode);
    const toIndex = PIPELINE_STAGE_FLOW.indexOf(input.toStage as PipelineStageCode);
    const terminalCancellation = input.toStage === 'cancelled';
    if (!terminalCancellation && (fromIndex < 0 || toIndex < 0)) {
      throw new ValidationError('LOST/iptal akışı normal süreç rayından değiştirilemez');
    }
    const movingForward = !terminalCancellation && toIndex > fromIndex;
    const movingBackward = !terminalCancellation && toIndex < fromIndex;
    if (movingBackward && !input.changeReason?.trim()) {
      throw new ValidationError('Geri geçişte gerekçe zorunludur', { field: 'changeReason' });
    }
    if (movingForward) {
      const contexts = await this.qualificationContexts([opp]);
      const readiness = await this.opportunityProcessReadiness(
        opp,
        fromStage.code as PipelineStageCode,
        contexts.get(opp.id)!,
        actor
      );
      const target = readiness.targets.find(
        (item) => item.axis === 'operation' && item.code === input.toStage
      );
      const blockers = (target?.blockers ?? []).filter(
        (blocker) => !(blocker.key === 'stock' && Boolean(input.inventoryItemIds?.length))
      );
      if (!target || blockers.length) {
        throw new ValidationError('Hedef operasyon adımı için eksik gereklilikler var', {
          blockers,
          blockerLabels: blockers.map((blocker) => blocker.label),
          fromStage: fromStage.code,
          toStage: input.toStage,
        });
      }
    }

    const patch: Record<string, unknown> = { currentStageId: toStage.id, updatedBy: actor.userId };

    if (input.toStage === 'cancelled') {
      if (!input.cancellationReasonCode) throw new ValidationError('İptal nedeni zorunludur', { field: 'cancellationReasonCode' });
      const reason = await this.db.query.cancellationReasons.findFirst({
        where: and(eq(cancellationReasons.tenantId, actor.tenantId), eq(cancellationReasons.code, input.cancellationReasonCode)),
      });
      // Auto-create if missing — lighter UX
      let reasonId = reason?.id;
      if (!reasonId) {
        const [created] = await this.db
          .insert(cancellationReasons)
          .values({
            tenantId: actor.tenantId,
            code: input.cancellationReasonCode,
            name: input.cancellationReasonCode,
          })
          .returning();
        reasonId = created.id;
      }
      patch.lostReasonId = reasonId;
      if (input.lostCompetitorId) patch.lostCompetitorId = input.lostCompetitorId;
      if (input.lostCompetitorProductModel) patch.lostCompetitorProductModel = input.lostCompetitorProductModel;
      const lost = await this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'lost') });
      if (lost) patch.statusId = lost.id;
      patch.qualificationStage = 'lost';
      patch.qualificationUpdatedAt = new Date();
    } else if (movingBackward && this.qualificationStage(opp.qualificationStage) === 'win') {
      const open = await this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'open') });
      if (open) patch.statusId = open.id;
    }

    if (movingForward && input.toStage === 'quote') {
      const qcount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(quotes)
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!qcount[0].c) {
        throw new ValidationError('Quote aşamasına geçmek için en az bir teklif oluşturulmalıdır');
      }
    }
    if (movingForward && input.toStage === 'contract') {
      const ccount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(contracts)
        .innerJoin(quotes, eq(contracts.quoteId, quotes.id))
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!ccount[0].c) throw new ValidationError('Contract aşamasına geçmek için sözleşme dosyası yüklenmelidir');
    }
    // Ticari fatura BU aşamada kesilir; aşamaya girmek için faturanın önceden
    // var olmasını beklemek kartı kendi işine başlayamaz hâle getiriyordu.
    // Faturanın varlığı, kurulumla birlikte `delivered` (WIN) kapısında aranır.
    // Vade satırları yalnız vadeli satışta gerekir — peşin/leasingde plan yoktur.
    if (movingForward && input.toStage === 'commercial_invoice' && requiresPaymentPlan(opp.paymentMethod)) {
      const rcount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(receivables)
        .innerJoin(quotes, eq(receivables.quoteId, quotes.id))
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!rcount[0].c) {
        throw new ValidationError('Ticari fatura aşamasına geçmek için önce ödeme planı oluşturulmalıdır');
      }
    }
    if (movingForward && toIndex >= PIPELINE_STAGE_FLOW.indexOf('stock_picking')) {
      const existingEvidence = await this.processEvidence(id, actor);
      if (!existingEvidence.hasStockReservation) {
      const inventoryItemIds = await this.resolveStockPickingItemIds(opp, actor, input.inventoryItemIds);
      const reserved = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
      const available = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'available') });
      // Verify items belong to tenant
      const items = await this.db.query.inventoryItems.findMany({
        where: and(
          eq(inventoryItems.tenantId, actor.tenantId),
          isNull(inventoryItems.deletedAt),
          inArray(inventoryItems.id, inventoryItemIds),
          ...this.inventoryScopeFilters(actor, opp.divisionId)
        ),
      });
      if (items.length !== inventoryItemIds.length) {
        throw new ValidationError('Bazı stok kalemleri yetki alanınızda değil');
      }
      const now = new Date();
      for (const item of items) {
        const isAvailable = available ? item.stockStatusId === available.id : true;
        const isReservedForCompany = reserved && item.stockStatusId === reserved.id && item.reservedCompanyId === opp.companyId;
        if (!isAvailable && !isReservedForCompany) {
          throw new ValidationError('Sadece stokta olan veya bu firmaya rezerve edilmiş seri nolar seçilebilir');
        }
        const divisionId = item.divisionId ?? opp.divisionId;
        await this.db
          .update(inventoryItems)
          .set({
            divisionId,
            stockStatusId: reserved?.id ?? item.stockStatusId,
            reservedCompanyId: opp.companyId,
            reservedAt: now,
          })
          .where(eq(inventoryItems.id, item.id));
        await this.db.insert(inventoryMovements).values({
          tenantId: actor.tenantId,
          divisionId,
          inventoryItemId: item.id,
          movementType: 'reserve',
          movementDate: now,
          referenceType: 'opportunity',
          referenceId: opp.id,
          notes: 'Kanban stok seçimi',
          createdBy: actor.userId,
        });
      }
      }
    }
    if (movingForward && input.toStage === 'installation') {
      // Garanti, tezgâhın kurulumuyla başlar: rezerve stok kalemlerinden
      // müşteri cihazı / garanti kayıtları oluşturulur (idempotent).
      await this.ensureWarrantyDevices(opp, actor, input.inventoryItemIds);
      // Satıştan servise devir: servis ekibi Kurulum listesinde görebilsin diye
      // bir kurulum kaydı oluşturulur (idempotent).
      await this.ensureInstallationJob(opp, actor);
    }
    if (movingForward && input.toStage === 'delivered') {
      // Cihaz/garanti kayıtları kurulumda oluşturulmuş olabilir; tekrar çağırmak
      // güvenlidir (idempotent). Kurulum atlandıysa burada oluşturulur.
      await this.ensureWarrantyDevices(opp, actor, input.inventoryItemIds);
      const won = await this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'won') });
      if (won) patch.statusId = won.id;
    }

    // Operasyon aşaması, satış derecesinin alt adımıdır: teklif/sözleşme/fatura
    // gibi somut kanıtlar üretildiğinde derece kendiliğinden yükselir. Yalnız
    // ileri yönde çalışır; geri alma satış ekibinin açık kararıdır.
    const mappedQualification = PIPELINE_STAGE_QUALIFICATION[input.toStage as PipelineStageCode];
    const syncedQualification =
      !terminalCancellation && mappedQualification !== this.qualificationStage(opp.qualificationStage)
        ? mappedQualification
        : null;
    if (syncedQualification) {
      patch.qualificationStage = syncedQualification;
      patch.qualificationUpdatedAt = new Date();
    }
    if (movingBackward) {
      await this.invalidateApprovals(
        id,
        this.approvalsInvalidatedByBackwardTarget(input.toStage as PipelineStageCode),
        actor,
        input.changeReason!.trim()
      );
    }

    await this.db.update(opportunities).set(patch).where(eq(opportunities.id, id));
    await this.db.insert(opportunityStageHistory).values({
      tenantId: actor.tenantId,
      opportunityId: id,
      fromStageId: fromStage.id,
      toStageId: toStage.id,
      changedBy: actor.userId,
      changeReason: input.changeReason ?? null,
    });
    if (syncedQualification) {
      await this.recordQualificationChange(
        id,
        actor.tenantId,
        actor.userId,
        this.qualificationStage(opp.qualificationStage),
        syncedQualification,
        `Operasyon aşaması ilerledi: ${toStage.code}`
      );
    } else if (terminalCancellation) {
      await this.recordQualificationChange(
        id,
        actor.tenantId,
        actor.userId,
        this.qualificationStage(opp.qualificationStage),
        'lost',
        input.changeReason ?? input.cancellationReasonCode ?? 'Fırsat kaybedildi'
      );
    }
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.stage.changed',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: { stage: fromStage.code },
      newValues: { stage: toStage.code, reason: input.changeReason },
    });
    return this.get(id, actor);
  }

  private async resolveStockPickingItemIds(
    opp: { id: string; companyId: string | null; divisionId: string | null },
    actor: AuthContext,
    inventoryItemIds?: string[],
  ) {
    if (!opp.companyId) {
      throw new ValidationError('Stok seçimi için önce firma satış kartına bağlanmalıdır');
    }
    const explicitIds = [...new Set(inventoryItemIds ?? [])];
    if (explicitIds.length) return explicitIds;

    const reservationRows = await this.db
      .select({ inventoryItemId: inventoryMovements.inventoryItemId })
      .from(inventoryMovements)
      .where(and(
        eq(inventoryMovements.tenantId, actor.tenantId),
        eq(inventoryMovements.referenceType, 'opportunity'),
        eq(inventoryMovements.referenceId, opp.id),
        eq(inventoryMovements.movementType, 'reserve'),
      ));
    const movementIds = [...new Set(reservationRows.map((row) => row.inventoryItemId))];
    if (movementIds.length) return movementIds;

    const reservedStatus = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
    if (reservedStatus) {
      const reservedRows = await this.db
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.tenantId, actor.tenantId),
          isNull(inventoryItems.deletedAt),
          eq(inventoryItems.stockStatusId, reservedStatus.id),
          eq(inventoryItems.reservedCompanyId, opp.companyId),
          ...this.inventoryScopeFilters(actor, opp.divisionId)
        ));
      if (reservedRows.length) return reservedRows.map((row) => row.id);
    }

    const availableStatus = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'available') });
    if (availableStatus) {
      const availableRows = await this.db
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.tenantId, actor.tenantId),
          isNull(inventoryItems.deletedAt),
          eq(inventoryItems.stockStatusId, availableStatus.id),
          ...this.inventoryScopeFilters(actor, opp.divisionId)
        ));
      if (availableRows.length === 1) return [availableRows[0].id];
      if (availableRows.length > 1) {
        throw new ValidationError('Birden fazla hazır stok var; stok seçimi için seri no seçilmelidir');
      }
    }

    throw new ValidationError('Stok seçimi için en az bir seri no belirtilmelidir');
  }

  /**
   * Rezerve stok kalemlerinden müşteri cihazı (garanti) kaydı üretir.
   * Garanti kurulum aşamasında başlar; idempotenttir — aynı fırsat+kalem için
   * zaten cihaz varsa atlanır, böylece teslim aşaması da çağırdığında çift
   * kayıt oluşmaz.
   */
  private async ensureWarrantyDevices(
    opp: { id: string; companyId: string | null; divisionId: string | null },
    actor: AuthContext,
    inventoryItemIds?: string[],
  ) {
    if (!opp.companyId) {
      throw new ValidationError('Kurulum için önce firma satış kartına bağlanmalıdır');
    }
    const reservedStatus = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
    const soldStatus = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'sold') });
    const activeWarranty = await this.db.query.warrantyStatuses.findFirst({ where: eq(warrantyStatuses.code, 'active') });
    let ids = [...new Set(inventoryItemIds ?? [])];
    if (!ids.length) {
      const existingDevices = await this.db
        .select({ id: customerDevices.id })
        .from(customerDevices)
        .where(and(
          eq(customerDevices.tenantId, actor.tenantId),
          eq(customerDevices.opportunityId, opp.id),
          isNull(customerDevices.deletedAt),
        ))
        .limit(1);
      if (existingDevices.length) return;
    }
    if (!ids.length) {
      const reservationRows = await this.db
        .select({ inventoryItemId: inventoryMovements.inventoryItemId })
        .from(inventoryMovements)
        .where(and(
          eq(inventoryMovements.tenantId, actor.tenantId),
          eq(inventoryMovements.referenceType, 'opportunity'),
          eq(inventoryMovements.referenceId, opp.id),
          eq(inventoryMovements.movementType, 'reserve'),
        ));
      ids = [...new Set(reservationRows.map((row) => row.inventoryItemId))];
    }
    if (!ids.length && reservedStatus) {
      const reservedRows = await this.db
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.tenantId, actor.tenantId),
          isNull(inventoryItems.deletedAt),
          eq(inventoryItems.stockStatusId, reservedStatus.id),
          eq(inventoryItems.reservedCompanyId, opp.companyId),
          ...this.inventoryScopeFilters(actor, opp.divisionId)
        ));
      ids = reservedRows.map((row) => row.id);
    }
    if (!ids.length) {
      throw new ValidationError('Kurulum için bu karta bağlı stok seçimi bulunamadı');
    }
    const selected = await this.db.query.inventoryItems.findMany({
      where: and(
        eq(inventoryItems.tenantId, actor.tenantId),
        isNull(inventoryItems.deletedAt),
        inArray(inventoryItems.id, ids),
        ...this.inventoryScopeFilters(actor, opp.divisionId)
      ),
    });
    if (selected.length !== ids.length) {
      throw new ValidationError('Kurulum için seçilen bazı stok kalemleri bulunamadı');
    }
    for (const item of selected) {
      if (item.reservedCompanyId && item.reservedCompanyId !== opp.companyId) {
        throw new ValidationError('Seçilen stok kalemi bu firmaya rezerve edilmemiş');
      }
      const existing = await this.db
        .select({ id: customerDevices.id, opportunityId: customerDevices.opportunityId })
        .from(customerDevices)
        .where(and(
          eq(customerDevices.tenantId, actor.tenantId),
          eq(customerDevices.inventoryItemId, item.id),
          isNull(customerDevices.deletedAt),
        ))
        .limit(1);
      if (existing.length) {
        if (existing[0].opportunityId === opp.id) continue;
        throw new ValidationError('Seçilen seri no başka bir müşteri cihazına bağlı');
      }
      await this.db.insert(customerDevices).values({
        tenantId: actor.tenantId,
        divisionId: opp.divisionId,
        companyId: opp.companyId,
        initialCompanyId: opp.companyId,
        inventoryItemId: item.id,
        opportunityId: opp.id,
        saleDate: new Date(),
        deliveryDate: new Date(),
        warrantyStartDate: new Date(),
        warrantyEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        statusId: activeWarranty?.id ?? null,
      });
      if (soldStatus) {
        await this.db.update(inventoryItems).set({ stockStatusId: soldStatus.id }).where(eq(inventoryItems.id, item.id));
      }
    }
  }

  /**
   * Satış hattı kurulum aşamasına gelince servis ekibinin Kurulum listesinde
   * görebilmesi için bir kurulum kaydı oluşturur. Idempotenttir — bu fırsat için
   * zaten kurulum kaydı varsa yenisini oluşturmaz.
   */
  private async ensureInstallationJob(
    opp: { id: string; companyId: string | null; divisionId: string | null; primaryContactId?: string | null; ownerUserId?: string | null },
    actor: AuthContext,
  ) {
    if (!opp.companyId) {
      throw new ValidationError('Kurulum için önce firma satış kartına bağlanmalıdır');
    }
    const existing = await this.db
      .select({ id: installationJobs.id, customerDeviceId: installationJobs.customerDeviceId })
      .from(installationJobs)
      .where(and(eq(installationJobs.tenantId, actor.tenantId), eq(installationJobs.opportunityId, opp.id)))
      .limit(1);
    // Kurulumu (varsa) bu fırsat için oluşturulmuş müşteri cihazına bağla.
    const device = await this.db
      .select({ id: customerDevices.id })
      .from(customerDevices)
      .where(and(eq(customerDevices.tenantId, actor.tenantId), eq(customerDevices.opportunityId, opp.id)))
      .limit(1);
    // Kurulum A+ alanında faturayla paralel önceden planlandıysa aynı kaydı
    // koru; stoktan oluşan müşteri cihazını operasyon kurulum adımında bağla.
    if (existing.length) {
      if (!existing[0].customerDeviceId && device[0]?.id) {
        await this.db
          .update(installationJobs)
          .set({ customerDeviceId: device[0].id })
          .where(eq(installationJobs.id, existing[0].id));
      }
      return;
    }
    const scheduled = await this.db.query.installationStatuses.findFirst({
      where: eq(installationStatuses.code, 'scheduled'),
    });
    await this.db.insert(installationJobs).values({
      tenantId: actor.tenantId,
      divisionId: opp.divisionId,
      opportunityId: opp.id,
      companyId: opp.companyId,
      contactId: opp.primaryContactId ?? null,
      customerDeviceId: device[0]?.id ?? null,
      statusId: scheduled?.id ?? null,
      scheduledDate: new Date(),
      assignedToUserId: opp.ownerUserId ?? actor.userId,
    });
  }
}
