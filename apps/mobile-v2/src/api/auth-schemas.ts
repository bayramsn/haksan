import { loginResponseSchema, meResponseSchema } from '@haksan/shared';
import { z } from 'zod';

/**
 * Shared şemalar API dokümantasyonunun kaynağıdır. Mobil ağ sınırında ise
 * bilinmeyen alanları sessizce kırpmak istemiyoruz: sunucu/istemci sözleşmesi
 * ayrışırsa genel bir CONTRACT_MISMATCH hatasıyla fail-closed davranılmalı.
 */
const sessionUserSchema = loginResponseSchema.shape.user.strict();

export const authLoginResponseSchema = loginResponseSchema
  .extend({ user: sessionUserSchema })
  .strict();

const divisionSchema = meResponseSchema.shape.user.shape.divisions.removeDefault().element.strict();
const departmentSchema = meResponseSchema.shape.user.shape.departments.removeDefault().element.strict();
const accessScopeSchema = meResponseSchema.shape.user.shape.accessScopes.removeDefault().element.strict();

const meUserSchema = meResponseSchema.shape.user
  .extend({
    // Shared şemadaki OpenAPI-uyumluluk default'ları eksik ağ alanlarını
    // maskeleyebilir. API bu alanları her zaman döndürdüğü için mobil sınırda
    // onları zorunlu ve iç nesneleri de strict tutuyoruz.
    divisions: z.array(divisionSchema),
    departments: z.array(departmentSchema),
    accessScopes: z.array(accessScopeSchema),
    canViewAllDivisions: z.boolean(),
  })
  .strict();

const tenantSchema = meResponseSchema.shape.tenant
  .extend({
    hiddenNavigationKeys: meResponseSchema.shape.tenant.shape.hiddenNavigationKeys.removeDefault(),
  })
  .strict();

export const authMeResponseSchema = meResponseSchema
  .extend({ user: meUserSchema, tenant: tenantSchema })
  .strict();

/**
 * Refresh cookie yoksa controller 200 + null token döndürür. Geçerli cookie
 * için yanıt login sözleşmesiyle aynıdır; iki dalın dışında veri kabul edilmez.
 */
export const authRefreshResponseSchema = z.union([
  authLoginResponseSchema,
  z.object({ accessToken: z.null() }).strict(),
]);

export const authLogoutResponseSchema = z.object({ ok: z.literal(true) }).strict();

const forgotPasswordWireResponseSchema = z
  .object({
    ok: z.literal(true),
    devToken: z.string().min(20).max(256).optional(),
  })
  .strict();

/**
 * Dev reset token'ı wire contract içinde doğrulanır ancak uygulama katmanına
 * taşınmaz. Böylece log/state zincirinde gereksiz bir reset credential kalmaz.
 */
export const authForgotPasswordResponseSchema = forgotPasswordWireResponseSchema.transform(() => ({ ok: true as const }));

export const authResetPasswordResponseSchema = z.object({ ok: z.literal(true) }).strict();

export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
export type AuthRefreshResponse = z.infer<typeof authRefreshResponseSchema>;
export type AuthOkResponse = z.infer<typeof authLogoutResponseSchema>;
