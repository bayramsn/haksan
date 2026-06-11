import { pgTable, uuid, varchar, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns, ownerColumns, money } from './_helpers';
import { tenants } from './tenants';
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
    name: varchar('name', { length: 255 }).notNull(),
    website: varchar('website', { length: 512 }),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('competitors_tenant_idx').on(t.tenantId),
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
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    primaryContactId: uuid('primary_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
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
    // Kazanılan fırsatlarda kabul/kazanma nedeni (yıl sonu raporu için).
    wonReason: varchar('won_reason', { length: 255 }),
    ...ownerColumns,
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('opportunities_tenant_idx').on(t.tenantId),
    companyIdx: index('opportunities_company_idx').on(t.companyId),
    stageIdx: index('opportunities_stage_idx').on(t.currentStageId),
    expectedCloseDateIdx: index('opportunities_expected_close_date_idx').on(t.expectedCloseDate),
    ownerIdx: index('opportunities_owner_idx').on(t.ownerUserId),
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
    dateIdx: index('calls_date_idx').on(t.callDate),
  })
);
