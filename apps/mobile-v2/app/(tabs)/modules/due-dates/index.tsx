import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useDueDates } from '@/src/api/finance.hooks';
import type { DueDateItem } from '@/src/api/endpoints';
import { formatDate } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Chip, EmptyState, ErrorState, ListSkeleton, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { KpiGrid, KpiTile, Panel } from '@/src/ui/finance/kit';
import {
  agendaItems,
  dayKey,
  groupByDay,
  isFinanceAdmin,
  isOverdue,
  monthGrid,
  monthRange,
  monthTitle,
  nextSevenDays,
  shiftMonth,
  sumByCurrency,
  visibleDueItems,
  type MonthCursor,
} from '@/src/ui/finance/due-calendar';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function todayCursor(): MonthCursor {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default function DueDatesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const canRead = useCan('payments.read');
  const isAdmin = isFinanceAdmin(user?.roles);
  const [cursor, setCursor] = useState<MonthCursor>(todayCursor);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => dayKey(new Date()));
  const range = useMemo(() => monthRange(cursor), [cursor]);
  const { data, isPending, isRefetching, error, refetch } = useDueDates(range);

  const visible = useMemo(() => visibleDueItems(data ?? [], isAdmin), [data, isAdmin]);
  const byDay = useMemo(() => groupByDay(visible, cursor), [visible, cursor]);
  const next7 = useMemo(() => nextSevenDays(visible), [visible]);
  const agenda = useMemo(() => agendaItems(byDay, selectedKey, next7), [byDay, selectedKey, next7]);
  const tahsil = visible.filter((item) => item.type === 'borc');
  const odeme = visible.filter((item) => item.type === 'alacak');
  const label = monthTitle(cursor);
  const todayKey = dayKey(new Date());
  const selectedDate = selectedKey ? new Date(`${selectedKey}T00:00:00`) : null;

  function changeMonth(step: -1 | 1) {
    const next = shiftMonth(cursor, step);
    const now = new Date();
    const isTodayMonth = next.year === now.getFullYear() && next.month === now.getMonth();
    setCursor(next);
    setSelectedKey(isTodayMonth ? dayKey(now) : null);
  }

  if (!canRead) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Vade Takvimi" />
        <EmptyState icon="lock-closed-outline" title="Bu sayfaya erişim yetkiniz yok" hint="Kasa hareketlerini görme yetkisi (payments.read) gerekir." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <ScreenHeader title="Vade Takvimi" subtitle={`Tahsil ve ödeme vadeleri · ${label}`} />

        <KpiGrid>
          {[
            <KpiTile key="month" icon="calendar-outline" tone="stage" label="Bu Ay Vade" value={String(visible.length)} sub={label} />,
            <KpiTile
              key="next7"
              icon="time-outline"
              tone="warning"
              label="Önümüzdeki 7 Gün"
              value={String(next7.length)}
              sub={sumByCurrency(next7) || 'vade yok'}
            />,
            <KpiTile key="tahsil" icon="arrow-down-outline" tone="success" label="Tahsil" value={String(tahsil.length)} sub={sumByCurrency(tahsil) || '—'} />,
            isAdmin ? (
              <KpiTile key="odeme" icon="arrow-up-outline" tone="destructive" label="Ödeme" value={String(odeme.length)} sub={sumByCurrency(odeme) || '—'} />
            ) : null,
          ]}
        </KpiGrid>

        <Panel
          title="Vade Takvimi"
          subtitle={label}
          right={
            <View className="flex-row">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Önceki ay"
                onPress={() => changeMonth(-1)}
                className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
              >
                <Ionicons name="chevron-back" size={20} color={colors.foreground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sonraki ay"
                onPress={() => changeMonth(1)}
                className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
              >
                <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
              </Pressable>
            </View>
          }
        >
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <Legend tone="success" label="Tahsil" />
            {isAdmin ? <Legend tone="warning" label="Ödeme" /> : null}
            <Legend tone="destructive" label="Gecikmiş" />
          </View>
          {isPending ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState message={error.message} onRetry={() => void refetch()} />
          ) : (
            <View>
              <View className="flex-row pb-1">
                {WEEKDAYS.map((day) => (
                  <Text key={day} className="flex-1 text-center font-inter-medium text-[11px] text-muted-foreground">
                    {day}
                  </Text>
                ))}
              </View>
              {monthGrid(cursor).map((week, weekIndex) => (
                <View key={weekIndex} className="flex-row">
                  {week.map((cell, cellIndex) => {
                    if (!cell) return <View key={`empty-${cellIndex}`} className="h-[52px] flex-1" />;
                    const items = byDay.get(cell.key) ?? [];
                    const selected = selectedKey === cell.key;
                    const today = todayKey === cell.key;
                    const overdue = items.some((item) => isOverdue(item));
                    const hasIn = items.some((item) => item.type === 'borc');
                    const hasOut = items.some((item) => item.type === 'alacak');
                    return (
                      <Pressable
                        key={cell.key}
                        accessibilityRole="button"
                        accessibilityLabel={`${cell.day} ${label}, ${items.length} hareket`}
                        accessibilityState={{ selected }}
                        onPress={() => setSelectedKey(selected ? null : cell.key)}
                        className="h-[52px] flex-1 items-center justify-center p-0.5"
                      >
                        <View
                          className={`h-full w-full items-center justify-center gap-0.5 rounded-control ${
                            selected ? 'bg-primary' : items.length ? 'bg-warning-soft' : ''
                          } ${today && !selected ? 'border border-primary' : ''}`}
                        >
                          <Text
                            className={`font-inter-semibold text-[13px] ${selected ? 'text-primary-foreground' : today ? 'text-primary' : 'text-foreground'}`}
                          >
                            {cell.day}
                          </Text>
                          <View className="h-1.5 flex-row gap-0.5">
                            {hasIn ? <Dot color={selected ? colors.primaryForeground : toneColor(colors, 'success')} /> : null}
                            {hasOut ? <Dot color={selected ? colors.primaryForeground : toneColor(colors, 'warning')} /> : null}
                            {overdue ? <Dot color={selected ? colors.primaryForeground : toneColor(colors, 'destructive')} /> : null}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </Panel>

        <Panel
          title={selectedDate ? `${selectedDate.getDate()} ${label}` : 'Önümüzdeki 7 gün'}
          subtitle={`${agenda.length} hareket${agenda.length ? ` · ${sumByCurrency(agenda)}` : ''}`}
        >
          {agenda.length === 0 ? (
            <EmptyState icon="calendar-clear-outline" title="Bu gün için vade yok" hint="Başka bir gün seçin veya ay görünümünden planı inceleyin." />
          ) : (
            agenda.map((item) => <AgendaRow key={`${item.type}-${item.id}`} item={item} onPress={() => router.push(`/(tabs)/modules/companies/${item.companyId}` as Href)} />)
          )}
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

function Dot({ color }: { color: string }) {
  return <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />;
}

function Legend({ tone, label }: { tone: Tone; label: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-1.5">
      <Dot color={toneColor(colors, tone)} />
      <Text className="font-inter text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

function AgendaRow({ item, onPress }: { item: DueDateItem; onPress: () => void }) {
  const overdue = isOverdue(item);
  const tone: Tone = overdue ? 'destructive' : item.type === 'borc' ? 'success' : 'warning';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.companyName ?? 'Firma'}, ${item.amount.toLocaleString('tr-TR')} ${item.currencyCode}`}
      onPress={onPress}
      className="gap-2 rounded-control border border-border p-3 active:opacity-70"
      style={{ marginHorizontal: 0 }}
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="font-inter text-[11px] uppercase text-muted-foreground">{item.invoiceNo || 'Cari hareket'}</Text>
          <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>
            {item.companyName ?? 'Firma'}
          </Text>
        </View>
        <Chip tone={tone} label={overdue ? 'Gecikmiş' : item.type === 'borc' ? 'Tahsil' : 'Ödeme'} />
      </View>
      <View className="flex-row items-end justify-between border-t border-dashed border-border pt-2">
        <Text className="font-inter text-[11px] text-muted-foreground">{formatDate(item.dueDate)}</Text>
        <Text className="font-inter-semibold text-sm text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
          {item.amount.toLocaleString('tr-TR')} {item.currencyCode}
        </Text>
      </View>
    </Pressable>
  );
}