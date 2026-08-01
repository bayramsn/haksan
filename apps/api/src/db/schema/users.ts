import { pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns, money } from './_helpers';
import { tenants, departments, divisions } from './tenants';
import { userTitles } from './lookup';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    // Ünvan (Satış Müdürü, Bölge Sorumlusu…) — belge çıktılarında imza satırında yazar.
    titleId: uuid('title_id').references(() => userTitles.id, { onDelete: 'set null' }),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    passwordHash: varchar('password_hash', { length: 512 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    authVersion: integer('auth_version').notNull().default(0),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecret: varchar('mfa_secret', { length: 128 }),
    purchaseApprovalLimit: integer('purchase_approval_limit').notNull().default(0),
    // Null = ortam değişkenindeki günlük varsayılan; 0 = bu kullanıcı için LLM kapalı.
    assistantDailyUsdLimitCents: integer('assistant_daily_usd_limit_cents'),
    managerId: uuid('manager_id'),
    ...auditColumns,
  },
  (t) => ({
    tenantEmailUnique: uniqueIndex('users_tenant_email_unique').on(t.tenantId, t.email),
    tenantIdx: index('users_tenant_idx').on(t.tenantId),
    emailLowerIdx: index('users_email_idx').on(t.email),
  })
);

export type UserTargetItem = {
  targetType: 'sales' | 'service' | 'finance' | 'purchase' | 'operations' | 'logistics' | 'other';
  category: string;
  activity: string;
  description: string;
  unit: 'count' | 'amount';
  metricKey?: string;
  trackingMode?: 'automatic' | 'manual';
  target: string;
};

export const userTargets = pgTable(
  'user_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    period: varchar('period', { length: 7 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    salesAmount: money('sales_amount'),
    salesNewCustomers: integer('sales_new_customers'),
    serviceAmount: money('service_amount'),
    serviceCompleted: integer('service_completed'),
    digitalLeadTarget: integer('digital_lead_target'),
    digitalConversionTarget: integer('digital_conversion_target'),
    digitalBudget: money('digital_budget'),
    visitTarget: integer('visit_target'),
    callTarget: integer('call_target'),
    quoteTarget: integer('quote_target'),
    targetItems: jsonb('target_items').$type<UserTargetItem[]>(),
    note: text('note'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('user_targets_tenant_idx').on(t.tenantId),
    userIdx: index('user_targets_user_idx').on(t.userId),
    tenantUserPeriodUnique: uniqueIndex('user_targets_tenant_user_period_unique').on(t.tenantId, t.userId, t.period),
  })
);

export const departmentTargets = pgTable(
  'department_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    period: varchar('period', { length: 7 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    salesAmount: money('sales_amount'),
    salesNewCustomers: integer('sales_new_customers'),
    serviceAmount: money('service_amount'),
    serviceCompleted: integer('service_completed'),
    digitalLeadTarget: integer('digital_lead_target'),
    digitalConversionTarget: integer('digital_conversion_target'),
    digitalBudget: money('digital_budget'),
    visitTarget: integer('visit_target'),
    callTarget: integer('call_target'),
    quoteTarget: integer('quote_target'),
    targetItems: jsonb('target_items').$type<UserTargetItem[]>(),
    note: text('note'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('department_targets_tenant_idx').on(t.tenantId),
    departmentIdx: index('department_targets_department_idx').on(t.departmentId),
    tenantDeptPeriodUnique: uniqueIndex('department_targets_tenant_dept_period_unique').on(t.tenantId, t.departmentId, t.period),
  })
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    isSystemRole: boolean('is_system_role').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantCodeUnique: uniqueIndex('roles_tenant_code_unique').on(t.tenantId, t.code),
  })
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    resource: varchar('resource', { length: 64 }).notNull(),
    action: varchar('action', { length: 32 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    codeUnique: uniqueIndex('permissions_code_unique').on(t.code),
    resourceActionUnique: uniqueIndex('permissions_resource_action_unique').on(t.resource, t.action),
  })
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  })
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  })
);

export const userDepartmentAssignments = pgTable(
  'user_department_assignments',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.departmentId] }),
  })
);

/**
 * Kullanıcı ↔ Bölüm (CNC/Üniversal/Sac) üyeliği. Bir kullanıcı birden çok
 * bölümde olabilir; `isPrimary` yeni iş oluştururken otomatik atanan bölümdür.
 */
export const userDivisions = pgTable(
  'user_divisions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.divisionId] }),
  })
);

/**
 * Kullanıcı yetki alanı matrisi. Rol/permission işlem yetkisini belirler; bu
 * tablo aynı işlemin hangi sayfa/modül + departman + bölüm kapsamında geçerli
 * olduğunu belirler.
 *
 * `divisionId = null` → ilgili resource için tüm bölümler.
 * `departmentId = null` → ilgili resource için tüm departmanlar.
 */
export const userAccessScopes = pgTable(
  'user_access_scopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resource: varchar('resource', { length: 64 }).notNull(),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userResourceIdx: index('user_access_scopes_user_resource_idx').on(t.userId, t.resource),
    tenantResourceIdx: index('user_access_scopes_tenant_resource_idx').on(t.tenantId, t.resource),
    uniqueScope: uniqueIndex('user_access_scopes_unique').on(
      t.userId,
      t.resource,
      sql`coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`coalesce(division_id, '00000000-0000-0000-0000-000000000000'::uuid)`
    ),
  })
);

export const loginSessions = pgTable(
  'login_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('login_sessions_user_idx').on(t.userId),
  })
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => loginSessions.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedById: uuid('replaced_by_id'),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('refresh_tokens_token_hash_unique').on(t.tokenHash),
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
  })
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('password_reset_tokens_token_hash_unique').on(t.tokenHash),
  })
);

/**
 * Mobil push bildirim token'ları (Expo push token). Bir kullanıcının birden
 * çok cihazı olabilir; token cihaz başına tekildir. Bildirim üretiminde ilgili
 * kullanıcının aktif token'larına Expo push gönderilir.
 */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull(),
    platform: varchar('platform', { length: 16 }).notNull().default('expo'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('push_tokens_token_unique').on(t.token),
    userIdx: index('push_tokens_user_idx').on(t.userId),
  })
);
