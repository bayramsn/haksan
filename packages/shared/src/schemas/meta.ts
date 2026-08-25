import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalId = z.string().uuid().nullable().optional();

export const metaConnectionStatusSchema = z.enum(['active', 'disabled', 'error']);
export const metaConnectionCreateSchema = z.object({
  name: trimmed(120),
  accessToken: trimmed(4096),
  pageId: trimmed(64).optional(),
  instagramAccountId: trimmed(64).optional(),
  adAccountId: trimmed(64).optional(),
  businessId: trimmed(64).optional(),
  datasetId: trimmed(64).optional(),
  whatsappBusinessAccountId: trimmed(64).optional(),
  phoneNumberId: trimmed(64).optional(),
  permissions: z.array(trimmed(128)).max(100).default([]),
  tokenExpiresAt: z.string().datetime().nullable().optional(),
});
export const metaConnectionUpdateSchema = metaConnectionCreateSchema
  .omit({ accessToken: true })
  .partial()
  .extend({
    accessToken: trimmed(4096).optional(),
    status: metaConnectionStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'En az bir alan gönderilmelidir');

export const metaLeadTargetFieldSchema = z.enum([
  'contactName',
  'companyTitle',
  'phone',
  'email',
  'city',
  'district',
  'needSummary',
  'requestedMachine',
]);
export const metaFormMappingCreateSchema = z.object({
  connectionId: z.string().uuid(),
  formId: trimmed(64),
  formName: trimmed(255),
  fieldMappings: z.record(trimmed(128), metaLeadTargetFieldSchema),
  divisionId: optionalId,
  ownerUserId: optionalId,
  isActive: z.boolean().default(true),
});
export const metaFormMappingUpdateSchema = metaFormMappingCreateSchema
  .omit({ connectionId: true, formId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'En az bir alan gönderilmelidir');

export const metaListQuerySchema = z.object({
  connectionId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const metaDateRangeQuerySchema = metaListQuerySchema.extend({
  from: z.coerce.date(),
  to: z.coerce.date(),
}).refine((value) => value.to >= value.from, { message: 'to, from tarihinden önce olamaz', path: ['to'] });

export const metaConversationMessageCreateSchema = z.object({
  connectionId: z.string().uuid(),
  channel: z.enum(['messenger', 'instagram', 'whatsapp']),
  text: trimmed(2000),
});
export const metaCommentReplyCreateSchema = z.object({
  connectionId: z.string().uuid(),
  message: trimmed(2000),
});
export const metaCommentUpdateSchema = z.object({
  connectionId: z.string().uuid(),
  hidden: z.boolean(),
});

export const metaCampaignUpdateSchema = z.object({
  connectionId: z.string().uuid(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  dailyBudgetMinor: z.coerce.number().int().min(100).max(1_000_000_000).optional(),
  confirmation: z.literal('META_CAMPAIGN_CHANGE').optional(),
}).superRefine((value, ctx) => {
  if (value.status === undefined && value.dailyBudgetMinor === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'En az bir işlem gönderilmelidir' });
  if ((value.status === 'ACTIVE' || value.dailyBudgetMinor !== undefined) && value.confirmation !== 'META_CAMPAIGN_CHANGE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Aktivasyon ve bütçe değişikliği açık onay gerektirir', path: ['confirmation'] });
  }
});
export const metaCampaignCreateSchema = z.object({
  connectionId: z.string().uuid(),
  name: trimmed(255),
  objective: z.enum(['OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_APP_PROMOTION', 'OUTCOME_SALES']),
  buyingType: z.enum(['AUCTION', 'RESERVED']).default('AUCTION'),
  specialAdCategories: z.array(z.enum(['CREDIT', 'EMPLOYMENT', 'HOUSING', 'ISSUES_ELECTIONS_POLITICS', 'NONE'])).min(1).max(4).default(['NONE']),
  status: z.literal('PAUSED').default('PAUSED'),
}).refine((value) => value.specialAdCategories.length === 1 || !value.specialAdCategories.includes('NONE'), { message: 'NONE başka özel reklam kategorileriyle birlikte kullanılamaz', path: ['specialAdCategories'] });
export const metaDestructiveConfirmationSchema = z.object({
  connectionId: z.string().uuid(),
  confirmation: z.literal('DELETE'),
});

export const metaAudienceCreateSchema = z.object({
  connectionId: z.string().uuid(),
  name: trimmed(255),
  description: z.string().trim().max(1000).optional(),
  customerFileSource: z.enum(['USER_PROVIDED_ONLY', 'PARTNER_PROVIDED_ONLY', 'BOTH_USER_AND_PARTNER_PROVIDED']).default('USER_PROVIDED_ONLY'),
});
export const metaAudienceMembersSchema = z.object({
  connectionId: z.string().uuid(),
  opportunityIds: z.array(z.string().uuid()).min(1).max(10_000),
  legalBasisConfirmed: z.literal(true),
}).strict();
export const metaAudienceMembersRemoveSchema = z.object({
  connectionId: z.string().uuid(),
  opportunityIds: z.array(z.string().uuid()).min(1).max(10_000),
  confirmation: z.literal('DELETE'),
});
export const metaAudienceUpdateSchema = z.object({
  connectionId: z.string().uuid(),
  name: trimmed(255).optional(),
  description: z.string().trim().max(1000).optional(),
}).refine((value) => value.name !== undefined || value.description !== undefined, 'En az bir alan gönderilmelidir');

export const metaCatalogCreateSchema = z.object({
  connectionId: z.string().uuid(),
  name: trimmed(255),
  vertical: z.enum(['commerce', 'vehicles']).default('commerce'),
});
export const metaCatalogProductsSchema = z.object({
  connectionId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).min(1).max(500),
});
export const metaCatalogUpdateSchema = z.object({
  connectionId: z.string().uuid(),
  name: trimmed(255),
});
export const metaCatalogProductDeleteSchema = metaDestructiveConfirmationSchema.extend({ productIds: z.array(z.string().uuid()).min(1).max(500) });

export const metaConversionEventCreateSchema = z.object({
  connectionId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  eventName: z.enum(['Lead', 'Contact', 'QualifiedLead', 'Schedule', 'SubmitApplication', 'Purchase']),
  occurredAt: z.string().datetime(),
  value: z.coerce.number().nonnegative().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  eventId: trimmed(128),
  userData: z.object({
    emailSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    phoneSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    clientIpAddress: z.string().max(64).optional(),
    clientUserAgent: z.string().max(512).optional(),
    fbc: z.string().max(256).optional(),
    fbp: z.string().max(256).optional(),
  }).strict(),
  customData: z.record(z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()])).optional(),
});

