import { z } from 'zod';

export const passportPublishSchema = z.object({
  publicTitle: z.string().max(255).optional(),
  publicNotes: z.string().max(4000).optional(),
});
export type PassportPublishInput = z.infer<typeof passportPublishSchema>;

export const cpqPreviewSchema = z.object({
  companyId: z.string().optional(),
  productModelId: z.string().min(1),
  inventoryItemId: z.string().optional(),
  selectedOptionValueIds: z.array(z.string()).default([]),
  includeInstallation: z.coerce.boolean().default(false),
  includeLogistics: z.coerce.boolean().default(false),
  currencyCode: z.string().max(8).optional(),
});
export type CpqPreviewInput = z.infer<typeof cpqPreviewSchema>;

export const cpqCreateQuoteSchema = cpqPreviewSchema.extend({
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  validityDays: z.coerce.number().int().min(1).max(365).optional(),
  paymentTerms: z.string().max(2000).optional(),
  deliveryTerms: z.string().max(2000).optional(),
  warrantyTerms: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});
export type CpqCreateQuoteInput = z.infer<typeof cpqCreateQuoteSchema>;

export const publicTicketSchema = z.object({
  subject: z.string().min(3).max(255),
  description: z.string().max(4000).optional(),
  severity: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
});
export type PublicTicketInput = z.infer<typeof publicTicketSchema>;
