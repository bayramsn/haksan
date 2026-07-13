import { z } from 'zod';
import { emailSchema } from './common';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  tenantSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,64}$/).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

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
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
