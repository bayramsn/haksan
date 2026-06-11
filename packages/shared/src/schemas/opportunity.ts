import { z } from 'zod';
import { moneySchema } from './common';
import { PIPELINE_STAGES } from '../constants';

export const pipelineStageEnum = z.enum(PIPELINE_STAGES);

export const opportunityCreateSchema = z.object({
  companyId: z.string().min(1),
  primaryContactId: z.string().min(1).optional(),
  ownerUserId: z.string().min(1).optional(),
  title: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  estimatedValue: moneySchema.optional(),
  currencyCode: z.string().max(8).default('USD'),
  probability: z.coerce.number().int().min(0).max(100).default(50),
  expectedCloseDate: z.coerce.date().optional(),
  sourceCode: z.string().max(64).optional(),
  // Kazanılan fırsat için kabul/kazanma nedeni (yıl sonu raporu).
  wonReason: z.string().max(255).nullish(),
});
export type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;

export const opportunityUpdateSchema = opportunityCreateSchema.partial();
export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;

export const opportunityStageChangeSchema = z
  .object({
    toStage: pipelineStageEnum,
    changeReason: z.string().max(1000).optional(),
    cancellationReasonCode: z.string().max(64).optional(),
    lostCompetitorId: z.string().optional(),
    lostCompetitorProductModel: z.string().max(255).optional(),
    quoteId: z.string().optional(),
    inventoryItemIds: z.array(z.string()).optional(),
  })
  .refine(
    (val) => {
      if (val.toStage === 'cancelled') return !!val.cancellationReasonCode;
      return true;
    },
    { message: 'Cancelled aşamasına geçerken cancellation_reason zorunludur.', path: ['cancellationReasonCode'] }
  );
export type OpportunityStageChangeInput = z.infer<typeof opportunityStageChangeSchema>;

export const visitCreateSchema = z.object({
  opportunityId: z.string().optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  visitDate: z.coerce.date(),
  visitLocation: z.string().max(255).optional(),
  visitPurpose: z.string().max(1000).optional(),
  visitResult: z.string().max(2000).optional(),
  nextAction: z.string().max(1000).optional(),
});
export type VisitCreateInput = z.infer<typeof visitCreateSchema>;

export const callCreateSchema = z.object({
  opportunityId: z.string().optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  callDate: z.coerce.date(),
  callResult: z.string().max(2000).optional(),
  nextAction: z.string().max(1000).optional(),
});
export type CallCreateInput = z.infer<typeof callCreateSchema>;

export const activityCreateSchema = z.object({
  opportunityId: z.string().optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  activityTypeCode: z.string().max(64),
  subject: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  activityDate: z.coerce.date(),
  nextFollowUpAt: z.coerce.date().optional(),
  result: z.string().max(2000).optional(),
});
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;

export const competitorCreateSchema = z.object({
  name: z.string().min(1).max(255),
  website: z.string().url().max(512).optional(),
  notes: z.string().max(4000).optional(),
});
export type CompetitorCreateInput = z.infer<typeof competitorCreateSchema>;

export const competitorUpdateSchema = competitorCreateSchema.partial();
export type CompetitorUpdateInput = z.infer<typeof competitorUpdateSchema>;

export const competitorProductCreateSchema = z.object({
  modelCode: z.string().max(128).optional(),
  modelName: z.string().min(1).max(255),
  notes: z.string().max(4000).optional(),
});
export type CompetitorProductCreateInput = z.infer<typeof competitorProductCreateSchema>;
