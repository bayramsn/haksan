import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
    leadPhone: varchar('lead_phone', { length: 64 }),
    leadEmail: varchar('lead_email', { length: 254 }),
    // Firmanın alım niyeti: hot (sıcak) | waiting (beklemede) | cold (soğuk).
    leadTemperature: varchar('lead_temperature', { length: 16 }),
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
    // Makine satışında ödeme vadesi (gün); sözleşme/ödeme planı varsayılanı.
    paymentTermDays: integer('payment_term_days'),
    // Lead kartında seçilen ödeme yöntemi (cash, term, leasing vb.).
    paymentMethod: varchar('payment_method', { length: 32 }),
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
    expectedCloseDateIdx: index('opportunities_expected_close_date_idx').on(t.expectedCloseDate),
    ownerIdx: index('opportunities_owner_idx').on(t.ownerUserId),
    closedAtIdx: index('opportunities_closed_at_idx').on(t.closedAt),
    externalAliveUnique: uniqueIndex('opportunities_tenant_external_alive_unique')
      .on(t.tenantId, t.externalSource, t.externalKey)
      .where(sql`${t.deletedAt} is null and ${t.externalSource} is not null and ${t.externalKey} is not null`),
  })
);

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opportunityIdx: index('opportunity_qualification_history_opportunity_idx').on(t.opportunityId),
    tenantIdx: index('opportunity_qualification_history_tenant_idx').on(t.tenantId),
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
