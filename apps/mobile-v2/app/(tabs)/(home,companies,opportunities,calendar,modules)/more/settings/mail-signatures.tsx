import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useMailSignatureUsers } from '@/src/api/settings.hooks';
import { EmptyState, ErrorState, ListRow, ListSkeleton, SCREEN_PAD, SearchBar } from '@/src/ui';
import { useAdminAccess } from '@/src/ui/admin/access';
import { filterByText } from '@/src/ui/admin/admin-model';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';

export default function AdminMailSignaturesScreen() {
  const router = useRouter();
  const access = useAdminAccess();
  const users = useMailSignatureUsers(access.isSuperAdmin);
  const [query, setQuery] = useState('');
  const rows = useMemo(() => filterByText(users.data ?? [], query, (u) => [u.name, u.email]), [users.data, query]);

  return (
    <SettingsSubpage title="Kullanıcıların mail imzaları" allowed={access.isSuperAdmin} scroll={false}>
      <FlashList
        maintainVisibleContentPosition={{ disabled: true }}
        style={{ flex: 1 }}
        data={users.isPending || users.error ? [] : rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 12, paddingBottom: 32 }}
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            <Help>Süper admin olarak kullanıcılar için görsel imza yükleyebilir veya mevcut imzalarını kaldırabilirsiniz.</Help>
            <SearchBar value={query} onChange={setQuery} placeholder="Kullanıcı seçin" />
          </View>
        }
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            lines={[item.email]}
            icon="person-outline"
            chip={item.hasMailAccount ? { tone: 'success', label: 'Webmail bağlı' } : { tone: 'neutral', label: 'Webmail yok' }}
            onPress={() => router.push(`/modal/mail-user-signature?id=${item.id}` as Href)}
          />
        )}
        refreshing={users.isRefetching}
        onRefresh={() => void users.refetch()}
        ListEmptyComponent={
          users.isPending ? (
            <ListSkeleton />
          ) : users.error ? (
            <ErrorState message={`Kullanıcılar alınamadı: ${users.error.message}`} onRetry={() => void users.refetch()} />
          ) : (
            <EmptyState icon="people-outline" title="İmza atanabilecek kullanıcı bulunamadı." />
          )
        }
      />
    </SettingsSubpage>
  );
}
