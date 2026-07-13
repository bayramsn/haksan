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

export const assistantChatContextSchema = z.object({
  page: optionalText(80),
  recordId: optionalText(128),
  activeDivisionId: optionalText(128),
});
export type AssistantChatContext = z.infer<typeof assistantChatContextSchema>;

export const assistantChatInputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  context: assistantChatContextSchema.optional(),
});
export type AssistantChatInput = z.infer<typeof assistantChatInputSchema>;

export const assistantChatResponseSchema = z.object({
  text: z.string().max(4000),
  sources: z.array(assistantSourceSchema).default([]),
  actions: z.array(assistantSuggestedActionSchema).default([]),
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
