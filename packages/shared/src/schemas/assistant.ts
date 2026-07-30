import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().max(max).optional());

export const assistantSeveritySchema = z.enum(['critical', 'warning', 'info', 'success']);
export type AssistantSeverity = z.infer<typeof assistantSeveritySchema>;

export const assistantSuggestionCategorySchema = z.enum([
  'today',
  'risk',
  'call',
  'sales',
  'service',
  'finance',
  'stock',
  'shipment',
  'activity',
]);
export type AssistantSuggestionCategory = z.infer<typeof assistantSuggestionCategorySchema>;

export const assistantActionKindSchema = z.enum([
  'navigate',
  'open_customer',
  'open_sales_case',
  'create_quote',
  'create_service_ticket',
  'log_call',
  'create_activity',
  'create_follow_up',
  'dismiss',
]);
export type AssistantActionKind = z.infer<typeof assistantActionKindSchema>;

export const assistantOperationActionSchema = z
  .object({
    kind: z.enum(['navigate', 'customer', 'salesCase']),
    nav: z.string().max(80).optional(),
    focus: z.string().max(120).optional(),
    query: z.string().max(255).optional(),
    customerId: z.string().max(80).optional(),
    salesCaseId: z.string().max(80).optional(),
  })
  .passthrough();
export type AssistantOperationAction = z.infer<typeof assistantOperationActionSchema>;

export const assistantSuggestedActionSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(80),
  kind: assistantActionKindSchema,
  requiresConfirmation: z.boolean().default(true),
  operationAction: assistantOperationActionSchema.optional(),
  payload: z.record(z.unknown()).optional(),
});
export type AssistantSuggestedAction = z.infer<typeof assistantSuggestedActionSchema>;

export const assistantSourceSchema = z.object({
  type: z.string().min(1).max(64),
  id: z.string().min(1).max(128),
  label: optionalText(255),
});
export type AssistantSource = z.infer<typeof assistantSourceSchema>;

export const assistantSuggestionSchema = z.object({
  id: z.string().min(1).max(160),
  category: assistantSuggestionCategorySchema,
  severity: assistantSeveritySchema,
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(1000),
  meta: optionalText(255),
  source: assistantSourceSchema.optional(),
  actions: z.array(assistantSuggestedActionSchema).default([]),
  createdAt: optionalText(64),
});
export type AssistantSuggestion = z.infer<typeof assistantSuggestionSchema>;

export const assistantBriefingLaneSchema = z.object({
  id: z.enum(['now', 'today', 'watch']),
  label: z.string().min(1).max(80),
  description: z.string().max(255),
  tone: z.enum(['critical', 'warning', 'info']),
  items: z.array(assistantSuggestionSchema).max(20),
});
export type AssistantBriefingLane = z.infer<typeof assistantBriefingLaneSchema>;

export const assistantBriefingResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  headline: z.string().min(1).max(255),
  summary: z.string().min(1).max(1000),
  metrics: z.object({
    total: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    calls: z.number().int().nonnegative(),
    sales: z.number().int().nonnegative(),
    finance: z.number().int().nonnegative(),
    service: z.number().int().nonnegative(),
  }),
  management: z.object({
    openPipelineCount: z.number().int().nonnegative(),
    openPipelineValue: z.number().nonnegative(),
    overdueReceivables: z.number().int().nonnegative(),
    openServiceItems: z.number().int().nonnegative(),
    pendingShipments: z.number().int().nonnegative(),
  }),
  lanes: z.array(assistantBriefingLaneSchema).length(3),
  quickPrompts: z.array(z.string().min(1).max(255)).max(8),
});
export type AssistantBriefingResponse = z.infer<typeof assistantBriefingResponseSchema>;

