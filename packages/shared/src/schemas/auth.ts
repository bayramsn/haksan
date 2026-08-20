import { z } from 'zod';
import { NAVIGATION_VISIBILITY_KEYS } from '../navigation';
import { emailSchema, loginIdentifierSchema } from './common';

/**
 * Giriş: kullanıcı adı veya e-posta kabul edilir.
 *
 * `identifier` yeni istemcilerin gönderdiği alandır. `email` ise geriye dönük
 * uyumluluk içindir: yayında olan web/mobil sürümler hâlâ `email` gönderiyor ve
 * bu istemciler güncellenene kadar çalışmaya devam etmelidir. İkisinden en az
 * biri zorunludur; ikisi de gelirse `identifier` kazanır.
 *
 * `email` artık `emailSchema` ile değil `loginIdentifierSchema` ile
 * doğrulanıyor — eski bir istemcinin `email` alanına kullanıcı adı yazması da
 * çalışsın diye. Doğrulamanın gevşemesi güvenlik açığı yaratmaz: hesap araması
 * parametreli ve tam eşleşmelidir (bkz. AuthService.resolveAuthUser).
 */
export const loginSchema = z
  .object({
    identifier: loginIdentifierSchema.optional(),
    email: loginIdentifierSchema.optional(),
    password: z.string().min(8).max(128),
    tenantSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,64}$/).optional(),
  })
  .refine((input) => Boolean(input.identifier || input.email), {
    message: 'Kullanıcı adı veya e-posta zorunludur',
    path: ['identifier'],
  });
export type LoginInput = z.infer<typeof loginSchema>;

/** `identifier` / `email` ikilisinden geçerli olanı seçer. */
export function resolveLoginIdentifier(input: Pick<LoginInput, 'identifier' | 'email'>): string {
  return (input.identifier || input.email || '').trim();
}

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  tenantSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,64}$/).optional(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(256),
  newPassword: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: z.object({
    id: z.string(),
    email: emailSchema,
    fullName: z.string(),
    tenantId: z.string(),
    roles: z.array(z.string()),
  }),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: emailSchema,
    fullName: z.string(),
    tenantId: z.string(),
    departmentId: z.string().nullable(),
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
    mfaEnabled: z.boolean(),
    divisions: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), isPrimary: z.boolean() })).default([]),
    departments: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), isPrimary: z.boolean() })).default([]),
    accessScopes: z
      .array(
        z.object({
          resource: z.string(),
          departmentId: z.string().nullable(),
          divisionId: z.string().nullable(),
          isPrimary: z.boolean(),
        })
      )
      .default([]),
    canViewAllDivisions: z.boolean().default(false),
  }),
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    hiddenNavigationKeys: z.array(z.enum(NAVIGATION_VISIBILITY_KEYS)).default([]),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
