import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { tr } from 'date-fns/locale';

const PRIMARY = '#000c69';

const calendarEvents = [
  { id: '1', title: 'Aylık Değerlendirme Toplantısı', type: 'meeting', date: '2026-06-30T10:00:00', time: '10:00 - 11:30', color: '#000c69' },
  { id: '2', title: 'Haksan Makina Ziyareti', type: 'visit', date: '2026-06-30T14:00:00', time: '14:00 - 16:00', color: '#10B981' },
  { id: '3', title: 'Teklif Revizyonu', type: 'task', date: '2026-06-30T16:30:00', color: '#F59E0B' },
  { id: '4', title: 'Asil Çelik Ödeme Hatırlatması', type: 'reminder', date: '2026-07-01T09:00:00', color: '#EF4444' },
];

const DAY_LABELS = ['Pt', 'Sa', 'Çr', 'Pe', 'Cu', 'Ct', 'Pz'];

const TYPE_LABELS: Record<string, string> = {
  meeting: 'Toplantı',
  visit: 'Ziyaret',
  task: 'Görev',
  reminder: 'Hatırlatma',
};

export function CalendarScreen() {
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 5, 30));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(2026, 5, 30));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start (Mon=0)
  let startPad = getDay(monthStart) - 1;
  if (startPad < 0) startPad = 6;

  const selectedEvents = calendarEvents.filter(e => {
    const evDate = new Date(e.date);
    return isSameDay(evDate, selectedDate);
  });

  const getEventsForDay = (day: Date) =>
    calendarEvents.filter(e => isSameDay(new Date(e.date), day));

  const today = new Date(2026, 5, 30);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1c1d" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Takvim</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Month Navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setCurrentMonth(prev => subMonths(prev, 1))} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color="#4b5563" />
        </TouchableOpacity>
        <Text style={styles.monthText}>
          {format(currentMonth, 'MMMM yyyy', { locale: tr })}
        </Text>
        <TouchableOpacity onPress={() => setCurrentMonth(prev => addMonths(prev, 1))} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color="#4b5563" />
        </TouchableOpacity>
      </View>

      {/* Day Headers */}
      <View style={styles.dayHeaders}>
        {DAY_LABELS.map(d => (
          <Text key={d} style={styles.dayHeaderText}>{d}</Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.gridContainer}>
        {/* Padding cells */}
        {Array.from({ length: startPad }).map((_, i) => (
          <View key={`pad-${i}`} style={styles.gridCell} />
        ))}
        {days.map((day) => {
          const events = getEventsForDay(day);
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, today);
          const isCurrentMonth = isSameMonth(day, currentMonth);

          return (
            <TouchableOpacity
              key={day.toISOString()}
              onPress={() => setSelectedDate(day)}
              style={[
                styles.gridCell,
                isSelected ? styles.cellSelected : isToday ? styles.cellToday : null
              ]}
            >
              <Text style={[
                styles.cellText,
                isSelected ? styles.cellTextSelected : isToday ? styles.cellTextToday : isCurrentMonth ? styles.cellTextCurrent : styles.cellTextMuted
              ]}>
                {format(day, 'd')}
              </Text>
              {events.length > 0 && (
                <View style={styles.eventDotsRow}>
                  {events.slice(0, 2).map((e, idx) => (
                    <View
                      key={e.id || idx}
                      style={[
                        styles.eventDot,
                        { backgroundColor: isSelected ? 'rgba(255,255,255,0.8)' : e.color }
                      ]}
                    />
                  ))}
                  {events.length > 2 && (
                    <Text style={[styles.eventMoreText, { color: isSelected ? 'rgba(255,255,255,0.7)' : '#9ca3af' }]}>
                      +{events.length - 2}
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.divider} />

      {/* Selected Day Events */}
      <View style={styles.eventsHeader}>
        <Text style={styles.eventsHeaderText}>
          {format(selectedDate, 'd MMMM', { locale: tr })} — {selectedEvents.length === 0 ? 'Etkinlik yok' : `${selectedEvents.length} etkinlik`}
        </Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {selectedEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="time-outline" size={24} color="#9ca3af" />
            </View>
            <Text style={styles.emptyText}>Bu gün için etkinlik yok</Text>
            <Text style={styles.emptySubText}>Yeni etkinlik eklemek için + tuşuna basın</Text>
          </View>
        ) : (
          selectedEvents.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <View style={[styles.eventBar, { backgroundColor: event.color }]} />
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <View style={styles.eventMetaRow}>
                  {event.time && (
                    <View style={styles.eventTimeRow}>
                      <Ionicons name="time-outline" size={12} color="#6b7280" />
                      <Text style={styles.eventTimeText}>{event.time}</Text>
                    </View>
                  )}
                  <View style={[styles.typeBadge, { backgroundColor: `${event.color}20` }]}>
                    <Text style={[styles.typeBadgeText, { color: event.color }]}>
                      {TYPE_LABELS[event.type]}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => router.push('/forms/calendar-event')}>
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1c1d' },

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  navBtn: { padding: 8, borderRadius: 12, backgroundColor: '#f9fafb' },
  monthText: { fontSize: 14, fontWeight: '700', color: '#111827', textTransform: 'capitalize' },

  dayHeaders: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    paddingVertical: 4,
  },
  dayHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
  },

  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  gridCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    paddingTop: 4,
    borderRadius: 12,
  },
  cellSelected: { backgroundColor: PRIMARY },
  cellToday: { backgroundColor: '#EEF2FF' },
  cellText: { fontSize: 12, fontWeight: '500' },
  cellTextSelected: { color: '#ffffff' },
  cellTextToday: { color: PRIMARY, fontWeight: '700' },
  cellTextCurrent: { color: '#374151' },
  cellTextMuted: { color: '#d1d5db' },

  eventDotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eventMoreText: {
    fontSize: 8,
  },

  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginHorizontal: 16,
    marginVertical: 8,
  },

  eventsHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  eventsHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },

  list: { flex: 1, backgroundColor: '#f9fafb' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100, gap: 8 },
  
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyText: { fontSize: 14, color: '#6b7280' },
  emptySubText: { fontSize: 12, color: '#9ca3af', marginTop: 4 },

  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  eventBar: {
    width: 4,
    borderRadius: 2,
  },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  eventTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventTimeText: { fontSize: 11, color: '#6b7280' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  typeBadgeText: { fontSize: 10, fontWeight: '500' },

  fab: {
    position: 'absolute',
    bottom: 88,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});
