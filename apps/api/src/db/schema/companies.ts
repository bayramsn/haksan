import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, boolean, timestamp, numeric, jsonb, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { auditColumns, ownerColumns } from './_helpers';
import { tenants, divisions } from './tenants';
import { users } from './users';
import { companyRelationTypes, companyStatuses, companyGroups, contactSources, decisionRoles } from './lookup';
import { files } from './files';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyType: varchar('company_type', { length: 16 }).notNull().default('company'),
    relationTypeId: uuid('relation_type_id').references(() => companyRelationTypes.id),
    customerStatusId: uuid('customer_status_id').references(() => companyStatuses.id),
    companyGroupId: uuid('company_group_id').references(() => companyGroups.id),
    contactSourceId: uuid('contact_source_id').references(() => contactSources.id),
    sector: varchar('sector', { length: 128 }),
    // Tedarikçileri sevkiyat seçiminde işlevine göre ayırır; sektör bilgisinden bağımsızdır.
    supplierCategoryCode: varchar('supplier_category_code', { length: 32 }),
    /** Eski CRM/ERP listesindeki firma NO alanı. Tenant içinde kalıcı eşleştirme anahtarıdır. */
    externalCompanyNo: varchar('external_company_no', { length: 32 }),
    legalTitle: varchar('legal_title', { length: 255 }).notNull(),
    shortName: varchar('short_name', { length: 128 }),
    taxOffice: varchar('tax_office', { length: 128 }),
    taxNumber: varchar('tax_number', { length: 32 }),
    website: varchar('website', { length: 512 }),
    logoFileId: uuid('logo_file_id').references(() => files.id, { onDelete: 'set null' }),
    notes: text('notes'),
    /** Kaynak Excel'deki desteklenmeyen alanları kayıpsız saklar. */
    sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown> | null>(),
    ...ownerColumns,
    ...auditColumns,
  },
  (t) => ({
    // Vergi no tekliği yalnızca silinmemiş kayıtlar için; soft-delete sonrası yeniden ekleme serbest.
    tenantTaxUnique: uniqueIndex('companies_tenant_tax_alive_unique')
      .on(t.tenantId, t.taxNumber)
      .where(sql`${t.deletedAt} is null`),
    tenantExternalNoUnique: uniqueIndex('companies_tenant_external_no_alive_unique')
      .on(t.tenantId, t.externalCompanyNo)
      .where(sql`${t.deletedAt} is null and ${t.externalCompanyNo} is not null`),
    tenantIdx: index('companies_tenant_idx').on(t.tenantId),
    legalTitleIdx: index('companies_legal_title_idx').on(t.legalTitle),
    relationTypeIdx: index('companies_relation_type_idx').on(t.relationTypeId),
    supplierCategoryIdx: index('companies_supplier_category_idx').on(t.supplierCategoryCode),
    logoFileIdx: index('companies_logo_file_idx').on(t.logoFileId),
  })
);

export const companyAddresses = pgTable(
  'company_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    addressType: varchar('address_type', { length: 32 }).notNull().default('billing'),
    country: varchar('country', { length: 64 }).notNull().default('Türkiye'),
    province: varchar('province', { length: 64 }),
    district: varchar('district', { length: 64 }),
    locality: varchar('locality', { length: 64 }),
    zipCode: varchar('zip_code', { length: 16 }),
    street: varchar('street', { length: 255 }),
    buildingNumber: varchar('building_number', { length: 32 }),
    fullAddress: text('full_address'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    locationSource: varchar('location_source', { length: 16 }),
    isDefault: boolean('is_default').notNull().default(false),
    isShipping: boolean('is_shipping').notNull().default(false),
    isBilling: boolean('is_billing').notNull().default(false),
    ...auditColumns,
  },
  (t) => ({
    companyIdx: index('company_addresses_company_idx').on(t.companyId),
  })
);

export const companyDivisions = pgTable(
  'company_divisions',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    addedByUserId: uuid('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.companyId, t.divisionId] }),
    tenantIdx: index('company_divisions_tenant_idx').on(t.tenantId),
    divisionIdx: index('company_divisions_division_idx').on(t.divisionId),
  })
);

/** Firma grupları artık çoktan seçilebilir; companies.companyGroupId eski
 * istemciler ve geriye dönük uyumluluk için birincil grup olarak korunur. */
export const companyGroupAssignments = pgTable(
  'company_group_assignments',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    companyGroupId: uuid('company_group_id')
      .notNull()
      .references(() => companyGroups.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ name: 'company_group_assignments_company_group_pk', columns: [t.companyId, t.companyGroupId] }),
    tenantIdx: index('company_group_assignments_tenant_idx').on(t.tenantId),
    groupIdx: index('company_group_assignments_group_idx').on(t.companyGroupId),
  })
);

