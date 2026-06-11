import { z } from 'zod';
import { emailSchema } from './common';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(256),
  newPassword: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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
  }),
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
