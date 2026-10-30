import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useAdminUsers, useUnlockUser, useUserTargets } from '@/src/api/admin.hooks';
import type { AdminUser } from '@/src/api/admin.api';
import { formatDateTime } from '@/src/lib/format';
import { EmptyState, ErrorState, FilterChips, ListRow, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { filterUsers, isUserActive, isUserLocked, userKpis, type UserStatusFilter } from '@/src/ui/admin/admin-model';
import { ActionPill, Notice, PeriodStepper, confirmAction } from '@/src/ui/admin/controls';
import {
  TARGET_TYPE_META,
  TARGET_TYPE_ORDER,
  currentPeriod,
  hasTargetValue,
  targetFilledCount,
  targetFromApi,
  targetTotalCount,
} from '@/src/ui/admin/target-model';

export default function UsersScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const access = useAdminAccess();
  const canCreate = access.has('users.create');
  const canUpdate = access.has('users.update');
  const canSetTargets = access.isAdmin;

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Exclude<UserStatusFilter, 'all'> | null>(null);
  const [period, setPeriod] = useState(currentPeriod());

  const list = useAdminUsers();
  const targets = useUserTargets(period, canSetTargets);
  const unlock = useUnlockUser();

  const users = list.data ?? [];
  const kpis = userKpis(users);
  const locked = users.filter((user) => isUserLocked(user));
  const filtered = useMemo(() => filterUsers(users, query, status ?? 'all'), [users, query, status]);
  const targetsByUser = useMemo(() => {
    const map = new Map<string, ReturnType<typeof targetFromApi>>();
    (targets.data ?? []).forEach((row) => row.userId && map.set(row.userId, targetFromApi(row, period)));
    return map;
  }, [targets.data, period]);

  const confirmUnlock = (user: AdminUser) =>
    confirmAction(
      'Hesap kilidini aç?',
      `${user.fullName} için geçici giriş kilidi kaldırılacak ve hatalı giriş sayacı sıfırlanacak. Kullanıcı pasifse pasif kalır; şifre değişmez.`,
      'Kilidi Aç',
      () =>
        unlock.mutate(user.id, {
          onSuccess: () => toast.success('Hesap kilidi kaldırıldı'),
          onError: (err) => toast.error(`Hesap kilidi kaldırılamadı: ${err.message}`),
        })
    );

  const header = (
    <View className="gap-3 pb-2">
      {canSetTargets ? <PeriodStepper period={period} onChange={setPeriod} /> : null}
      {canUpdate ? (
        <Notice
          tone={locked.length ? 'warning' : 'success'}
          title={locked.length ? `Kilitli hesap müdahalesi gerekiyor (${locked.length})` : 'Hesap güvenliği normal'}
        >
          {locked.length ? (
            <View className="mt-1 gap-2">
              {locked.map((user) => (
                <View key={user.id} className="gap-1.5 rounded-control border border-border bg-card p-2.5">
                  <Text className="font-inter-semibold text-[14px] text-foreground">{user.fullName}</Text>
                  <Text className="font-inter text-[12px] text-muted-foreground">{user.email}</Text>
                  <Text className="font-inter text-[12px] text-muted-foreground">
                    {user.failedLoginAttempts} hatalı deneme · {formatDateTime(user.lockedUntil)} tarihine kadar
                  </Text>
                  <View className="flex-row">
                    <ActionPill icon="lock-open-outline" tone="warning" label="Kilidi Aç" onPress={() => confirmUnlock(user)} />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </Notice>
      ) : null}
      <Text className="font-inter text-[12px] text-muted-foreground">
        {filtered.length} / {users.length} kullanıcı gösteriliyor
      </Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Kullanıcılar"
        subtitle="Kullanıcılar, ekipler, roller ve hesap güvenliği."
        actions={canCreate ? [{ icon: 'add', label: 'Kullanıcı Ekle', onPress: () => router.push('/modal/user-create' as Href) }] : []}
      />

      {list.data ? (
        <View className="pt-2">
          <StatStrip
            items={[
              { label: 'Toplam', value: String(kpis.total), icon: 'people-outline' },
              { label: 'Aktif', value: String(kpis.active), tone: 'success', icon: 'person-outline' },
              { label: 'Kilitli', value: String(kpis.locked), tone: kpis.locked ? 'warning' : 'success', icon: 'lock-closed-outline' },
            ]}
          />
        </View>
      ) : null}

      <View className="gap-2 py-2">
        <SearchBar value={query} onChange={setQuery} placeholder="Ad, e-posta, rol veya ekip ara..." />
        <FilterChips
          options={[
            { value: 'active' as const, label: 'Aktif' },
            { value: 'passive' as const, label: 'Pasif' },
            { value: 'locked' as const, label: 'Kilitli' },
          ]}
          value={status}
          onChange={setStatus}
          allLabel="Tüm durumlar"
        />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 32 }}
          ListHeaderComponent={header}
          renderItem={({ item }) => {
            const lockedRow = isUserLocked(item);
            const active = isUserActive(item);
            const target = targetsByUser.get(item.id);
            const targetChips =
              target && hasTargetValue(target)
                ? TARGET_TYPE_ORDER.map((type) => ({ type, filled: targetFilledCount(target, type) }))
                    .filter((row) => row.filled > 0)
                    .slice(0, 3)
                    .map((row) => ({
                      label: `${TARGET_TYPE_META[row.type].label} ${row.filled}/${targetTotalCount(row.type)}`,
                      tone: 'info' as const,
                    }))
                : [];
            return (
              <ListRow
                title={item.fullName}
                lines={[
                  item.username ? `${item.email} · @${item.username}` : item.email,
                  [item.department?.name ?? 'Departman atanmadı', item.divisions.map((d) => d.name).join(', ')].filter(Boolean).join(' · '),
                  item.roles.map((role) => role.name).join(', ') || null,
                ]}
                icon={lockedRow ? 'lock-closed-outline' : 'person-circle-outline'}
                iconTone={lockedRow ? 'warning' : active ? 'success' : 'neutral'}
                chips={[
                  lockedRow
                    ? { label: 'Kilitli', tone: 'warning' as const }
                    : { label: active ? 'Aktif' : 'Pasif', tone: active ? ('success' as const) : ('neutral' as const) },
                  ...targetChips,
                ]}
                onPress={() => router.push(`/modules/users/${item.id}?period=${period}` as Href)}
              />
            );
          }}
          refreshing={list.isRefetching}
          onRefresh={() => {
            void list.refetch();
            if (canSetTargets) void targets.refetch();
          }}
          ListEmptyComponent={
            <EmptyState
              icon="person-remove-outline"
              title="Eşleşen kullanıcı yok"
              hint="Arama metnini veya durum filtresini değiştirin."
              actionLabel={query || status ? 'Filtreleri temizle' : undefined}
              onAction={query || status ? () => { setQuery(''); setStatus(null); } : undefined}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
