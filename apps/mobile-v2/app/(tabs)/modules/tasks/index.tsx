import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useTaskAssignees, useTaskCounts, useToggleTaskDone } from '@/src/api/tasks.hooks';
import { useTaskListExt, useTaskSummary } from '@/src/api/crm-general.hooks';
import type { TaskListQueryExt } from '@/src/api/crm-general.api';
import type { Task } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { EmptyState, ErrorState, Eyebrow, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { SheetMenu } from '@/src/ui/crm/SheetMenu';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import {
  EMPTY_TASK_FILTERS,
  TASK_EMPTY_BY_VIEW,
  TASK_PRIORITY_OPTIONS,
  TASK_SORT_OPTIONS,
  TASK_STATUS_OPTIONS,
  TASK_VIEWS,
  activeTaskFilterCount,
  buildTaskListQuery,
  taskSummaryLine,
  type TaskFilterState,
  type TaskSortValue,
  type TaskViewValue,
} from '@/src/ui/crm/task-logic';

const PRIORITY: Record<Task['priority'], { label: string; tone: Tone }> = {
  urgent: { label: 'Acil', tone: 'destructive' },
  high: { label: 'Yüksek', tone: 'warning' },
  normal: { label: 'Normal', tone: 'neutral' },
  low: { label: 'Düşük', tone: 'neutral' },
};

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  done: 'Tamamlandı',
  cancelled: 'İptal Edildi',
};

