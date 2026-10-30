import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { calendarSyncKey, syncScope } from '@/src/api/calendar-sync.hooks';
import { captureException } from '@/src/observability/sentry';
import { calendarDeviceId, calendarSyncApi, runCalendarSync, setCalendarSyncScope } from './calendar-sync';

const MIN_INTERVAL_MS = 15 * 60 * 1000;
let lastAttempt = 0;

/**
 * "Otomatik senkron" açıksa ve bu telefon ana cihazsa, uygulama öne geldiğinde
 * cihaz takvimini CRM ile eşitler. Hata sessiz geçer; ekran elle tetiklemede gösterir.
 * ponytail: uygulama kapalıyken çalışmaz; gerekirse offline/sync.ts'deki arka plan görevine eklenir.
 */
export function CalendarAutoSync() {
  const { user } = useAuth();
  const canSync = useCan('calendar.update');
  const qc = useQueryClient();

  useEffect(() => {
    setCalendarSyncScope(user ? syncScope(user) : null);
    if (!user || !canSync) return;
    const scope = syncScope(user);
    const attempt = async () => {
      if (Date.now() - lastAttempt < MIN_INTERVAL_MS) return;
      lastAttempt = Date.now();
      try {
        const settings = await qc.fetchQuery({ queryKey: calendarSyncKey, queryFn: calendarSyncApi.settings });
        if (!settings?.autoSync || settings.primaryDeviceId !== calendarDeviceId()) return;
        await runCalendarSync(scope);
        void qc.invalidateQueries({ queryKey: ['calendar'] });
      } catch (error) {
        captureException(error, { operation: 'calendar_auto_sync' });
      }
    };
    void attempt();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void attempt();
    });
    return () => sub.remove();
  }, [user, canSync, qc]);

  return null;
}
