import { z } from 'zod';
import { PERMISSION_RESOURCES } from '../constants';

export const userAccessScopeSchema = z.object({
  resource: z.enum(PERMISSION_RESOURCES),
  departmentId: z.string().uuid().nullable().optional(),
  divisionId: z.string().uuid().nullable().optional(),
  isPrimary: z.boolean().default(false),
});
export type UserAccessScopeInput = z.infer<typeof userAccessScopeSchema>;

export const userCreateSchema = z.object({
  fullName: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  phone: z.string().max(32).optional(),
  departmentId: z.string().optional(),
  roleCodes: z.array(z.string()).default([]),
  // Bölüm (CNC / Üniversal / Sac İşleme) üyelikleri — ticari veri izolasyonu ekseni.
  // İlk eleman birincil (varsayılan aktif) bölüm kabul edilir.
  divisionIds: z.array(z.string().uuid()).default([]),
  // Sayfa/modül + departman + bölüm kapsamları. Verilmezse API divisionIds'ten
  // geriye uyumlu varsayılan kapsam üretir.
  accessScopes: z.array(userAccessScopeSchema).optional(),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  // E-posta değişikliği yalnızca super_admin tarafından yapılabilir (controller'da zorlanır).
  email: z.string().email().max(255).optional(),
  // null gönderilirse telefon temizlenir (super_admin düzenleme dialogu için).
  phone: z.string().max(32).nullable().optional(),
  departmentId: z.string().nullable().optional(),
  status: z.enum(['active', 'passive']).optional(),
  roleCodes: z.array(z.string()).optional(),
  // Verildiğinde kullanıcının bölüm üyelikleri tümüyle bununla değiştirilir.
  divisionIds: z.array(z.string().uuid()).optional(),
  // Verildiğinde kullanıcının yetki alanı matrisi tümüyle bununla değiştirilir.
  accessScopes: z.array(userAccessScopeSchema).optional(),
  password: z.string().min(8).max(128).optional(),
  purchaseApprovalLimit: z.coerce.number().int().min(0).optional(),
  managerId: z.string().uuid().nullable().optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const roleCreateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  permissionCodes: z.array(z.string()).default([]),
});
export type RoleCreateInput = z.infer<typeof roleCreateSchema>;

export const roleUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  permissionCodes: z.array(z.string()).optional(),
});
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;

export const departmentCreateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;

export const departmentUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;

export const auditLogQuerySchema = z.object({
  resourceType: z.string().max(64).optional(),
  actorUserId: z.string().optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const tenantUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  taxNumber: z.string().max(32).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
});
export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;

export const targetPeriodQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
export type TargetPeriodQuery = z.infer<typeof targetPeriodQuerySchema>;

export const targetTypeSchema = z.enum(['sales', 'service', 'finance', 'purchase', 'operations', 'logistics', 'other']);
export type TargetType = z.infer<typeof targetTypeSchema>;

// Empty string / undefined collapse to null so optional numeric form fields clear cleanly.
const nullableAmount = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().min(0).nullable()
);
const nullableCount = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().int().min(0).nullable()
);

export const targetItemSchema = z.object({
  targetType: targetTypeSchema,
  category: z.string().min(1).max(64),
  activity: z.string().min(1).max(255),
  description: z.string().max(2000).default(''),
  unit: z.enum(['count', 'amount']),
  metricKey: z.string().max(64).optional(),
  trackingMode: z.enum(['automatic', 'manual']).optional(),
  target: z.string().max(64).default(''),
});
export type TargetItemInput = z.infer<typeof targetItemSchema>;

export const targetUpsertSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  currency: z.literal('USD').default('USD'),
  salesAmount: nullableAmount.default(null),
  salesNewCustomers: nullableCount.default(null),
  serviceAmount: nullableAmount.default(null),
  serviceCompleted: nullableCount.default(null),
  digitalLeadTarget: nullableCount.default(null),
  digitalConversionTarget: nullableCount.default(null),
  digitalBudget: nullableAmount.default(null),
  visitTarget: nullableCount.default(null),
  callTarget: nullableCount.default(null),
  quoteTarget: nullableCount.default(null),
  targetItems: z.array(targetItemSchema).max(80).default([]),
  note: z.string().max(2000).optional(),
});
export type TargetUpsertInput = z.infer<typeof targetUpsertSchema>;
