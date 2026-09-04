import { z } from 'zod';
import { NAVIGATION_VISIBILITY_KEYS } from '../navigation';
import { PERMISSION_RESOURCES } from '../constants';
import { usernameSchema } from './common';

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
  // Giriş için kullanılacak kullanıcı adı. E-posta iletişim için saklanır;
  // yeni kullanıcıların giriş tanımlayıcısı kullanıcı adıdır.
  username: usernameSchema,
  password: z.string().min(8).max(128),
  phone: z.string().max(32).optional(),
  departmentId: z.string().uuid().optional(),
  // Ünvan (user-titles lookup) — belgelerde imza satırında görünür.
  titleId: z.string().uuid().nullable().optional(),
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
  // Kullanıcı adı bir giriş tanımlayıcısıdır: yalnızca `users.update` iznine
  // sahip yönetici değiştirebilir (bu endpoint o izinle korunur; kullanıcının
  // kendi kullanıcı adını değiştirebileceği bir self-servis uç yoktur).
  username: usernameSchema.optional(),
  // null gönderilirse telefon temizlenir (super_admin düzenleme dialogu için).
  phone: z.string().max(32).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  titleId: z.string().uuid().nullable().optional(),
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
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Departman kodu yalnızca harf, rakam, tire ve alt çizgi içerebilir'),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
});
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;

export const departmentUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    message: 'Güncellenecek en az bir departman alanı gönderilmelidir',
  });
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;

export const auditLogQuerySchema = z.object({
  resourceType: z.string().max(64).optional(),
  actorUserId: z.string().optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/**
 * Haftalık kullanıcı raporunun alıcıları. Liste boşsa rapor tenant'ın süper
 * adminlerine gider; doluysa mail bu adreslere çıkar. Adresler küçük harfe
 * indirilip tekilleştirilir ki aynı kişi iki kez mail almasın.
 */
export const USER_REPORT_RECIPIENTS_MAX = 10;
export const userReportRecipientsSchema = z
  .array(z.string().trim().toLowerCase().email().max(255))
  .max(USER_REPORT_RECIPIENTS_MAX)
  .transform((list) => [...new Set(list)]);

export const tenantUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  taxNumber: z.string().max(32).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  hiddenNavigationKeys: z.array(z.enum(NAVIGATION_VISIBILITY_KEYS)).max(NAVIGATION_VISIBILITY_KEYS.length).optional(),
  userReportRecipients: userReportRecipientsSchema.optional(),
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
