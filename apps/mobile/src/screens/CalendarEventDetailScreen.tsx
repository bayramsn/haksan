import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { calendarService, type CalendarEventDTO } from '@/src/api/services';
import {
  CalendarEventDetailFooter,
  CalendarEventDetailHeader,
  CalendarEventDetailsCard,
  CalendarEventHeroCard,
  CalendarEventQuickActions,
} from '@/src/ui/calendar/CalendarEventDetailWidgets';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing } from '@/src/theme/tokens';

function formatTimeRange(startsAt: string, endsAt: string, allDay?: boolean) {
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (allDay) {
      return start.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    const date = start.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
    const t1 = start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const t2 = end.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${t1} – ${t2}`;
  } catch {
    return startsAt;
  }
}

async function fetchEventById(id: string): Promise<CalendarEventDTO | null> {
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear() + 1, now.getMonth(), 0).toISOString();
  const rows = await calendarService.events({ from, to });
  return (rows as CalendarEventDTO[]).find((e) => e.id === id) ?? null;
}

/** Stitch `8e84c37a` — Takvim etkinlik detay */
export function CalendarEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<CalendarEventDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    void fetchEventById(id)
      .then((row) => {
        if (!row) {
          Alert.alert('Hata', 'Etkinlik bulunamadı', [{ text: 'Tamam', onPress: () => router.back() }]);
          return;
        }
        setEvent(row);
      })
      .catch((e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Yüklenemedi'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Screen padded={false}>
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      </Screen>
    );
  }

  if (!event) return null;

  const companyName = event.company?.shortName ?? event.company?.legalTitle;
  const timeRange = formatTimeRange(event.startsAt, event.endsAt, event.allDay);

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <CalendarEventDetailHeader onBack={() => router.back()} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <CalendarEventHeroCard
          timeRange={timeRange}
          title={event.title}
          companyName={companyName ?? undefined}
          location={event.location ?? undefined}
          eventType={event.eventType}
        />
        <CalendarEventQuickActions
          location={event.location ?? undefined}
          companyId={event.companyId}
          onCompanyPress={
            event.companyId
              ? () => router.push(`/modules/customers/${event.companyId}`)
              : undefined
          }
        />
        <CalendarEventDetailsCard
          ownerName={event.owner?.fullName}
          notes={event.description ?? undefined}
        />
      </ScrollView>
      <CalendarEventDetailFooter
        onEdit={() => router.push(`/forms/calendar-event?id=${event.id}`)}
        onOpenCalendar={() => router.push('/modules/calendar')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.canvas },
  content: {
    padding: layout.containerMargin,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
