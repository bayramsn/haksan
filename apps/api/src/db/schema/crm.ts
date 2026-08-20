import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { auditColumns, ownerColumns, money } from './_helpers';
import { tenants, divisions } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';
import {
  pipelineStages,
  opportunityStatuses,
  activityTypes,
  contactSources,
  currencies,
} from './lookup';

export const cancellationReasons = pgTable(
  'cancellation_reasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    isActive: integer('is_active').notNull().default(1),
    ...auditColumns,
  },
  (t) => ({
    tenantCodeUnique: uniqueIndex('cancellation_reasons_tenant_code_unique').on(t.tenantId, t.code),
  })
);

export const competitors = pgTable(
  'competitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /**
     * Rakip firma kartıyla CRM kayıp analizi kataloğunu aynı kayda bağlar.
     * Elle açılan eski katalog kayıtlarında null kalabilir.
     */
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    website: varchar('website', { length: 512 }),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('competitors_tenant_idx').on(t.tenantId),
    companyUnique: uniqueIndex('competitors_company_alive_unique')
      .on(t.tenantId, t.companyId)
      .where(sql`${t.deletedAt} is null and ${t.companyId} is not null`),
  })
);

export const competitorProducts = pgTable(
  'competitor_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id')
      .notNull()
      .references(() => competitors.id, { onDelete: 'cascade' }),
    modelCode: varchar('model_code', { length: 128 }),
    modelName: varchar('model_name', { length: 255 }).notNull(),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    competitorIdx: index('competitor_products_competitor_idx').on(t.competitorId),
  })
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    sourceId: uuid('source_id').references(() => contactSources.id),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    statusId: uuid('status_id').references(() => opportunityStatuses.id),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('leads_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('leads_tenant_division_idx').on(t.tenantId, t.divisionId),
    companyIdx: index('leads_company_idx').on(t.companyId),
  })
);

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // Hızlı lead aşamasında firma henüz bilinmeyebilir. Teklif oluşturulmadan
    // önce gerçek bir firma kaydı bağlanır.
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'restrict' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    primaryContactId: uuid('primary_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    leadContactName: varchar('lead_contact_name', { length: 255 }),
    leadCompanyTitle: varchar('lead_company_title', { length: 255 }),
    leadContactValue: varchar('lead_contact_value', { length: 320 }),
    leadCity: varchar('lead_city', { length: 120 }),
    leadDistrict: varchar('lead_district', { length: 120 }),
    leadPhone: varchar('lead_phone', { length: 64 }),
    leadEmail: varchar('lead_email', { length: 254 }),
    // Firmanın alım niyeti: hot (sıcak) | waiting (beklemede) | cold (soğuk).
    leadTemperature: varchar('lead_temperature', { length: 16 }),
    leadNeedSummary: text('lead_need_summary'),
    leadAuthorityStatus: varchar('lead_authority_status', { length: 32 }).notNull().default('unknown'),
    leadBudgetStatus: varchar('lead_budget_status', { length: 32 }).notNull().default('unknown'),
    leadPurchaseTimeframe: varchar('lead_purchase_timeframe', { length: 32 }).notNull().default('unknown'),
    leadTechnicalFit: varchar('lead_technical_fit', { length: 32 }).notNull().default('unknown'),
    leadTechnicalNote: text('lead_technical_note'),
    // Harici sistem kimliği lead/kontak alanlarından ayrı tutulur. Böylece
    // Trello pano adı, üyesi ve URL'si CRM firma bilgisi gibi davranmaz.
    externalSource: varchar('external_source', { length: 32 }),
    externalKey: varchar('external_key', { length: 320 }),
    externalUrl: varchar('external_url', { length: 512 }),
    externalMetadata: jsonb('external_metadata').$type<Record<string, unknown>>(),
    currentStageId: uuid('current_stage_id')
      .notNull()
      .references(() => pipelineStages.id),
    estimatedValue: money('estimated_value'),
    currencyId: uuid('currency_id').references(() => currencies.id),
    probability: integer('probability').notNull().default(50),
    expectedCloseDate: timestamp('expected_close_date', { withTimezone: true }),
    sourceId: uuid('source_id').references(() => contactSources.id),
    statusId: uuid('status_id').references(() => opportunityStatuses.id),
    lostReasonId: uuid('lost_reason_id').references(() => cancellationReasons.id),
    lostCompetitorId: uuid('lost_competitor_id').references(() => competitors.id),
    lostCompetitorProductModel: varchar('lost_competitor_product_model', { length: 255 }),
    // LOST anındaki firma/ürün/rakip bilgileri sonradan kartlar değişse bile
    // kayıp analizinin tarihsel doğruluğunu korumak için snapshot olarak tutulur.
    lostCompanyName: varchar('lost_company_name', { length: 255 }),
    lostProductName: varchar('lost_product_name', { length: 512 }),
    lostCompetitorName: varchar('lost_competitor_name', { length: 255 }),
    lostUnmetConditions: text('lost_unmet_conditions'),
    // Makine satışında ödeme vadesi (gün); sözleşme/ödeme planı varsayılanı.
    paymentTermDays: integer('payment_term_days'),
    // Lead kartında seçilen ödeme yöntemi (cash, term, leasing vb.).
    paymentMethod: varchar('payment_method', { length: 32 }),
    // Lead'in günlük takip durumu, satış derecesinden (Lead/C/B/A/...) bağımsızdır.
    leadFollowUpStatus: varchar('lead_follow_up_status', { length: 24 }).notNull().default('new'),
    // Takip durumuna giriş anı — lead SLA sayacı buradan işler.
    leadStatusUpdatedAt: timestamp('lead_status_updated_at', { withTimezone: true }),
    // Kaç kez temas denendi; üst sınır aşılınca kart beklemeye düşürülür.
    contactAttemptCount: integer('contact_attempt_count').notNull().default(0),
    // İlk başarılı temas anı — "speed-to-lead" ölçümünün paydası.
    firstContactAt: timestamp('first_contact_at', { withTimezone: true }),
    // Lead elendiğinde nedeni; LOST nedeniyle aynı lookup tablosunu paylaşır.
    disqualifyReasonId: uuid('disqualify_reason_id').references(() => cancellationReasons.id, {
      onDelete: 'set null',
    }),
    // Satışçının kartı yeniden açmadan göreceği bir sonraki somut aksiyon.
    nextAction: text('next_action'),
    nextActionAt: timestamp('next_action_at', { withTimezone: true }),
    // Lead havuzu ile C/B/A/A+/WIN/LOST satış derecesi, operasyon aşamasından ayrıdır.
    qualificationStage: varchar('qualification_stage', { length: 16 }).notNull().default('lead'),
    qualificationNote: text('qualification_note'),
    qualificationUpdatedAt: timestamp('qualification_updated_at', { withTimezone: true }),
    requestedMachine: varchar('requested_machine', { length: 255 }),
    contractTerms: text('contract_terms'),
    paymentTerms: text('payment_terms'),
    // Kazanılan fırsatlarda kabul/kazanma nedeni (yıl sonu raporu için).
    wonReason: varchar('won_reason', { length: 255 }),
    // Mantıksal kapanış (arşiv) — `deletedAt` (silme) DEĞİL. Terminal aşamadaki
    // (delivered/cancelled) fırsat "Bitir" ile kapatılınca dolar: aktif panodan
    // düşer ama kayıt; rapor/geçmiş/servis erişimi için DB'de kalır. "Geri Aç" ile sıfırlanır.
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id),
    ...ownerColumns,
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('opportunities_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('opportunities_tenant_division_idx').on(t.tenantId, t.divisionId),
    companyIdx: index('opportunities_company_idx').on(t.companyId),
    stageIdx: index('opportunities_stage_idx').on(t.currentStageId),
    qualificationStageIdx: index('opportunities_qualification_stage_idx').on(t.tenantId, t.qualificationStage),
    leadFollowUpStatusIdx: index('opportunities_lead_follow_up_status_idx').on(t.tenantId, t.leadFollowUpStatus),
    qualificationAgeIdx: index('opportunities_qualification_age_idx').on(
      t.tenantId,
      t.qualificationStage,
      t.qualificationUpdatedAt
    ),
    leadStatusAgeIdx: index('opportunities_lead_status_age_idx').on(
      t.tenantId,
      t.leadFollowUpStatus,
      t.leadStatusUpdatedAt
    ),
    nextActionAtIdx: index('opportunities_next_action_at_idx').on(t.tenantId, t.nextActionAt),
    expectedCloseDateIdx: index('opportunities_expected_close_date_idx').on(t.expectedCloseDate),
    ownerIdx: index('opportunities_owner_idx').on(t.ownerUserId),
    closedAtIdx: index('opportunities_closed_at_idx').on(t.closedAt),
    externalAliveUnique: uniqueIndex('opportunities_tenant_external_alive_unique')
      .on(t.tenantId, t.externalSource, t.externalKey)
      .where(sql`${t.deletedAt} is null and ${t.externalSource} is not null and ${t.externalKey} is not null`),
  })
);

