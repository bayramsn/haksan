import { pgTable, uuid, varchar, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns, ownerColumns } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { companyRelationTypes, companyStatuses, companyGroups, contactSources, decisionRoles } from './lookup';

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
    legalTitle: varchar('legal_title', { length: 255 }).notNull(),
    shortName: varchar('short_name', { length: 128 }),
    taxOffice: varchar('tax_office', { length: 128 }),
    taxNumber: varchar('tax_number', { length: 32 }),
    website: varchar('website', { length: 512 }),
    notes: text('notes'),
    ...ownerColumns,
    ...auditColumns,
  },
  (t) => ({
    tenantTaxUnique: uniqueIndex('companies_tenant_tax_unique').on(t.tenantId, t.taxNumber),
    tenantIdx: index('companies_tenant_idx').on(t.tenantId),
    legalTitleIdx: index('companies_legal_title_idx').on(t.legalTitle),
    relationTypeIdx: index('companies_relation_type_idx').on(t.relationTypeId),
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
    isDefault: boolean('is_default').notNull().default(false),
    ...auditColumns,
  },
  (t) => ({
    companyIdx: index('company_addresses_company_idx').on(t.companyId),
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
    knownIllness: text('known_illness'),
    favoriteColor: varchar('favorite_color', { length: 32 }),
    graduatedSchool: varchar('graduated_school', { length: 128 }),
    politicalView: varchar('political_view', { length: 128 }),
    notes: text('notes'),
    isPrimary: boolean('is_primary').notNull().default(false),
    ...ownerColumns,
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('contacts_tenant_idx').on(t.tenantId),
    companyIdx: index('contacts_company_idx').on(t.companyId),
    fullNameIdx: index('contacts_full_name_idx').on(t.fullName),
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