export const assistantCompanyMemorySchema = z.object({
  generatedAt: z.string().datetime(),
  company: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(500),
    relation: z.string().max(120).nullable(),
    status: z.string().max(120).nullable(),
    divisions: z.array(z.string().max(255)).max(20),
  }),
  summary: z.string().min(1).max(2000),
  highlights: z.array(z.string().max(500)).max(12),
  stats: z.object({
    contacts: z.number().int().nonnegative(),
    openQuotes: z.number().int().nonnegative(),
    openOpportunities: z.number().int().nonnegative(),
    overdueReceivables: z.number().int().nonnegative(),
    openServiceTickets: z.number().int().nonnegative(),
    pendingShipments: z.number().int().nonnegative(),
  }),
  recentActivities: z.array(z.object({
    id: z.string().uuid(),
    subject: z.string().max(255),
    date: z.string().datetime(),
    nextFollowUpAt: z.string().datetime().nullable(),
  })).max(8),
  openQuotes: z.array(z.object({
    id: z.string().uuid(),
    documentNo: z.string().max(64),
    status: z.string().max(120).nullable(),
    total: z.number(),
    date: z.string().datetime(),
  })).max(8),
  openOpportunities: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().max(255),
    stage: z.string().max(120).nullable(),
    value: z.number(),
    expectedCloseDate: z.string().datetime().nullable(),
  })).max(8),
});
export type AssistantCompanyMemory = z.infer<typeof assistantCompanyMemorySchema>;

/**
 * Fırsat çalışma alanındaki kontrollü özet. `mode`, gerçek bir model çağrısı
 * ile CRM verilerinden üretilen yerel özeti kullanıcıya açıkça ayırır.
 */
export const assistantOpportunitySummarySchema = z.object({
  generatedAt: z.string().datetime(),
  mode: z.enum(['ai', 'deterministic']),
  summary: z.string().min(1).max(2000),
  risks: z.array(z.string().min(1).max(500)).max(8),
  nextActions: z.array(z.string().min(1).max(500)).max(8),
  dataCoverage: z.number().int().min(0).max(100),
  source: z.object({
    type: z.literal('opportunity'),
    id: z.string().uuid(),
    label: z.string().min(1).max(255),
  }),
});
export type AssistantOpportunitySummary = z.infer<typeof assistantOpportunitySummarySchema>;

export const assistantChatContextSchema = z.object({
  page: optionalText(80),
  recordId: optionalText(128),
  activeDivisionId: optionalText(128),
});
export type AssistantChatContext = z.infer<typeof assistantChatContextSchema>;

export const assistantModeSchema = z.enum(['ask', 'prepare', 'execute']);
export type AssistantMode = z.infer<typeof assistantModeSchema>;

export const assistantChatInputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  mode: assistantModeSchema.optional(),
  context: assistantChatContextSchema.optional(),
});
export type AssistantChatInput = z.infer<typeof assistantChatInputSchema>;

export const assistantInboxChannelSchema = z.enum(['email', 'whatsapp', 'web_form', 'phone_note', 'crm']);
export type AssistantInboxChannel = z.infer<typeof assistantInboxChannelSchema>;

export const assistantInboxCategorySchema = z.enum(['sales', 'service', 'shipment', 'finance', 'general']);
export type AssistantInboxCategory = z.infer<typeof assistantInboxCategorySchema>;

export const assistantInboxPrioritySchema = z.enum(['critical', 'high', 'normal', 'low']);
export type AssistantInboxPriority = z.infer<typeof assistantInboxPrioritySchema>;

export const assistantInboxStatusSchema = z.enum(['new', 'in_progress', 'waiting', 'resolved', 'archived']);
export type AssistantInboxStatus = z.infer<typeof assistantInboxStatusSchema>;

