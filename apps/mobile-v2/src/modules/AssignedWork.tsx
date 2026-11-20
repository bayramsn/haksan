import { useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { request, type Paginated } from '@/src/api/client';
import type { OpportunityListItem, QuoteListItem, ServiceTicket, Installation, Task } from '@/src/api/endpoints';
import { Button, EmptyState, ErrorState, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { prioritizeTasks, outstandingService } from './daily-work-policy';
import { useWorkScope } from './WorkScope';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';

export type AssignedKind = 'tasks' | 'sales' | 'service' | 'installations' | 'approvals';
export type DailyRow = { id: string; title: string; context: string | null; detail: string | null; route: string; urgent: boolean };
export const assignedTitles: Record<AssignedKind, string> = { installations: 'Kurulum İşlerim', tasks: 'Görevlerim', sales: 'Fırsatlarım', service: 'Atanmış Servis İşlerim', approvals: 'Fiyat Onayları' };
export async function fetchAssignedWork(kind: AssignedKind, userId: string, page = 1, options: { search?: string; taskView?: 'mine' | 'today' | 'overdue' } = {}): Promise<{ rows: DailyRow[]; total: number; next?: number }> {
  const query = { page, pageSize: 25, sortDir: 'asc', search: options.search };
  const envelope = <T,>(response: Paginated<T>, rows: DailyRow[]) => ({ rows, total: response.meta.total, next: response.meta.page < response.meta.totalPages ? response.meta.page + 1 : undefined });
  if (kind === 'tasks') {
    const response = await request<Paginated<Task>>('/tasks', { query: { ...query, view: options.taskView ?? 'mine', assignedToUserId: userId, sortBy: 'dueAt' } });
    return envelope(response, prioritizeTasks(response.data).map((row) => ({ id: row.id, title: row.title, context: row.company?.shortName ?? row.company?.legalTitle ?? null, detail: row.overdue ? 'Gecikti' : row.dueAt ? new Date(row.dueAt).toLocaleString('tr-TR') : 'Tarih belirlenmemiş', route: `/modules/tasks/${row.id}`, urgent: row.overdue })));
  }
  if (kind === 'sales') {
    const response = await request<Paginated<OpportunityListItem>>('/opportunities', { query: { ...query, view: 'active', ownerUserId: userId } });
    return envelope(response, response.data.map((row) => ({ id: row.id, title: row.title, context: row.company?.shortName ?? row.company?.legalTitle ?? row.leadCompanyTitle, detail: row.stage?.name ?? row.leadFollowUpStatus, route: `/modules/opportunities/${row.id}`, urgent: false })));
  }
  if (kind === 'installations') {
    const responses = await Promise.all((['planned', 'ongoing'] as const).map((phase) => request<Paginated<Installation>>('/installations', { query: { ...query, phase, assignedToUserId: userId } })));
    return { rows: responses.flatMap((response) => response.data).map((row) => ({ id: row.id, title: row.customerDevice?.productModelName ?? 'Kurulum', context: row.company?.shortName ?? row.company?.legalTitle ?? null, detail: row.scheduledDate ? new Date(row.scheduledDate).toLocaleString('tr-TR') : row.status?.name ?? null, route: `/modules/installations/${row.id}`, urgent: Boolean(row.scheduledDate && new Date(row.scheduledDate).getTime() < Date.now()) })), total: responses.reduce((sum, response) => sum + response.meta.total, 0), next: responses.some((response) => response.meta.page < response.meta.totalPages) ? page + 1 : undefined };
  }
  if (kind === 'service') {
    const responses = await Promise.all((['open', 'ongoing'] as const).map((phase) => request<Paginated<ServiceTicket>>('/service-tickets', { query: { ...query, phase, assignedToUserId: userId } })));
    const rows = responses.flatMap((response) => response.data);
    return { rows: outstandingService(rows).map((row) => ({ id: row.id, title: `${row.ticketNo} · ${row.subject}`, context: row.company?.shortName ?? row.company?.legalTitle ?? null, detail: row.status?.name ?? null, route: `/modules/service-tickets/${row.id}`, urgent: row.severity === 'critical' || row.severity === 'high' })), total: responses.reduce((sum, response) => sum + response.meta.total, 0), next: responses.some((response) => response.meta.page < response.meta.totalPages) ? page + 1 : undefined };

  }
  const response = await request<Paginated<QuoteListItem>>('/quotes', { query: { ...query, statusCode: 'pending_super_admin_approval' } });
  return envelope(response, response.data.map((row) => ({ id: row.id, title: row.documentNo, context: row.company?.shortName ?? row.company?.legalTitle ?? null, detail: 'Fiyat kararı bekliyor', route: `/modules/quotes/${row.id}`, urgent: true })));
}

export default function AssignedWork({ kind, initialTaskView = 'mine' }: { kind: AssignedKind; initialTaskView?: 'mine' | 'today' | 'overdue' }) {
  const { user, scope } = useAuth();
  const { colors } = useTheme();
  const work = useWorkScope();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [taskView, setTaskView] = useState(initialTaskView);
  const serverSearch = useDebouncedValue(search.trim());
  const list = useInfiniteQuery({ queryKey: [...(kind === 'tasks' ? ['tasks'] : kind === 'installations' ? ['service', 'installations'] : kind === 'service' ? ['service', 'tickets'] : kind === 'approvals' ? ['quotes'] : ['opportunities']), 'assigned-work', kind, user?.tenantId, user?.id, scope.divisionId, scope.departmentId, serverSearch, taskView], enabled: Boolean(user), initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchAssignedWork(kind, user!.id, pageParam, { search: serverSearch || undefined, taskView }), getNextPageParam: (last) => last.next });
  useFocusEffect(useCallback(() => { void list.refetch(); }, [list.refetch]));
  const rows = list.data?.pages.flatMap((page) => page.rows) ?? [];
  const total = list.data?.pages[0]?.total;
  const icon = kind === 'tasks' ? 'checkbox-outline' : kind === 'installations' ? 'build-outline' : kind === 'service' ? 'construct-outline' : kind === 'approvals' ? 'checkmark-circle-outline' : 'briefcase-outline';
  return <View className="flex-1">
    <ScreenHeader title={work ? 'İşler' : assignedTitles[kind]} />
    <View className="gap-2 pb-2">
      {kind === 'tasks' ? <View accessibilityRole="tablist" className="mx-4 flex-row rounded-xl border border-border bg-card p-1">
        {([['mine', 'Görevlerim'], ['today', 'Bugün'], ['overdue', 'Geciken']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: value === taskView }} onPress={() => setTaskView(value)} className={`min-h-11 flex-1 items-center justify-center rounded-lg px-1 py-2 ${value === taskView ? 'bg-muted' : ''}`}><Text className={`font-inter-medium text-[13px] ${value === taskView ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</Text></Pressable>)}
      </View> : null}
      <SearchBar value={search} onChange={(value) => setSearch(value.slice(0, 120))} placeholder={kind === 'tasks' ? 'Görev ara' : kind === 'installations' ? 'Kurulum ara' : kind === 'approvals' ? 'Teklif ara' : 'Kayıt ara'} />
      <View className="flex-row flex-wrap justify-between gap-1 px-4"><Text className="font-inter text-xs text-muted-foreground">{total == null ? 'Kayıtlar yükleniyor…' : `${total.toLocaleString('tr-TR')} kayıt`}</Text><Text className="font-inter text-xs text-muted-foreground">{kind === 'tasks' ? 'Son tarihe göre' : kind === 'approvals' ? 'Fiyat kararı bekleyenler' : 'Açık işler'}</Text></View>
    </View>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 10 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={<RefreshControl tintColor={colors.primary} refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}>
      {list.isPending ? <Loading /> : list.error ? <ErrorState message={list.error.message} onRetry={() => void list.refetch()} /> : !rows.length && !list.hasNextPage ? <EmptyState title={search ? 'Aramanıza uygun kayıt yok' : taskView === 'overdue' && kind === 'tasks' ? 'Geciken göreviniz yok' : taskView === 'today' && kind === 'tasks' ? 'Bugün sonlanan göreviniz yok' : 'Bekleyen kayıt yok'} hint={search ? 'Arama sözcüğünü değiştirerek tekrar deneyin.' : 'Yeni atanan işler burada görünecek.'} /> : null}
      {rows.map((row) => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={[row.title, row.context, row.detail].filter(Boolean).join(', ')} onPress={() => router.push(row.route as Href)} className="flex-row items-start gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-70">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted"><Ionicons name={icon} size={21} color={row.urgent ? colors.destructive : colors.mutedForeground} /></View>
        <View className="flex-1 gap-2"><Text className="font-inter-semibold text-base leading-5 text-foreground">{row.title}</Text>
          {row.context ? <Text className="font-inter text-sm text-muted-foreground">{row.context}</Text> : null}
          {row.detail ? <View className="flex-row items-center gap-1.5"><Ionicons name={row.urgent ? 'alert-circle-outline' : 'time-outline'} size={14} color={row.urgent ? colors.destructive : colors.mutedForeground} /><Text className={`flex-1 font-inter-medium text-xs ${row.urgent ? 'text-destructive' : 'text-muted-foreground'}`}>{row.detail}</Text></View> : null}
        </View><Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
      </Pressable>)}
      {list.hasNextPage ? <Button label="Daha fazla iş göster" variant="ghost" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /> : null}
    </ScrollView>
  </View>;
}