export const companyPhones = pgTable(
  'company_phones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    phoneType: varchar('phone_type', { length: 32 }).notNull().default('main'),
    phone: varchar('phone', { length: 32 }).notNull(),
    extension: varchar('extension', { length: 16 }),
    isDefault: boolean('is_default').notNull().default(false),
    ...auditColumns,
  },
  (t) => ({
    companyIdx: index('company_phones_company_idx').on(t.companyId),
  })
);

export const companyEmails = pgTable(
  'company_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    emailType: varchar('email_type', { length: 32 }).notNull().default('main'),
    email: varchar('email', { length: 255 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    ...auditColumns,
  },
  (t) => ({
    companyIdx: index('company_emails_company_idx').on(t.companyId),
  })
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Eski CRM/ERP listesindeki kontak NO alanı. */
    externalContactNo: varchar('external_contact_no', { length: 32 }),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    title: varchar('title', { length: 128 }),
    department: varchar('department', { length: 128 }),
    decisionRoleId: uuid('decision_role_id').references(() => decisionRoles.id),
    workPhone: varchar('work_phone', { length: 32 }),
    phoneExtension: varchar('phone_extension', { length: 16 }),
    mobilePhone: varchar('mobile_phone', { length: 32 }),
    otherPhone: varchar('other_phone', { length: 32 }),
    workEmail: varchar('work_email', { length: 255 }),
    personalEmail: varchar('personal_email', { length: 255 }),
    otherEmail: varchar('other_email', { length: 255 }),
    gender: varchar('gender', { length: 32 }),
    birthDate: timestamp('birth_date', { withTimezone: true }),
    hometown: varchar('hometown', { length: 64 }),
    favoriteTeam: varchar('favorite_team', { length: 64 }),
    favoriteColor: varchar('favorite_color', { length: 32 }),
    graduatedSchool: varchar('graduated_school', { length: 128 }),
    notes: text('notes'),
    /** Kaynak Excel'deki desteklenmeyen alanları kayıpsız saklar. */
    sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown> | null>(),
    isBlacklisted: boolean('is_blacklisted').notNull().default(false),
    blacklistReason: text('blacklist_reason'),
    isPrimary: boolean('is_primary').notNull().default(false),
    ...ownerColumns,
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('contacts_tenant_idx').on(t.tenantId),
    tenantExternalNoUnique: uniqueIndex('contacts_tenant_external_no_alive_unique')
      .on(t.tenantId, t.externalContactNo)
      .where(sql`${t.deletedAt} is null and ${t.externalContactNo} is not null`),
    companyIdx: index('contacts_company_idx').on(t.companyId),
    fullNameIdx: index('contacts_full_name_idx').on(t.fullName),
  })
);

export const contactCompanies = pgTable(
  'contact_companies',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 128 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contactId, t.companyId] }),
    tenantIdx: index('contact_companies_tenant_idx').on(t.tenantId),
    companyIdx: index('contact_companies_company_idx').on(t.companyId),
  })
);

export const companyAccessRequests = pgTable(
  'company_access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    requestingUserId: uuid('requesting_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    requestingDivisionId: uuid('requesting_division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    ownerDivisionId: uuid('owner_division_id').references(() => divisions.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    note: text('note'),
    decisionNote: text('decision_note'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('company_access_requests_tenant_idx').on(t.tenantId),
    companyIdx: index('company_access_requests_company_idx').on(t.companyId),
    requestingDivisionIdx: index('company_access_requests_requesting_division_idx').on(t.requestingDivisionId),
    ownerDivisionIdx: index('company_access_requests_owner_division_idx').on(t.ownerDivisionId),
    statusIdx: index('company_access_requests_status_idx').on(t.status),
  })
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    entityType: varchar('entity_type', { length: 64 }),
    entityId: uuid('entity_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('notifications_tenant_idx').on(t.tenantId),
    userIdx: index('notifications_user_idx').on(t.userId),
    divisionIdx: index('notifications_division_idx').on(t.divisionId),
    readIdx: index('notifications_read_idx').on(t.readAt),
  })
);

export const contactPhones = pgTable('contact_phones', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id, { onDelete: 'cascade' }),
  phoneType: varchar('phone_type', { length: 32 }).notNull().default('mobile'),
  phone: varchar('phone', { length: 32 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  ...auditColumns,
});

export const contactEmails = pgTable('contact_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id, { onDelete: 'cascade' }),
  emailType: varchar('email_type', { length: 32 }).notNull().default('work'),
  email: varchar('email', { length: 255 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  ...auditColumns,
});

export const contactNotes = pgTable('contact_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id, { onDelete: 'cascade' }),
  note: text('note').notNull(),
  authorUserId: uuid('author_user_id').references(() => users.id),
  ...auditColumns,
});