export type LeadAssignmentCriteria = {
  cities: string[];
  productTerms: string[];
  sourceCodes: string[];
};

export const leadAssignmentRules = pgTable(
  'lead_assignment_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    priority: integer('priority').notNull().default(100),
    active: boolean('active').notNull().default(true),
    criteria: jsonb('criteria').$type<LeadAssignmentCriteria>().notNull(),
    assigneeUserIds: uuid('assignee_user_ids').array().notNull(),
    ...ownerColumns,
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('lead_assignment_rules_tenant_idx').on(t.tenantId),
    tenantPriorityIdx: index('lead_assignment_rules_tenant_priority_idx').on(t.tenantId, t.priority),
  })
);

export const leadAssignmentCursors = pgTable('lead_assignment_cursors', {
  ruleId: uuid('rule_id')
    .primaryKey()
    .references(() => leadAssignmentRules.id, { onDelete: 'cascade' }),
  nextIndex: integer('next_index').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opportunityQualificationHistory = pgTable(
  'opportunity_qualification_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    fromStage: varchar('from_stage', { length: 16 }),
    toStage: varchar('to_stage', { length: 16 }).notNull(),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changeReason: text('change_reason'),
    conversionOverride: boolean('conversion_override').notNull().default(false),
    fitScore: integer('fit_score'),
    engagementScore: integer('engagement_score'),
    priorityScore: integer('priority_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opportunityIdx: index('opportunity_qualification_history_opportunity_idx').on(t.opportunityId),
    tenantIdx: index('opportunity_qualification_history_tenant_idx').on(t.tenantId),
  })
);

/**
 * A+ süreç adımlarının elle işaretlenmesi.
 *
 * Adımların çoğu kanıttan türetilir; A+ alanındaki işlerin bir kısmı ise CRM
 * dışında yürür (gümrükçü, nakliyeci, saha ekibi). Bu tablo adım başına tek
 * "yapıldı / yapılmadı" kaydı ve satışçının bıraktığı yorumu tutar.
 */
export const opportunityProcessChecks = pgTable(
  'opportunity_process_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    checkKey: varchar('check_key', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    note: text('note'),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    opportunityCheckUnique: uniqueIndex('opportunity_process_checks_unique').on(t.opportunityId, t.checkKey),
    tenantIdx: index('opportunity_process_checks_tenant_idx').on(t.tenantId),
    statusCheck: check('opportunity_process_checks_status_check', sql`${t.status} in ('done', 'not_done')`),
  })
);

