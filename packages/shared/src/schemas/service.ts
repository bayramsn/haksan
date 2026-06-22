import { z } from 'zod';

export const serviceSeveritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export const serviceTicketTypeSchema = z.enum(['complaint', 'request', 'warranty_claim', 'question']);
export const serviceComplaintSourceSchema = z.enum(['qr', 'web', 'phone', 'whatsapp', 'email', 'manual']);
export const serviceComplaintStatusSchema = z.enum(['new', 'reviewing', 'converted', 'rejected']);

export const serviceComplaintCreateSchema = z.object({
  divisionId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional().nullable(),
  customerDeviceId: z.string().uuid().optional().nullable(),
  source: serviceComplaintSourceSchema.default('manual'),
  subject: z.string().min(3).max(255),
  description: z.string().max(4000).optional().nullable(),
  severity: serviceSeveritySchema.default('normal'),
  ticketType: serviceTicketTypeSchema.default('complaint'),
  contactName: z.string().max(255).optional().nullable(),
  contactPhone: z.string().max(64).optional().nullable(),
  contactEmail: z.string().email().max(255).optional().or(z.literal('')).nullable(),
});
export type ServiceComplaintCreateInput = z.infer<typeof serviceComplaintCreateSchema>;

export const serviceComplaintUpdateSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  customerDeviceId: z.string().uuid().optional().nullable(),
  status: serviceComplaintStatusSchema.optional(),
  source: serviceComplaintSourceSchema.optional(),
  subject: z.string().min(3).max(255).optional(),
  description: z.string().max(4000).optional().nullable(),
  severity: serviceSeveritySchema.optional(),
  ticketType: serviceTicketTypeSchema.optional(),
  contactName: z.string().max(255).optional().nullable(),
  contactPhone: z.string().max(64).optional().nullable(),
  contactEmail: z.string().email().max(255).optional().or(z.literal('')).nullable(),
});
export type ServiceComplaintUpdateInput = z.infer<typeof serviceComplaintUpdateSchema>;

export const serviceComplaintRejectSchema = z.object({
  rejectionNote: z.string().max(4000).optional().nullable(),
});
export type ServiceComplaintRejectInput = z.infer<typeof serviceComplaintRejectSchema>;

export const serviceComplaintConvertSchema = z.object({
  assignedToUserId: z.string().uuid().optional().nullable(),
});
export type ServiceComplaintConvertInput = z.infer<typeof serviceComplaintConvertSchema>;

export const serviceComplaintLinkCreateSchema = z.object({
  divisionId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional().nullable(),
  customerDeviceId: z.string().uuid().optional().nullable(),
  title: z.string().max(255).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});
export type ServiceComplaintLinkCreateInput = z.infer<typeof serviceComplaintLinkCreateSchema>;

export const publicServiceComplaintSchema = z.object({
  subject: z.string().min(3).max(255),
  description: z.string().max(4000).optional().nullable(),
  severity: serviceSeveritySchema.default('normal'),
  ticketType: serviceTicketTypeSchema.default('complaint'),
  source: z.enum(['qr', 'web']).default('web'),
  contactName: z.string().max(255).optional().nullable(),
  contactPhone: z.string().max(64).optional().nullable(),
  contactEmail: z.string().email().max(255).optional().or(z.literal('')).nullable(),
  attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
});
export type PublicServiceComplaintInput = z.infer<typeof publicServiceComplaintSchema>;