export type MetaConnectionCreateInput = z.infer<typeof metaConnectionCreateSchema>;
export type MetaConnectionUpdateInput = z.infer<typeof metaConnectionUpdateSchema>;
export type MetaFormMappingCreateInput = z.infer<typeof metaFormMappingCreateSchema>;
export type MetaFormMappingUpdateInput = z.infer<typeof metaFormMappingUpdateSchema>;
export type MetaListQuery = z.infer<typeof metaListQuerySchema>;
export type MetaDateRangeQuery = z.infer<typeof metaDateRangeQuerySchema>;
export type MetaConversationMessageCreateInput = z.infer<typeof metaConversationMessageCreateSchema>;
export type MetaCommentReplyCreateInput = z.infer<typeof metaCommentReplyCreateSchema>;
export type MetaCommentUpdateInput = z.infer<typeof metaCommentUpdateSchema>;
export type MetaCampaignUpdateInput = z.infer<typeof metaCampaignUpdateSchema>;
export type MetaCampaignCreateInput = z.infer<typeof metaCampaignCreateSchema>;
export type MetaDestructiveConfirmationInput = z.infer<typeof metaDestructiveConfirmationSchema>;
export type MetaAudienceCreateInput = z.infer<typeof metaAudienceCreateSchema>;
export type MetaAudienceMembersInput = z.infer<typeof metaAudienceMembersSchema>;
export type MetaAudienceMembersRemoveInput = z.infer<typeof metaAudienceMembersRemoveSchema>;
export type MetaAudienceUpdateInput = z.infer<typeof metaAudienceUpdateSchema>;
export type MetaCatalogCreateInput = z.infer<typeof metaCatalogCreateSchema>;
export type MetaCatalogProductsInput = z.infer<typeof metaCatalogProductsSchema>;
export type MetaCatalogUpdateInput = z.infer<typeof metaCatalogUpdateSchema>;
export type MetaCatalogProductDeleteInput = z.infer<typeof metaCatalogProductDeleteSchema>;
export type MetaConversionEventCreateInput = z.infer<typeof metaConversionEventCreateSchema>;