export const opportunityApprovals = pgTable(
  'opportunity_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    approvalType: varchar('approval_type', { length: 32 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    note: text('note'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('opportunity_approvals_tenant_idx').on(t.tenantId),
    opportunityIdx: index('opportunity_approvals_opportunity_idx').on(t.opportunityId),
    opportunityTypeUnique: uniqueIndex('opportunity_approvals_opportunity_type_unique').on(t.opportunityId, t.approvalType),
  })
);

export const opportunityStageHistory = pgTable(
  'opportunity_stage_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    fromStageId: uuid('from_stage_id').references(() => pipelineStages.id),
    toStageId: uuid('to_stage_id')
      .notNull()
      .references(() => pipelineStages.id),
    changedBy: uuid('changed_by').references(() => users.id),
    changeReason: text('change_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oppIdx: index('opportunity_stage_history_opp_idx').on(t.opportunityId),
  })
);

export type ActivityOrigin = 'manual' | 'system';

export const salesActivities = pgTable(
  'sales_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    activityTypeId: uuid('activity_type_id')
      .notNull()
      .references(() => activityTypes.id),
    subject: varchar('subject', { length: 255 }).notNull(),
    description: text('description'),
    origin: varchar('origin', { length: 16 }).$type<ActivityOrigin>().notNull().default('manual'),
    activityDate: timestamp('activity_date', { withTimezone: true }).notNull(),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    result: text('result'),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('sales_activities_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('sales_activities_tenant_division_idx').on(t.tenantId, t.divisionId),
    oppIdx: index('sales_activities_opp_idx').on(t.opportunityId),
    dateIdx: index('sales_activities_date_idx').on(t.activityDate),
    originCheck: check('sales_activities_origin_check', sql`${t.origin} in ('manual', 'system')`),
  })
);

export const leadContactEvents = pgTable(
  'lead_contact_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => salesActivities.id, { onDelete: 'cascade' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    channel: varchar('channel', { length: 16 }).notNull(),
    outcome: varchar('outcome', { length: 32 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opportunityIdx: index('lead_contact_events_opportunity_idx').on(t.opportunityId, t.occurredAt),
    idempotencyUnique: uniqueIndex('lead_contact_events_idempotency_unique').on(
      t.tenantId,
      t.opportunityId,
      t.idempotencyKey
    ),
  })
);

export const visits = pgTable(
  'visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    visitDate: timestamp('visit_date', { withTimezone: true }).notNull(),
    visitLocation: varchar('visit_location', { length: 255 }),
    visitPurpose: text('visit_purpose'),
    visitResult: text('visit_result'),
    nextAction: text('next_action'),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('visits_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('visits_tenant_division_idx').on(t.tenantId, t.divisionId),
    dateIdx: index('visits_date_idx').on(t.visitDate),
  })
);

export const calls = pgTable(
  'calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    callDate: timestamp('call_date', { withTimezone: true }).notNull(),
    callResult: text('call_result'),
    nextAction: text('next_action'),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('calls_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('calls_tenant_division_idx').on(t.tenantId, t.divisionId),
    dateIdx: index('calls_date_idx').on(t.callDate),
  })
);
