import type { ChatMemberRole } from '@haksan/shared';
import { request } from './client';
import type { CalendarEvent, Conversation } from './endpoints';

/** Faz E (Genel & Raporlar) uçları: sohbet grup yönetimi, takvim geri alma, görev silme, ekip aktivitesi, mail imzası. */

export type ConversationDetail = Omit<Conversation, 'unreadCount' | 'lastMessage' | 'lastActivityAt'> & {
  description: string | null;
  createdBy: string | null;
};

export const chatGroups = {
  get: (id: string) => request<ConversationDetail>(`/chat/conversations/${id}`),
  addMembers: (id: string, userIds: string[]) =>
    request<ConversationDetail>(`/chat/conversations/${id}/members`, { method: 'POST', body: { userIds } }),
  removeMember: (id: string, userId: string) =>
    request<{ ok: true }>(`/chat/conversations/${id}/members/${userId}`, { method: 'DELETE' }),
  setRole: (id: string, userId: string, role: ChatMemberRole) =>
    request<{ ok: true }>(`/chat/conversations/${id}/members/${userId}/role`, { method: 'PATCH', body: { role } }),
};

/** Silinen (arşive alınan) etkinlik 30 gün içinde geri alınabilir; sunucu `calendar.update` ister. */
export const restoreCalendarEvent = (id: string) =>
  request<CalendarEvent>(`/calendar/events/${id}/restore`, { method: 'POST' });

export const deleteTask = (id: string) => request<{ deleted: true }>(`/tasks/${id}`, { method: 'DELETE' });

export type ActivityPeriod = 'week' | 'month' | 'year';
type Pair = { current: number; previous: number };
export type TeamActivity = {
  period: string;
  scope: 'team' | 'self';
  canSeeTeam: boolean;
  totals: { quotes: number; activities: number; opportunitiesCreated: number; won: number; wonValue: number };
  previousTotals: { quotes: number; activities: number; opportunitiesCreated: number; won: number };
  users: Array<{ userId: string; name: string; quotes: Pair; activities: Pair; opportunitiesCreated: Pair; won: Pair; total: Pair }>;
};

/** Süper admin ekibi, diğer herkes yalnız kendini görür (sunucu zorlar). */
export const teamActivity = (period: ActivityPeriod) =>
  request<TeamActivity>('/reports/team-activity', { query: { period, scope: 'team' } });

export type MailAccountStatus = {
  featureEnabled: boolean;
  configured: boolean;
  email: string | null;
  status: 'active' | 'error' | null;
  signature: string | null;
  defaultSignature: string | null;
  signatureImage: string | null;
};

export const mailAccount = () => request<MailAccountStatus>('/mail/account');