export const assistantInboxItemSchema = z.object({
  id: z.string().uuid(),
  channel: assistantInboxChannelSchema,
  direction: z.enum(['inbound', 'outbound']),
  senderName: z.string().max(255).nullable(),
  senderEmail: z.string().max(320).nullable(),
  senderPhone: z.string().max(64).nullable(),
  subject: z.string().max(255).nullable(),
  body: z.string().max(10_000),
  category: assistantInboxCategorySchema,
  priority: assistantInboxPrioritySchema,
  status: assistantInboxStatusSchema,
  companyId: z.string().uuid().nullable(),
  companyName: z.string().max(500).nullable(),
  contactId: z.string().uuid().nullable(),
  contactName: z.string().max(255).nullable(),
  assignedToUserId: z.string().uuid().nullable(),
  receivedAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  nextFollowUpAt: z.string().datetime().nullable(),
  followUpCount: z.number().int().nonnegative(),
  draftReply: z.string().max(10_000).nullable(),
  classificationConfidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AssistantInboxItem = z.infer<typeof assistantInboxItemSchema>;

export const assistantInboxListQuerySchema = z.object({
  status: assistantInboxStatusSchema.optional(),
  category: assistantInboxCategorySchema.optional(),
  channel: assistantInboxChannelSchema.optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(40),
});
export type AssistantInboxListQuery = z.infer<typeof assistantInboxListQuerySchema>;

export const assistantInboxCaptureSchema = z
  .object({
    channel: assistantInboxChannelSchema,
    provider: z.string().trim().min(1).max(64).default('manual'),
    providerMessageId: optionalText(160),
    senderName: optionalText(255),
    senderEmail: z.preprocess(emptyToUndefined, z.string().trim().email().max(320).optional()),
    senderPhone: optionalText(64),
    subject: optionalText(255),
    body: z.string().trim().min(1).max(10_000),
    receivedAt: z.coerce.date().optional(),
    companyId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
  })
  .strict();
export type AssistantInboxCapture = z.infer<typeof assistantInboxCaptureSchema>;

export const assistantInboxUpdateSchema = z
  .object({
    status: assistantInboxStatusSchema.optional(),
    priority: assistantInboxPrioritySchema.optional(),
    assignedToUserId: z.string().uuid().nullable().optional(),
    nextFollowUpAt: z.coerce.date().nullable().optional(),
    draftReply: z.string().trim().max(10_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'En az bir alan güncellenmeli');
export type AssistantInboxUpdate = z.infer<typeof assistantInboxUpdateSchema>;

export const assistantSecretaryActionKindSchema = z.enum([
  'create_company',
  'update_company',
  'create_contact',
  'create_quote',
  'create_activity',
  'create_follow_up',
  'create_calendar_event',
  'create_proforma',
  'create_contract',
  'approve_quote',
  'send_email',
  'send_quote_email',
  'create_sales_package',
]);
export type AssistantSecretaryActionKind = z.infer<typeof assistantSecretaryActionKindSchema>;

export const assistantApprovalFieldSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().max(1000),
});
export type AssistantApprovalField = z.infer<typeof assistantApprovalFieldSchema>;

export const assistantApprovalCardSchema = z.object({
  id: z.string().uuid(),
  action: assistantSecretaryActionKindSchema,
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(1000),
  impact: z.enum(['medium', 'high']),
  fields: z.array(assistantApprovalFieldSchema).max(20).default([]),
  status: z.enum(['pending', 'executed', 'cancelled', 'failed', 'expired']).default('pending'),
  expiresAt: z.string().datetime(),
});
export type AssistantApprovalCard = z.infer<typeof assistantApprovalCardSchema>;

export const assistantChatResponseSchema = z.object({
  text: z.string().max(4000),
  sources: z.array(assistantSourceSchema).default([]),
  actions: z.array(assistantSuggestedActionSchema).default([]),
  approvals: z.array(assistantApprovalCardSchema).default([]),
});
export type AssistantChatResponse = z.infer<typeof assistantChatResponseSchema>;

export const assistantExecuteActionInputSchema = z.object({
  action: assistantActionKindSchema,
  confirm: z.boolean().default(false),
  payload: z.record(z.unknown()).optional(),
});
export type AssistantExecuteActionInput = z.infer<typeof assistantExecuteActionInputSchema>;

export const assistantExecuteActionResponseSchema = z.object({
  ok: z.boolean(),
  previewRequired: z.boolean().default(false),
  message: z.string().max(1000),
  result: z.unknown().optional(),
  operationAction: assistantOperationActionSchema.optional(),
});
export type AssistantExecuteActionResponse = z.infer<typeof assistantExecuteActionResponseSchema>;

export const assistantApprovalDecisionInputSchema = z.object({
  confirm: z.boolean(),
});
export type AssistantApprovalDecisionInput = z.infer<typeof assistantApprovalDecisionInputSchema>;

export const assistantApprovalDecisionResponseSchema = z.object({
  ok: z.boolean(),
  status: z.enum(['executed', 'cancelled', 'failed', 'expired']),
  message: z.string().max(1000),
  result: z.unknown().optional(),
  operationAction: assistantOperationActionSchema.optional(),
});
export type AssistantApprovalDecisionResponse = z.infer<typeof assistantApprovalDecisionResponseSchema>;
