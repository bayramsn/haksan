import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalendarSyncSettingsInput } from '@haksan/shared';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { calendarSyncApi, runCalendarSync } from '@/src/native/calendar-sync';

export const calendarSyncKey = ['calendar-sync-settings'] as const;

export const syncScope = (user: { tenantId: string; id: string }) => `${user.tenantId}:${user.id}`;

export function useCalendarSyncSettings() {
  const canRead = useCan('calendar.read');
  return useQuery({ queryKey: calendarSyncKey, queryFn: calendarSyncApi.settings, enabled: canRead });
}

export function useSaveCalendarSyncSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CalendarSyncSettingsInput) => calendarSyncApi.save(body),
    onSuccess: (row) => qc.setQueryData(calendarSyncKey, row),
  });
}

export function useRunCalendarSync() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (options: { force?: boolean } = {}) => {
      if (!user) throw new Error('Oturum bulunamadı.');
      return runCalendarSync(syncScope(user), options);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: calendarSyncKey });
      void qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}
