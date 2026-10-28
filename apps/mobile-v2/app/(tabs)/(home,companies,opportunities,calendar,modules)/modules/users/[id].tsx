import { useHierarchyBack } from '@/src/modules/useHierarchyBack';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useAdminUsers, useDeleteUser, useUnlockUser, useUpdateUser, useUserTargets } from '@/src/api/admin.hooks';
import { formatDateTime } from '@/src/lib/format';
import { Card, Chip, DetailHeader, DetailSkeleton, EmptyState, ErrorState } from '@/src/ui';
import { InfoRows } from '@/src/ui/data';
import { Avatar } from '@/src/ui/Avatar';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { isUserActive, isUserLocked, resourceLabel } from '@/src/ui/admin/admin-model';
import { ActionPill, Notice, SwitchRow, confirmAction, confirmDestructive } from '@/src/ui/admin/controls';
import {
  TARGET_TYPE_META,
  TARGET_TYPE_ORDER,
  currentPeriod,
  formatPeriodLabel,
  formatTargetNumber,
  hasTargetValue,
  targetFilledCount,
  targetFromApi,
  targetTotalCount,
} from '@/src/ui/admin/target-model';

export default function UserDetailScreen() {
  const { goBack } = useHierarchyBack();
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; period?: string }>();
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : currentPeriod();
  const access = useAdminAccess();
  const canEditUser = access.isSuperAdmin;
  const canUpdateUser = access.has('users.update');
  const canAssignRoles = access.isSuperAdmin || canUpdateUser;
  const canSetTargets = access.isAdmin;
  const canDeleteUser = access.has('users.delete');

  const list = useAdminUsers();
  const targets = useUserTargets(period, canSetTargets);
  const update = useUpdateUser();
  const unlock = useUnlockUser();
  const remove = useDeleteUser();

  const user = list.data?.find((row) => row.id === params.id);
  const manager = user?.managerId ? list.data?.find((row) => row.id === user.managerId) : null;
  const target = useMemo(() => {
    const row = targets.data?.find((item) => item.userId === params.id);
    return row ? targetFromApi(row, period) : undefined;
  }, [targets.data, params.id, period]);

  if (list.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Kullanıcı" />
        <DetailSkeleton />
      </SafeAreaView>
    );
  }
  if (list.error) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Kullanıcı" />
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      </SafeAreaView>
    );
  }
  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Kullanıcı" />
        <EmptyState icon="person-remove-outline" title="Kullanıcı bulunamadı" actionLabel="Listeye dön" onAction={() => goBack()} />
      </SafeAreaView>
    );
  }

  const locked = isUserLocked(user);
  const active = isUserActive(user);
  const isSelf = access.user?.id === user.id;
  const limit = Number(user.purchaseApprovalLimit ?? 0);
  const go = (path: string) => router.push(`${path}?id=${user.id}&period=${period}` as Href);

  const setActive = (checked: boolean) =>
    update.mutate(
      { id: user.id, body: { status: checked ? 'active' : 'passive' } },
      {
        onSuccess: () => toast.success('Kullanıcı güncellendi'),
        onError: (err) => toast.error(`Kullanıcı güncellenemedi: ${err.message}`),
      }
    );

  const doUnlock = () =>
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

  const doDelete = () =>
    confirmDestructive(
      'Kullanıcıyı sil?',
      `${user.fullName} kullanıcı listesinden kaldırılacak, giriş yapamayacak ve aktif oturumları kapatılacak. Geçmiş kayıtlar korunur.`,
      'Sil',
      () =>
        remove.mutate(user.id, {
          onSuccess: () => {
            toast.success('Kullanıcı silindi');
            goBack();
          },
          onError: (err) => toast.error(`Kullanıcı silinemedi: ${err.message}`),
        })
    );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title={user.fullName}
        subtitle={user.username ? `@${user.username}` : user.email}
        actions={canEditUser ? [{ icon: 'create-outline', label: 'Düzenle', onPress: () => go('/modal/user-edit') }] : []}
      />
      <ScrollView
      contentContainerStyle={{ paddingBottom: GLASS_TAB_BAR_HEIGHT + 32 }}
        contentContainerClassName="gap-4 p-4 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => {
              void list.refetch();
              if (canSetTargets) void targets.refetch();
            }}
          />
        }
      >
        <Card className="gap-3">
          <View className="flex-row items-center gap-3">
            <Avatar name={user.fullName} size={52} />
            <View className="flex-1 gap-0.5">
              <Text className="font-display text-[22px] text-foreground" numberOfLines={2}>{user.fullName}</Text>
              <Text className="font-inter text-[13px] text-muted-foreground" selectable>{user.email}</Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {locked ? <Chip tone="warning" label="Kilitli" /> : <Chip tone={active ? 'success' : 'neutral'} label={active ? 'Aktif' : 'Pasif'} />}
            {user.roles.map((role) => (
              <Chip key={role.code} tone="info" label={role.name} />
            ))}
          </View>
        </Card>

        {locked ? (
          <Notice tone="warning" title="Kilitli hesap müdahalesi gerekiyor">
            {`${user.failedLoginAttempts} hatalı deneme · ${formatDateTime(user.lockedUntil)} tarihine kadar`}
          </Notice>
        ) : null}

        <Card className="gap-1 py-2">
          <InfoRows
            showEmpty
            items={[
              { label: 'Kullanıcı Adı', value: user.username ? `@${user.username}` : null },
              { label: 'Telefon', value: user.phone },
              { label: 'Departman', value: user.department?.name ?? 'Atanmadı' },
              { label: 'Ünvan', value: user.title?.name },
              { label: 'Bölüm', value: user.divisions.map((d) => (d.isPrimary ? `${d.name} (Birincil)` : d.name)).join(', ') },
              { label: 'Limitler', value: limit > 0 ? `Onay: $${formatTargetNumber(limit)}` : 'Limitsiz' },
              { label: 'Yönetici', value: manager?.fullName },
              { label: 'Son giriş', value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : null },
            ]}
          />
        </Card>

        {user.accessScopes.length ? (
          <Card className="gap-2">
            <Text className="font-inter-semibold text-[15px] text-foreground">Yetki Alanları</Text>
            {user.accessScopes.map((scope, index) => (
              <Text key={`${scope.resource}-${index}`} className="font-inter text-[13px] text-muted-foreground">
                {resourceLabel(scope.resource)}
                {scope.isPrimary ? ' · Birincil' : ''}
              </Text>
            ))}
          </Card>
        ) : null}

        {canSetTargets ? (
          <Card className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="font-inter-semibold text-[15px] text-foreground">Hedef · {formatPeriodLabel(period)}</Text>
            </View>
            {targets.isPending ? (
              <Text className="font-inter text-[13px] text-muted-foreground">Hedefler yükleniyor…</Text>
            ) : targets.error ? (
              <ErrorState message={targets.error.message} onRetry={() => void targets.refetch()} />
            ) : target && hasTargetValue(target) ? (
              <View className="flex-row flex-wrap gap-1.5">
                {TARGET_TYPE_ORDER.map((type) => ({ type, filled: targetFilledCount(target, type) }))
                  .filter((row) => row.filled > 0)
                  .map((row) => (
                    <Chip key={row.type} tone="info" label={`${TARGET_TYPE_META[row.type].label} ${row.filled}/${targetTotalCount(row.type)}`} />
                  ))}
              </View>
            ) : (
              <Text className="font-inter text-[13px] text-muted-foreground">Bu dönem için hedef girilmemiş.</Text>
            )}
          </Card>
        ) : null}

        {canUpdateUser ? (
          <Card className="py-1">
            <SwitchRow
              title="Aktif hesap"
              subtitle="Pasif kullanıcılar giriş yapamaz"
              value={active}
              disabled={update.isPending}
              onValueChange={setActive}
            />
          </Card>
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          {canEditUser ? <ActionPill icon="create-outline" label="Düzenle" onPress={() => go('/modal/user-edit')} /> : null}
          {canUpdateUser ? <ActionPill icon="business-outline" label="Departman" onPress={() => go('/modal/user-department')} /> : null}
          {canAssignRoles ? <ActionPill icon="shield-checkmark-outline" label="Rol Ata" onPress={() => go('/modal/user-roles')} /> : null}
          {canSetTargets ? <ActionPill icon="trending-up-outline" label="Hedef" onPress={() => go('/modal/user-target')} /> : null}
          {canSetTargets ? <ActionPill icon="settings-outline" label="Limit" onPress={() => go('/modal/user-limit')} /> : null}
          {canUpdateUser && locked ? <ActionPill icon="lock-open-outline" tone="warning" label="Kilidi Aç" onPress={doUnlock} /> : null}
          {canDeleteUser ? (
            <ActionPill
              icon="trash-outline"
              tone="destructive"
              label={isSelf ? 'Kendi hesabınızı silemezsiniz' : 'Sil'}
              disabled={isSelf || remove.isPending}
              onPress={doDelete}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
