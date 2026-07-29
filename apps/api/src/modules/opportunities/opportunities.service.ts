import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  opportunities,
  opportunityApprovals,
  opportunityQualificationHistory,
  opportunityStageHistory,
  salesActivities,
  visits,
  calls,
} from '../../db/schema/crm';
import {
  companies,
  companyAddresses,
  companyDivisions,
  companyEmails,
  companyPhones,
  contactCompanies,
  contacts,
} from '../../db/schema/companies';
import { users } from '../../db/schema/users';
import { quotes } from '../../db/schema/quotes';
import { inventoryItems, inventoryMovements, customerDevices } from '../../db/schema/inventory';
import { installationJobs } from '../../db/schema/service';
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
} from '../../db/schema/lookup';
import { cancellationReasons } from '../../db/schema/crm';
import { commercialInvoices, contracts } from '../../db/schema/quotes';
import { receivables } from '../../db/schema/finance';
import { DB } from '../../shared/database/database.module';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type {
  OpportunityCompanyLinkInput,
  OpportunityCreateInput,
  OpportunityApprovalDecisionInput,
  OpportunityConvertInput,
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
  PIPELINE_STAGES,
  QUALIFICATION_STAGES,
  STAGE_TRANSITIONS,
  trelloImportRowSchema,
  trelloResolvedImportRowSchema,
  type PipelineStageCode,
  type OpportunityApprovalType,
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
const APPROVAL_LABELS: Record<OpportunityApprovalType, string> = {
  payment: 'Ödeme onayı',
  customs: 'Gümrük onayı',
  invoice: 'Fatura onayı',
  installation: 'Kurulum onayı',
  win: 'Nihai WIN onayı',
};

type QualificationContext = {
  company: { id: string; sector: string | null } | null;
  hasLocation: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasCall: boolean;
  hasVisit: boolean;
  approvals: Partial<Record<OpportunityApprovalType, 'pending' | 'approved' | 'rejected'>>;
};

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
  return rules.find(([, keywords]) => keywords.some((keyword) => value.includes(keyword)))?.[0] ?? 'lead';
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
      : 'lead';
  }

  private async qualificationContexts(rows: Array<typeof opportunities.$inferSelect>) {
    const opportunityIds = rows.map((row) => row.id);
    const companyIds = [...new Set(rows.map((row) => row.companyId).filter((id): id is string => Boolean(id)))];
    if (!opportunityIds.length) return new Map<string, QualificationContext>();

    const [companyRows, addressRows, phoneRows, emailRows, callRows, visitRows, approvalRows] = await Promise.all([
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
    const callsByOpportunity = new Set(callRows.map((row) => row.opportunityId).filter(Boolean));
    const visitsByOpportunity = new Set(visitRows.map((row) => row.opportunityId).filter(Boolean));
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
            approvals: approvalsByOpportunity.get(row.id) ?? {},
          } satisfies QualificationContext,
        ] as const;
      })
    );
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
        }
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
        stage: { id: pipelineStages.id, code: pipelineStages.code, name: pipelineStages.name },
        currency: { id: currencies.id, code: currencies.code },
        source: { id: contactSources.id, code: contactSources.code, name: contactSources.name },
      })
      .from(opportunities)
      .leftJoin(companies, eq(opportunities.companyId, companies.id))
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .leftJoin(currencies, eq(opportunities.currencyId, currencies.id))
      .leftJoin(contactSources, eq(opportunities.sourceId, contactSources.id))
      .where(where)
      .orderBy(desc(opportunities.createdAt))
      .limit(limit)
      .offset(offset);
    const contexts = await this.qualificationContexts(rows.map((row) => row.opp));
    return buildPaginated(
      rows.map((r) => ({
        ...r.opp,
        company: r.company?.id ? r.company : null,
        stage: r.stage,
        currency: r.currency,
        source: r.source?.id ? r.source : null,
        qualificationReadiness: this.qualificationReadiness(r.opp, contexts.get(r.opp.id)!),
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
        stage: { id: pipelineStages.id, code: pipelineStages.code, name: pipelineStages.name },
        currency: { id: currencies.id, code: currencies.code },
        source: { id: contactSources.id, code: contactSources.code, name: contactSources.name },
      })
      .from(opportunities)
      .leftJoin(companies, eq(opportunities.companyId, companies.id))
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .leftJoin(currencies, eq(opportunities.currencyId, currencies.id))
      .leftJoin(contactSources, eq(opportunities.sourceId, contactSources.id))
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
    const contexts = await this.qualificationContexts([r.opp]);
    return {
      ...r.opp,
      company: r.company?.id ? r.company : null,
      stage: r.stage,
      currency: r.currency,
      source: r.source?.id ? r.source : null,
      history,
      qualificationHistory,
      approvals: approvalRows.map((approval) => ({
        ...approval.approval,
        decidedByUser: approval.decidedByUser?.id ? approval.decidedByUser : null,
      })),
      qualificationReadiness: this.qualificationReadiness(r.opp, contexts.get(r.opp.id)!),
    };
  }

  async create(input: OpportunityCreateInput, actor: AuthContext) {
    if (input.companyId) await this.assertCompany(input.companyId, actor);
    if (input.primaryContactId) {
      if (!input.companyId) throw new ValidationError('Kontak bağlamak için önce firma seçilmelidir');
      await this.assertContact(input.primaryContactId, actor, input.companyId);
    }
    // super_admin olmayan kullanıcılar sadece kendilerine lead açabilir.
    const isSuperAdmin = actor.roles.includes('super_admin');
    if (!isSuperAdmin && input.ownerUserId && input.ownerUserId !== actor.userId) {
      throw new ForbiddenError('Yalnızca süper admin başka kullanıcıya lead atayabilir');
    }
    if (input.ownerUserId) await this.assertUser(input.ownerUserId, actor);

    const leadStage = await this.stageRowByCode('lead');
    const currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    const sourceId = await lookupIdByCode(this.db, contactSources, input.sourceCode);
    const openStatus = await this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'open') });
    const divisionId = resolveAssignedResourceDivision(actor, 'opportunities', input.divisionId ?? null);
    if (!divisionId && (await this.tenantHasActiveDivisions(actor))) {
      throw new ValidationError('Fırsat için bölüm ataması zorunludur', { field: 'divisionId' });
    }

    const [row] = await this.db
      .insert(opportunities)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        companyId: input.companyId ?? null,
        primaryContactId: input.primaryContactId ?? null,
        ownerUserId: input.ownerUserId ?? actor.userId,
        title: input.title,
        description: input.description ?? null,
        leadContactName: input.leadContactName?.trim() || null,
        leadCompanyTitle: input.leadCompanyTitle?.trim() || null,
        leadContactValue: input.leadContactValue?.trim() || null,
        leadCity: input.leadCity?.trim() || null,
        leadPhone: input.leadPhone?.trim() || null,
        leadEmail: input.leadEmail?.trim() || null,
        leadTemperature: input.leadTemperature ?? 'unknown',
        currentStageId: leadStage.id,
        estimatedValue: input.estimatedValue?.toString() ?? null,
        currencyId,
        probability: input.probability,
        expectedCloseDate: input.expectedCloseDate ?? null,
        paymentTermDays: input.paymentTermDays ?? null,
        paymentMethod: input.paymentMethod ?? 'undecided',
        qualificationStage: 'lead',
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
    await this.db.insert(opportunityStageHistory).values({
      tenantId: actor.tenantId,
      opportunityId: row.id,
      fromStageId: null,
      toStageId: leadStage.id,
      changedBy: actor.userId,
      changeReason: 'Initial lead',
    });
    await this.db.insert(opportunityQualificationHistory).values({
      tenantId: actor.tenantId,
      opportunityId: row.id,
      fromStage: null,
      toStage: 'lead',
      changedBy: actor.userId,
      changeReason: 'Lead oluşturuldu',
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.created',
      resourceType: 'opportunity',
      resourceId: row.id,
      newValues: { title: row.title },
    });
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
        let stage = stageCache.get(row.stageCode);
        if (!stage) {
          stage = await this.stageRowByCode(row.stageCode);
          stageCache.set(row.stageCode, stage);
        }
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
              ownerUserId: actor.userId,
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

  async update(id: string, input: OpportunityUpdateInput, actor: AuthContext) {
    const existing = await this.get(id, actor);
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
    const isSuperAdmin = actor.roles.includes('super_admin');
    if (input.ownerUserId !== undefined && !isSuperAdmin) {
      throw new ForbiddenError('Sorumlu kullanıcıyı yalnızca süper admin değiştirebilir');
    }
    if (input.ownerUserId) await this.assertUser(input.ownerUserId, actor);
    const patch: Record<string, unknown> = { updatedBy: actor.userId };
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
      'leadPhone',
      'leadEmail',
      'leadTemperature',
      'probability',
      'expectedCloseDate',
      'paymentTermDays',
      'paymentMethod',
      'requestedMachine',
      'contractTerms',
      'paymentTerms',
      'wonReason',
    ] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.companyId === null && input.primaryContactId === undefined) patch.primaryContactId = null;
    const paymentEvidenceChanged =
      (input.paymentMethod !== undefined && (input.paymentMethod ?? null) !== (existing.paymentMethod ?? null)) ||
      (input.paymentTerms !== undefined && (input.paymentTerms?.trim() || null) !== (existing.paymentTerms?.trim() || null)) ||
      (input.paymentTermDays !== undefined && (input.paymentTermDays ?? null) !== (existing.paymentTermDays ?? null));

    await this.db.transaction(async (tx) => {
      await tx.update(opportunities).set(patch).where(eq(opportunities.id, id));
      if (paymentEvidenceChanged) {
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
              eq(opportunityApprovals.opportunityId, id),
              inArray(opportunityApprovals.approvalType, ['payment', 'win']),
              isNull(opportunityApprovals.deletedAt)
            )
          );
      }
    });
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
            existing.leadCity?.trim() ? `Şehir: ${existing.leadCity.trim()}` : null,
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
    await this.get(id, actor);
    await this.db.update(opportunities).set({ deletedAt: new Date() }).where(eq(opportunities.id, id));
    return { ok: true };
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
    note?: string
  ) {
    await this.db.insert(opportunityQualificationHistory).values({
      tenantId,
      opportunityId,
      fromStage,
      toStage,
      changedBy: actorUserId,
      changeReason: note?.trim() || null,
    });
  }

  async convertLead(id: string, input: OpportunityConvertInput, actor: AuthContext) {
    const opp = await this.findScopedOpp(id, actor);
    if (opp.closedAt) throw new ValidationError('Arşivlenmiş lead fırsata çevrilemez');
    const fromStage = this.qualificationStage(opp.qualificationStage);
    if (fromStage !== 'lead') throw new ValidationError('Kayıt zaten fırsata çevrilmiş');
    if (!opp.ownerUserId) throw new ValidationError('Fırsata çevirmeden önce sorumlu kullanıcı atanmalıdır');
    if (!opp.title?.trim()) throw new ValidationError('Fırsata çevirmeden önce konu girilmelidir');
    const now = new Date();
    await this.db
      .update(opportunities)
      .set({
        qualificationStage: 'c',
        qualificationNote: input.note?.trim() || opp.qualificationNote,
        qualificationUpdatedAt: now,
        updatedAt: now,
        updatedBy: actor.userId,
      })
      .where(eq(opportunities.id, id));
    await this.recordQualificationChange(id, actor.tenantId, actor.userId, fromStage, 'c', input.note ?? 'Fırsata çevrildi');
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.converted',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: { qualificationStage: fromStage },
      newValues: { qualificationStage: 'c' },
    });
    return this.get(id, actor);
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
    let reason = await this.db.query.cancellationReasons.findFirst({
      where: and(
        eq(cancellationReasons.tenantId, actor.tenantId),
        eq(cancellationReasons.code, input.cancellationReasonCode)
      ),
    });
    if (!reason) {
      [reason] = await this.db
        .insert(cancellationReasons)
        .values({
          tenantId: actor.tenantId,
          code: input.cancellationReasonCode,
          name: input.cancellationReasonCode,
        })
        .returning();
    }
    const lostStatus = await this.db.query.opportunityStatuses.findFirst({
      where: eq(opportunityStatuses.code, 'lost'),
    });
    await this.db
      .update(opportunities)
      .set({
        qualificationStage: 'lost',
        qualificationNote: input.note?.trim() || null,
        qualificationUpdatedAt: new Date(),
        lostReasonId: reason.id,
        lostCompetitorId: input.lostCompetitorId ?? null,
        lostCompetitorProductModel: input.lostCompetitorProductModel?.trim() || null,
        statusId: lostStatus?.id ?? opp.statusId,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      })
      .where(eq(opportunities.id, opp.id));
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
    if (fromStage === 'win' || fromStage === 'lost') {
      throw new ValidationError('WIN veya LOST kartı taşımak için önce Geçmiş ekranından geri açın');
    }
    if (toStage === 'lead') throw new ValidationError('Fırsat yeniden Leadler havuzuna taşınamaz');
    if (toStage === 'c' && fromStage === 'lead') return this.convertLead(id, { note: input.note }, actor);

    if (toStage === 'lost') {
      await this.setLostQualification(opp, input, actor);
    } else {
      const fromIndex = QUALIFICATION_SEQUENCE.indexOf(fromStage);
      const toIndex = QUALIFICATION_SEQUENCE.indexOf(toStage);
      if (toIndex < 0 || fromIndex < 0) throw new ValidationError('Geçersiz satış derecesi');
      const movingForward = toIndex > fromIndex;
      if (movingForward && toIndex !== fromIndex + 1) {
        throw new ValidationError('Satış dereceleri sırayla ilerletilmelidir');
      }
      if (!movingForward && toIndex !== fromIndex - 1) {
        throw new ValidationError('Kart yalnızca bir önceki satış derecesine geri alınabilir');
      }
      if (!movingForward && !input.note?.trim()) {
        throw new ValidationError('Geri geçişte gerekçe zorunludur', { field: 'note' });
      }
      if (movingForward) {
        const contexts = await this.qualificationContexts([opp]);
        const readiness = this.qualificationReadiness(opp, contexts.get(opp.id)!);
        if (!readiness.ready) {
          throw new ValidationError('Bir sonraki aşama için eksik bilgiler var', {
            blockers: readiness.blockers,
            fromStage,
            toStage,
          });
        }
      }

      const patch: Record<string, unknown> = {
        qualificationStage: toStage,
        qualificationNote: input.note?.trim() || opp.qualificationNote,
        qualificationUpdatedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: actor.userId,
      };
      if (toStage === 'win') {
        const wonStatus = await this.db.query.opportunityStatuses.findFirst({
          where: eq(opportunityStatuses.code, 'won'),
        });
        if (wonStatus) patch.statusId = wonStatus.id;
      }
      await this.db.update(opportunities).set(patch).where(eq(opportunities.id, id));

      if (!movingForward) {
        await this.db
          .update(opportunityApprovals)
          .set({
            status: 'pending',
            decidedBy: null,
            decidedAt: null,
            note: null,
            updatedAt: new Date(),
          })
          .where(and(eq(opportunityApprovals.opportunityId, id), isNull(opportunityApprovals.deletedAt)));
      }
    }

    await this.recordQualificationChange(id, actor.tenantId, actor.userId, fromStage, toStage, input.note);
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'opportunity.qualification.changed',
      resourceType: 'opportunity',
      resourceId: id,
      oldValues: { qualificationStage: fromStage },
      newValues: { qualificationStage: toStage, note: input.note ?? null },
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
      const currentIndex = PIPELINE_STAGES.indexOf((stage?.code ?? 'lead') as PipelineStageCode);
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

  /** Geri Aç: yanlış kapatmayı geri alır ve terminal satış derecesini önceki aktif dereceye taşır. */
  async reopen(id: string, actor: AuthContext) {
    const opp = await this.findScopedOpp(id, actor);
    if (!opp.closedAt) throw new ValidationError('Fırsat zaten açık');
    const terminalStage = this.qualificationStage(opp.qualificationStage);
    const isQualificationTerminal = terminalStage === 'win' || terminalStage === 'lost';
    let reopenedStage: QualificationStageCode | null = null;
    let openStatusId: string | null = null;

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
      reopenedStage =
        previousStage &&
        QUALIFICATION_STAGES.includes(previousStage) &&
        previousStage !== 'win' &&
        previousStage !== 'lost'
          ? previousStage
          : terminalStage === 'win'
            ? 'a_plus'
            : 'c';
      const openStatus = await this.db.query.opportunityStatuses.findFirst({
        where: eq(opportunityStatuses.code, 'open'),
      });
      openStatusId = openStatus?.id ?? null;
    }

    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(opportunities)
        .set({
          closedAt: null,
          closedBy: null,
          ...(reopenedStage
            ? {
                qualificationStage: reopenedStage,
                qualificationNote: 'Geçmişten geri açıldı',
                qualificationUpdatedAt: now,
                statusId: openStatusId ?? opp.statusId,
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
              eq(opportunityApprovals.approvalType, 'win'),
              isNull(opportunityApprovals.deletedAt)
            )
          );
        await tx.insert(opportunityQualificationHistory).values({
          tenantId: actor.tenantId,
          opportunityId: id,
          fromStage: terminalStage,
          toStage: reopenedStage,
          changedBy: actor.userId,
          changeReason: 'Geçmişten geri açıldı',
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
      newValues: { qualificationStage: reopenedStage ?? terminalStage, closedAt: null },
    });
    return this.get(id, actor);
  }

  /**
   * Kanban DnD endpoint. Enforces bölüm 3 transition rules:
   *  - cancelled → cancellation_reason zorunlu
   *  - quote → mevcut quote olmalı
   *  - contract → quote'a contract dosyası yüklenmeli
   *  - commercial_invoice → ticari fatura dosyası yüklenmeli
   *  - customs_approved → öncesinde commercial_invoice tamamlanmış olmalı
   *  - stock_picking → customs_approved'tan sonra; inventory_item seçilmeli (reserved'a alınır)
   *  - delivered → customer_device kaydı oluşturulur
   */
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

    const allowedFrom = STAGE_TRANSITIONS[input.toStage as PipelineStageCode];
    if (!allowedFrom.includes(fromStage.code as PipelineStageCode)) {
      throw new ValidationError(`'${fromStage.code}' aşamasından '${input.toStage}' aşamasına geçiş yapılamaz`);
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
    }

    if (input.toStage === 'quote') {
      const qcount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(quotes)
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!qcount[0].c) {
        throw new ValidationError('Quote aşamasına geçmek için en az bir teklif oluşturulmalıdır');
      }
    }
    if (input.toStage === 'contract') {
      const ccount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(contracts)
        .innerJoin(quotes, eq(contracts.quoteId, quotes.id))
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!ccount[0].c) throw new ValidationError('Contract aşamasına geçmek için sözleşme dosyası yüklenmelidir');
    }
    if (input.toStage === 'commercial_invoice') {
      const rcount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(receivables)
        .innerJoin(quotes, eq(receivables.quoteId, quotes.id))
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!rcount[0].c) {
        throw new ValidationError('Ticari fatura aşamasına geçmek için önce ödeme planı oluşturulmalıdır');
      }

      const icount = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(commercialInvoices)
        .innerJoin(quotes, eq(commercialInvoices.quoteId, quotes.id))
        .where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.opportunityId, id)));
      if (!icount[0].c) throw new ValidationError('Ticari fatura dosyası yüklenmelidir');
    }
    if (input.toStage === 'stock_picking') {
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
    if (input.toStage === 'installation') {
      // Garanti, tezgâhın kurulumuyla başlar: rezerve stok kalemlerinden
      // müşteri cihazı / garanti kayıtları oluşturulur (idempotent).
      await this.ensureWarrantyDevices(opp, actor, input.inventoryItemIds);
      // Satıştan servise devir: servis ekibi Kurulum listesinde görebilsin diye
      // bir kurulum kaydı oluşturulur (idempotent).
      await this.ensureInstallationJob(opp, actor);
    }
    if (input.toStage === 'delivered') {
      // Cihaz/garanti kayıtları kurulumda oluşturulmuş olabilir; tekrar çağırmak
      // güvenlidir (idempotent). Kurulum atlandıysa burada oluşturulur.
      await this.ensureWarrantyDevices(opp, actor, input.inventoryItemIds);
      const won = await this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'won') });
      if (won) patch.statusId = won.id;
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
      .select({ id: installationJobs.id })
      .from(installationJobs)
      .where(and(eq(installationJobs.tenantId, actor.tenantId), eq(installationJobs.opportunityId, opp.id)))
      .limit(1);
    if (existing.length) return;
    const scheduled = await this.db.query.installationStatuses.findFirst({
      where: eq(installationStatuses.code, 'scheduled'),
    });
    // Kurulumu (varsa) bu fırsat için oluşturulmuş müşteri cihazına bağla.
    const device = await this.db
      .select({ id: customerDevices.id })
      .from(customerDevices)
      .where(and(eq(customerDevices.tenantId, actor.tenantId), eq(customerDevices.opportunityId, opp.id)))
      .limit(1);
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
