import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useAdminPermissions, useAdminRoles } from '@/src/api/admin.hooks';
import { EmptyState, ErrorState, ListRow, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useAdminAccess } from '@/src/ui/admin/access';
import { filterByText, sortRoles } from '@/src/ui/admin/admin-model';

export default function RolesScreen() {
  const router = useRouter();
  const access = useAdminAccess();
  const canManageRoles = access.isSuperAdmin;
  const [query, setQuery] = useState('');
  const roles = useAdminRoles();
  const permissions = useAdminPermissions();

  const sorted = useMemo(() => sortRoles(roles.data ?? []), [roles.data]);
  const visible = useMemo(() => filterByText(sorted, query, (role) => [role.name, role.code]), [sorted, query]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Roller & Yetkiler"
        subtitle={`${sorted.length} rol · ${permissions.data?.length ?? 0} yetki`}
        actions={canManageRoles ? [{ icon: 'add', label: 'Yeni rol oluştur', onPress: () => router.push('/modal/role-create' as Href) }] : []}
      />
      {roles.data ? (
        <View className="pt-2">
          <StatStrip
            items={[
              { label: 'Rol', value: String(sorted.length), icon: 'shield-outline' },
              { label: 'Sistem', value: String(sorted.filter((r) => r.isSystemRole).length), tone: 'neutral' },
              { label: 'Özel', value: String(sorted.filter((r) => !r.isSystemRole).length), tone: 'info' },
            ]}
          />
        </View>
      ) : null}
      <View className="py-2">
        <SearchBar value={query} onChange={setQuery} placeholder="Rol adı veya kodu ara..." />
      </View>

      {roles.isPending ? (
        <ListSkeleton />
      ) : roles.error ? (
        <ErrorState message={roles.error.message} onRetry={() => void roles.refetch()} />
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              lines={[item.code, item.description]}
              icon="shield-checkmark-outline"
              iconTone={item.isSystemRole ? 'neutral' : 'info'}
              chips={[
                { label: item.isSystemRole ? 'Sistem' : 'Özel', tone: item.isSystemRole ? 'neutral' : 'info' },
                { label: `${item.permissions.length} yetki`, tone: 'neutral' },
              ]}
              onPress={() => router.push(`/(tabs)/modules/roles/${item.id}` as Href)}
            />
          )}
          refreshing={roles.isRefetching}
          onRefresh={() => {
            void roles.refetch();
            void permissions.refetch();
          }}
          ListEmptyComponent={
            <EmptyState
              icon="shield-outline"
              title={query ? 'Eşleşen rol yok' : 'Henüz rol yok'}
              actionLabel={canManageRoles && !query ? 'Yeni rol oluştur' : undefined}
              onAction={canManageRoles && !query ? () => router.push('/modal/role-create' as Href) : undefined}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
