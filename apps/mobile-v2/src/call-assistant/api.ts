import { request } from '@/src/api/client';

export type Match = { companyId: string; companyName: string; contactId?: string | null; contactName?: string | null };
export type Suggestion = {
  id: string; title: string; status: string; source: string; eventType: string;
  company: { id: string; name: string }; contact?: { id: string; name: string } | null;
  openOpportunities: { id: string; title: string }[];
};
export type DraftKind = 'opportunity' | 'note' | 'task' | 'service_ticket';
export type Draft = {
  id: string; kind: DraftKind; company: { id: string; name: string };
  contact?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  title?: string; text?: string; dueAt?: string; expiresAt?: string;
  status?: string;
};
export type AssistantAction = 'open_opportunities' | 'new_opportunity' | 'add_note' | 'create_task' | 'new_service_ticket' | 'dismiss';
export type EventInput = {
  eventId: string; deviceId: string; companyId?: string; contactId?: string; phoneNumber?: string;
  source: 'ios_return' | 'manual' | 'siri' | 'voice';
};
export type EventResult = { suggestionId?: string; status: 'matched' | 'ambiguous' | 'unmatched'; matches?: Match[] };
export const capabilities = () => request<{ enabled: boolean }>('/call-assistant/capabilities');
export const matchCall = (body: { phoneNumber?: string; companyId?: string; contactId?: string }) => request<{ matches: Match[] }>('/call-assistant/match', { method: 'POST', body });
export const manualEvent = (body: EventInput) => request<EventResult>('/call-assistant/manual-events', { method: 'POST', body });
export const mobileEvent = (body: { eventId: string; deviceId: string; phoneNumber: string; direction: 'inbound' | 'outbound'; eventType: 'completed' | 'missed' | 'unknown'; startedAt?: string; endedAt?: string; durationSeconds?: number }) => request<EventResult>('/mobile/calls/events', { method: 'POST', body });
export const suggestions = () => request<{ items: Suggestion[] }>('/call-assistant/suggestions');
export const readSuggestion = (id: string) => request<Suggestion>(`/call-assistant/suggestions/${encodeURIComponent(id)}`);
export const actOnSuggestion = (id: string, body: { action: AssistantAction; operationId: string; title?: string; text?: string; dueAt?: string }) => request<{ draftId?: string; status: string }>(`/call-assistant/suggestions/${encodeURIComponent(id)}/actions`, { method: 'POST', body });
export const readDraft = (id: string) => request<Draft>(`/call-assistant/drafts/${encodeURIComponent(id)}`);
export const commitDraft = (id: string, body: { operationId: string; kind: DraftKind; payload: unknown }) => request<{ resourceId: string; resourceType?: string }>(`/call-assistant/drafts/${encodeURIComponent(id)}/commit`, { method: 'POST', body });
export const phoneIndex = async () => {
  const result = await request<{ items: { normalizedPhone: string; companyId: string; contactId?: string | null }[] }>('/call-assistant/phone-index');
  return { entries: result.items.map(item => ({ phoneNumber: item.normalizedPhone, companyId: item.companyId, ...(item.contactId ? { contactId: item.contactId } : {}) })) };
};
