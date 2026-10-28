import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useAdminDepartments, useDeleteDepartment, useDepartmentTargets } from '@/src/api/admin.hooks';
import type { AdminDepartment } from '@/src/api/admin.api';
import { Card, Chip, EmptyState, ErrorState, ListSkeleton, SCREEN_PAD, SearchBar, StatStrip } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from './access';
import { filterByText } from './admin-model';
import { ActionPill, PeriodStepper, confirmDestructive } from './controls';
import { currentPeriod, formatPeriodLabel, hasTargetValue, targetFromApi } from './target-model';

/**
 * İki yüzey tek bileşen: `module` web Departmanlar sayfası (hedefli organizasyon
 * kartları), `settings` web Ayarlar › Kullanıcı Departmanları kartı (düzenle/çıkar).
 */
export function DepartmentManager({ mode }: { mode: 'module' | 'settings' }) {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const access = useAdminAccess();
  const canCreate = access.isAdmin || access.has('departments.create');
  const canUpdate = access.has('departments.update');
  const canDelete = access.has('departments.delete');
  const canSetTargets = mode === 'module' && access.isAdmin;

  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState(currentPeriod());
  const list = useAdminDepartments();
  const targets = useDepartmentTargets(period, canSetTargets);
  const remove = useDeleteDepartment();

  const rows = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'tr')), [list.data]);
  const visible = useMemo(() => filterByText(rows, query, (d) => [d.name, d.code, d.description]), [rows, query]);
  const targetSet = useMemo(() => {
    const set = new Set<string>();
    (targets.data ?? []).forEach((row) => {
      if (row.departmentId && hasTargetValue(targetFromApi(row, period))) set.add(row.departmentId);
    });
    return set;
  }, [targets.data, period]);

  const editHref = (department?: AdminDepartment) =>
    `/modal/department-edit?source=${mode}${department ? `&id=${department.id}` : ''}` as Href;

  const askRemove = (department: AdminDepartment) =>
    confirmDestructive(
      'Departman listeden çıkarılsın mı?',
      `${department.name} kullanıcı formlarındaki seçeneklerden kaldırılır. Atanmış kullanıcı veya erişim alanı varsa işlem güvenlik nedeniyle engellenir.`,
      'Listeden Çıkar',
      () =>
        remove.mutate(department.id, {
          onSuccess: () => toast.success('Departman çıkarıldı'),
          onError: (err) => toast.error(`Departman çıkarılamadı: ${err.message}`),
        })
    );

  const header = (
    <View className="gap-3 pb-2">
      {mode === 'module' && list.data ? (
        <StatStrip
          items={[
            { label: 'Departman', value: String(rows.length), icon: 'git-network-outline' },
            { label: 'Hedefli', value: String(rows.filter((d) => targetSet.has(d.id)).length), tone: 'success', icon: 'flag-outline' },
            { label: 'Dönem', value: period, icon: 'calendar-outline' },
          ]}
        />
      ) : null}
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={mode === 'module' ? 'Departman, kod veya açıklama ara...' : 'Departman ara...'}
      />
      {canSetTargets ? <PeriodStepper period={period} onChange={setPeriod} /> : null}
      <View className="flex-row items-center justify-between">
        <Text className="font-inter text-[12px] text-muted-foreground">
          {mode === 'module' ? `${visible.length} / ${rows.length} departman gösteriliyor` : `${rows.length} departman`}
        </Text>
        {canCreate ? (
          <ActionPill icon="add" tone="info" label="Departman ekle" onPress={() => router.push(editHref())} />
        ) : null}
      </View>
    </View>
  );

  if (list.isPending) return <ListSkeleton />;
  if (list.error) return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />;

  return (
    <FlashList
      maintainVisibleContentPosition={{ disabled: true }}
      style={{ flex: 1 }}
      data={visible}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 8, paddingBottom: GLASS_TAB_BAR_HEIGHT + 32 }}
      ListHeaderComponent={header}
      renderItem={({ item }) => {
        const targetExists = targetSet.has(item.id);
        return (
          <Card className="my-1.5 gap-2 p-3.5">
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={2}>{item.name}</Text>
                <Text className="font-inter-medium text-[11px] uppercase tracking-[1px] text-operation-blue">{item.code || 'KOD YOK'}</Text>
              </View>
              {mode === 'module' ? <Chip tone={targetExists ? 'success' : 'neutral'} label={targetExists ? 'Hedefli' : 'Taslak'} /> : null}
            </View>
            <Text className="font-inter text-[12px] leading-[18px] text-muted-foreground" numberOfLines={3}>
              {item.description || 'Bu departman için henüz açıklama eklenmemiş.'}
            </Text>
            <View className="flex-row flex-wrap items-center gap-2 border-t border-border pt-2.5">
              {canSetTargets ? (
                <>
                  <Text className="flex-1 font-inter text-[11px] text-muted-foreground">Dönem · {formatPeriodLabel(period)}</Text>
                  <ActionPill
                    icon="flag-outline"
                    tone={targetExists ? 'neutral' : 'info'}
                    label={targetExists ? 'Hedefi Düzenle' : 'Hedef Ekle'}
                    onPress={() => router.push(`/modal/department-target?id=${item.id}&period=${period}` as Href)}
                  />
                </>
              ) : null}
              {canUpdate ? <ActionPill icon="create-outline" label="Düzenle" onPress={() => router.push(editHref(item))} /> : null}
              {canDelete ? (
                <ActionPill icon="trash-outline" tone="destructive" label="Listeden Çıkar" disabled={remove.isPending} onPress={() => askRemove(item)} />
              ) : null}
            </View>
          </Card>
        );
      }}
      refreshing={list.isRefetching}
      onRefresh={() => {
        void list.refetch();
        if (canSetTargets) void targets.refetch();
      }}
      ListEmptyComponent={
        <EmptyState
          icon="git-network-outline"
          title={rows.length ? 'Aramayla eşleşen departman yok' : 'Henüz departman yok'}
          hint={rows.length ? 'Farklı bir ad, kod veya açıklama deneyin.' : 'Organizasyon yapısını oluşturmak için ilk departmanı ekleyin.'}
        />
      }
    />
  );
}
