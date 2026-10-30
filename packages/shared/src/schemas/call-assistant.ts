import { z } from 'zod';

export function normalizePhoneNumber(input: string): string | null {
  if (!/^[+\d\s().-]+$/.test(input) || input.length > 64) return null;
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = `90${digits.slice(1)}`;
  else if (digits.length === 10 && !input.trim().startsWith('+')) digits = `90${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}
const phone = z.string().trim().max(64).refine((v) => normalizePhoneNumber(v) !== null, 'Geçerli telefon numarası gerekli');
export const callAssistantMatchSchema = z.object({ phoneNumber: phone.optional(), companyId: z.string().uuid().optional(), contactId: z.string().uuid().optional() }).strict().refine((v) => v.phoneNumber || v.companyId || v.contactId, 'Telefon veya CRM kaydı gerekli');
const eventFields = {
  eventId: z.string().uuid(), deviceId: z.string().uuid(), phoneNumber: phone.optional(),
  direction: z.enum(['inbound', 'outbound']).default('outbound'),
  eventType: z.enum(['completed', 'missed', 'unknown']).default('unknown'),
  startedAt: z.string().datetime().optional(), endedAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().min(0).max(86400).optional(),
};
export const mobileCallEventSchema = z.object({ ...eventFields, phoneNumber: phone }).strict();
export const manualCallEventSchema = z.object({ ...eventFields, companyId: z.string().uuid().optional(), contactId: z.string().uuid().optional(), source: z.enum(['ios_return', 'manual', 'siri', 'voice']) }).strict().refine((v) => v.phoneNumber || v.companyId || v.contactId, 'Telefon veya CRM kaydı gerekli');
export const callSuggestionActionInputSchema = z.object({ action: z.enum(['open_opportunities', 'new_opportunity', 'add_note', 'create_task', 'new_service_ticket', 'dismiss']), operationId: z.string().uuid(), title: z.string().trim().min(1).max(255).optional(), text: z.string().trim().max(4000).optional(), dueAt: z.string().datetime().nullable().optional() }).strict();
export const callAssistantDraftCommitSchema = z.object({ operationId: z.string().uuid(), kind: z.enum(['opportunity', 'note', 'task', 'service_ticket']), payload: z.record(z.unknown()) }).strict();
export type MobileCallEventInput = z.infer<typeof mobileCallEventSchema>;
export type ManualCallEventInput = z.infer<typeof manualCallEventSchema>;
export type CallSuggestionActionInput = z.infer<typeof callSuggestionActionInputSchema>;
export type CallAssistantMatchInput = z.infer<typeof callAssistantMatchSchema>;
export type CallAssistantDraftCommitInput = z.infer<typeof callAssistantDraftCommitSchema>;
