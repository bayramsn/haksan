import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().max(max).optional());
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());

export const callDirectionSchema = z.enum(['inbound', 'outbound']);
export type CallDirection = z.infer<typeof callDirectionSchema>;

export const callEventTypeSchema = z.enum(['completed', 'missed']);
export type CallEventType = z.infer<typeof callEventTypeSchema>;

export const callSuggestionStatusSchema = z.enum(['pending', 'acted', 'dismissed']);
export type CallSuggestionStatus = z.infer<typeof callSuggestionStatusSchema>;

export const callAssistantActionSchema = z.enum(['create_quote', 'create_service_ticket', 'log_call', 'dismiss']);
export type CallAssistantAction = z.infer<typeof callAssistantActionSchema>;

export const callWebhookPayloadSchema = z.object({
  tenantId: optionalText(64),
  eventId: optionalText(128),
  callId: optionalText(128),
  id: optionalText(128),
  direction: callDirectionSchema.default('inbound'),
  eventType: callEventTypeSchema.optional(),
  status: z.enum(['completed', 'missed', 'answered', 'no_answer', 'busy', 'failed']).optional(),
  callerNumber: optionalText(64),
  calleeNumber: optionalText(64),
  from: optionalText(64),
  to: optionalText(64),
  phoneNumber: optionalText(64),
  startedAt: optionalDate,
  endedAt: optionalDate,
  durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
  userId: optionalText(64),
  extension: optionalText(32),
});
export type CallWebhookPayload = z.infer<typeof callWebhookPayloadSchema>;

export const mobileCallEventSchema = z.object({
  eventId: optionalText(128),
  direction: callDirectionSchema.default('inbound'),
  eventType: callEventTypeSchema.optional(),
  status: z.enum(['completed', 'missed', 'answered', 'no_answer', 'busy', 'failed']).optional(),
  phoneNumber: z.string().min(5).max(64),
  startedAt: optionalDate,
  endedAt: optionalDate,
  durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
});
export type MobileCallEventInput = z.infer<typeof mobileCallEventSchema>;

export const manualCallEventSchema = z.object({
  eventId: optionalText(128),
  direction: callDirectionSchema.default('inbound'),
  eventType: callEventTypeSchema.default('completed'),
  status: z.enum(['completed', 'missed', 'answered', 'no_answer', 'busy', 'failed']).optional(),
  phoneNumber: z.string().min(5).max(64),
  startedAt: optionalDate,
  endedAt: optionalDate,
  durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
  notes: optionalText(1000),
});
export type ManualCallEventInput = z.infer<typeof manualCallEventSchema>;

export const callSuggestionListQuerySchema = z.object({
  status: callSuggestionStatusSchema.default('pending'),
});
export type CallSuggestionListQuery = z.infer<typeof callSuggestionListQuerySchema>;

export const callSuggestionActionInputSchema = z.object({
  action: callAssistantActionSchema,
  subject: optionalText(255),
  description: optionalText(4000),
  notes: optionalText(4000),
});
export type CallSuggestionActionInput = z.infer<typeof callSuggestionActionInputSchema>;

export function normalizePhoneNumber(value: unknown, defaultCountryCode = '90'): string | null {
  if (typeof value !== 'string') return null;
  const withoutExtension = value
    .split(/(?:\bext\.?\b|\bdahili\b|\bdh\.?\b|#|;|,)/i)[0]
    .trim();
  if (!withoutExtension) return null;

  let raw = withoutExtension.replace(/[^\d+]/g, '');
  if (!raw) return null;
  if (raw.startsWith('00')) raw = `+${raw.slice(2)}`;

  let digits = raw.startsWith('+') ? raw.slice(1).replace(/\D/g, '') : raw.replace(/\D/g, '');
  if (!digits) return null;

  if (!raw.startsWith('+')) {
    if (digits.startsWith('0') && digits.length === 11) {
      digits = `${defaultCountryCode}${digits.slice(1)}`;
    } else if (digits.length === 10) {
      digits = `${defaultCountryCode}${digits}`;
    } else if (digits.startsWith(defaultCountryCode) && digits.length === defaultCountryCode.length + 10) {
      // Already country-code prefixed without '+'
    }
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}