/** Son tarihi insan diline çevirir; gecikme sunucudan `overdue` olarak gelir. */
function dueText(task: Task): { text: string; tone: Tone } {
  if (!task.dueAt) return { text: 'Tarihsiz', tone: 'neutral' };
  const due = new Date(task.dueAt);
  const time = `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((due.getTime() - startOfToday.getTime()) / 86_400_000);
  if (task.overdue) {
    // Takvim günü yerine gerçek fark: dün 23:59'da biten görev bugün 00:30'da
    // "1 gün gecikti" demesin.
    const lateMs = Date.now() - due.getTime();
    if (lateMs < 3_600_000) return { text: `${Math.max(1, Math.round(lateMs / 60_000))} dk gecikti`, tone: 'destructive' };
    if (lateMs < 86_400_000) return { text: `${Math.floor(lateMs / 3_600_000)} saat gecikti`, tone: 'destructive' };
    return { text: `${Math.floor(lateMs / 86_400_000)} gün gecikti`, tone: 'destructive' };
  }
  if (days === 0) return { text: `Bugün ${time}`, tone: 'warning' };
  if (days === 1) return { text: `Yarın ${time}`, tone: 'info' };
  return { text: `${due.getDate()}.${due.getMonth() + 1} ${time}`, tone: 'neutral' };
}

function relatedText(task: Task): string | null {
  if (task.company) return task.company.shortName ?? task.company.legalTitle;
  if (task.opportunity) return task.opportunity.title;
  if (task.quote) return `Teklif ${task.quote.documentNo}`;
  if (task.serviceTicket) return `Servis ${task.serviceTicket.ticketNo}`;
  if (task.contact) return task.contact.fullName;
  return null;
}

export default function TasksScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('tasks.create');
  const canUpdate = useCan('tasks.update');
  const canManage = useCan('tasks.manage');
  const filterSheet = useRef<BottomSheetModal>(null);
  const sortSheet = useRef<BottomSheetModal>(null);

  const [view, setView] = useState<TaskViewValue>('mine');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_TASK_FILTERS);
  const [sortBy, setSortBy] = useState<TaskSortValue>('dueAt');

  const query = useMemo(
    () => buildTaskListQuery({ view, search: debouncedSearch, filters, sortBy }) as TaskListQueryExt,
    [view, debouncedSearch, filters, sortBy],
  );
  const list = useTaskListExt(query);
  const counts = useTaskCounts();
  const assignees = useTaskAssignees();
  const summary = useTaskSummary(canManage);
  const toggle = useToggleTaskDone();

  const items = list.data?.data ?? [];
  const filterCount = activeTaskFilterCount(filters);
  const peopleOptions = useMemo(
    () => [{ value: '', label: 'Tümü' }, ...(assignees.data ?? []).map((person) => ({ value: person.id, label: person.fullName }))],
    [assignees.data],
  );

  function setFilter<K extends keyof TaskFilterState>(key: K, value: string | null) {
    setFilters((prev) => ({ ...prev, [key]: value ?? '' }));
  }

  // Tamamlama önce not ister (web TaskCompletionDialog); yeniden açma doğrudan.
  function onToggle(task: Task) {
    if (task.status !== 'done') {
      router.push(`/modal/task-complete?id=${encodeURIComponent(task.id)}&title=${encodeURIComponent(task.title)}` as Href);
      return;
    }
    if (toggle.isPending) return;
    toggle.mutate(
      { id: task.id, status: 'todo' },
      {
        onSuccess: () => toast.success('Görev tekrar açıldı'),
        onError: (error) => toast.error(error.message || 'Görev güncellenemedi'),
      },
    );
  }

  function refresh() {
    void list.refetch();
    void counts.refetch();
    if (canManage) void summary.refetch();
  }

  const header = (
    <View className="gap-3 pb-2">
      {canManage && (summary.data?.length ?? 0) > 0 ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="people-outline" size={14} color={colors.mutedForeground} />
            <Eyebrow>Ekip görev durumu</Eyebrow>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(summary.data ?? []).map((row) => (
              <Pressable
                key={row.userId}
                accessibilityRole="button"
                accessibilityLabel={`${row.fullName} görevlerini filtrele`}
                onPress={() => {
                  setFilter('assignedToUserId', row.userId);
                  setView('all');
                }}
                className="min-h-11 justify-center rounded-control border border-border bg-card px-3 py-2 active:bg-muted"
              >
                <Text className="font-inter-medium text-sm text-foreground">{row.fullName}</Text>
                <Text className={`font-inter text-xs ${row.overdue > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {taskSummaryLine(row)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Görevler"
        subtitle="Bugün yapılacak işler, gecikenler ve size atananlar."
        actions={[
          { icon: 'swap-vertical-outline' as const, label: 'Sıralama', onPress: () => sortSheet.current?.present() },
          ...(canCreate ? [{ icon: 'add' as const, label: 'Yeni Görev', onPress: () => router.push('/modal/task' as Href) }] : []),
        ]}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: 52, flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 8, alignItems: 'center' }}
      >
        {TASK_VIEWS.map((item) => {
          const active = view === item.value;
          const count = counts.data?.[item.value] ?? 0;
          const alert = item.value === 'overdue' && count > 0 && !active;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.label}, ${count}`}
              onPress={() => setView(item.value)}
              className={`min-h-11 flex-row items-center gap-2 rounded-full border px-3 ${active ? 'border-primary bg-primary' : 'border-border bg-card'}`}
            >
              <Text className={`font-inter-medium text-sm ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{item.label}</Text>
              <View className={`rounded-full px-1.5 ${alert ? 'bg-destructive-soft' : active ? '' : 'bg-muted'}`}>
                <Text
                  className={`font-inter-medium text-xs ${alert ? 'text-destructive' : active ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="pb-2">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Görev, müşteri, firma, lead veya teklif ara…"
          onFilterPress={() => filterSheet.current?.present()}
          filterActive={filterCount > 0}
        />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message || 'Görevler yüklenemedi'} onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 32 }}
          refreshing={list.isRefetching}
          onRefresh={refresh}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState title="Görev yok" hint={TASK_EMPTY_BY_VIEW[view]} icon="checkbox-outline" />}
          renderItem={({ item }) => {
            const due = dueText(item);
            const related = relatedText(item);
            const done = item.status === 'done';
            const cancelled = item.status === 'cancelled';
            const closed = done || cancelled;
            return (
              <View
                className="my-[5px] flex-row items-center gap-3 rounded-[16px] border border-border bg-card px-3.5 py-3.5"
                style={{ borderCurve: 'continuous' }}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done, disabled: cancelled || !canUpdate }}
                  accessibilityLabel={cancelled ? 'İptal edilmiş görev' : done ? 'Görevi tekrar aç' : 'Görevi tamamla'}
                  hitSlop={10}
                  disabled={toggle.isPending || cancelled || !canUpdate}
                  onPress={() => onToggle(item)}
                  className={`h-11 w-11 items-center justify-center active:opacity-60 ${toggle.isPending || cancelled || !canUpdate ? 'opacity-50' : ''}`}
                >
                  <Ionicons
                    name={cancelled ? 'close-circle-outline' : done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={26}
                    color={done ? toneColor(colors, 'success') : colors.mutedForeground}
                  />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} görev detayı`}
                  className="flex-1 gap-0.5 active:opacity-60"
                  onPress={() => router.push(`/(tabs)/modules/tasks/${item.id}` as Href)}
                >
                  <Text
                    numberOfLines={1}
                    className={`text-[16px] font-inter-semibold leading-[21px] text-foreground ${closed ? 'line-through opacity-60' : ''}`}
                  >
                    {item.title}
                  </Text>
                  {related ? (
                    <Text numberOfLines={1} className="font-inter text-[13px] leading-[17px] text-muted-foreground">
                      {related}
                    </Text>
                  ) : null}
                  <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                    <View className={`self-start rounded-full border px-2 py-0.5 ${chipClass[due.tone]}`}>
                      <Text className={`font-inter-medium text-xs leading-[1.35] ${chipTextClass[due.tone]}`}>{due.text}</Text>
                    </View>
                    {item.priority !== 'normal' && item.priority !== 'low' ? (
                      <View className={`self-start rounded-full border px-2 py-0.5 ${chipClass[PRIORITY[item.priority].tone]}`}>
                        <Text className={`font-inter-medium text-xs leading-[1.35] ${chipTextClass[PRIORITY[item.priority].tone]}`}>
                          {PRIORITY[item.priority].label}
                        </Text>
                      </View>
                    ) : null}
                    {item.assignee ? (
                      <Text numberOfLines={1} className="font-inter text-xs text-muted-foreground">
                        {item.assignee.fullName}
                      </Text>
                    ) : null}
                    {closed || item.status === 'in_progress' ? (
                      <Text className="font-inter text-xs text-muted-foreground">{STATUS_LABEL[item.status]}</Text>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <SheetMenu
        ref={sortSheet}
        title="Sıralama"
        items={TASK_SORT_OPTIONS.map((option) => ({
          key: option.value,
          label: option.label,
          selected: option.value === sortBy,
          onPress: () => setSortBy(option.value),
        }))}
      />

      <BottomSheetModal
        ref={filterSheet}
        snapPoints={['70%']}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40, paddingTop: 4, paddingHorizontal: SCREEN_PAD }}>
          <Text className="font-inter-semibold text-base text-foreground">Filtreler</Text>
          <OptionPicker
            label="Durum"
            value={filters.status}
            options={[{ value: '', label: 'Tümü' }, ...TASK_STATUS_OPTIONS.map((option) => ({ ...option }))]}
            onChange={(value) => setFilter('status', value)}
          />
          <OptionPicker
            label="Öncelik"
            value={filters.priority}
            options={[{ value: '', label: 'Tümü' }, ...TASK_PRIORITY_OPTIONS.map((option) => ({ ...option }))]}
            onChange={(value) => setFilter('priority', value)}
          />
          <OptionPicker
            label="Atanan"
            icon="person-outline"
            value={filters.assignedToUserId}
            options={peopleOptions}
            searchable
            onChange={(value) => setFilter('assignedToUserId', value)}
          />
          <OptionPicker
            label="Oluşturan"
            icon="create-outline"
            value={filters.createdBy}
            options={peopleOptions}
            searchable
            onChange={(value) => setFilter('createdBy', value)}
          />
          {filterCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setFilters(EMPTY_TASK_FILTERS)}
              className="min-h-11 items-center justify-center rounded-control border border-border active:bg-muted"
            >
              <Text className="font-inter-medium text-sm text-foreground">Filtreleri temizle</Text>
            </Pressable>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
