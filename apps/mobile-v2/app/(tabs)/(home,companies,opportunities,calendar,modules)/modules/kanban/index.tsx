import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import type { SalesListQuery } from '@/src/api/sales.api';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { Button, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { QualificationBoard } from '@/src/ui/sales/QualificationBoard';

/** Web SalesCases (initialView="kanban") + QualificationKanban karşılığı. */
export default function KanbanScreen() {
  const router = useRouter();
  const canCreate = useCan('opportunities.create');
  const [search, setSearch] = useState('');
  const serverSearch = useDebouncedValue(search.trim());
  const query = useMemo<SalesListQuery>(() => ({ view: 'active', search: serverSearch || undefined }), [serverSearch]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Fırsat Kanbanı" subtitle="Satış akışını aşama aşama takip edin." />
      <View className="flex-row gap-3 px-4 pb-3">
        <View className="flex-1"><Button label="Liste görünümü" variant="ghost"
          onPress={() => router.push({ pathname: '/modules/opportunities', params: { view: 'list', search } } as unknown as Href)} /></View>
        {canCreate ? <View className="flex-1"><Button label="Yeni kart" onPress={() => router.push('/modal/create-case' as Href)} /></View> : null}
      </View>
      <View className="pb-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Firma, kontak veya ürün ara…" />
        {search ? <Pressable accessibilityRole="button" onPress={() => setSearch('')} className="min-h-11 justify-center self-end px-4">
          <Text className="font-inter-medium text-[13px] text-primary">Aramayı temizle</Text>
        </Pressable> : null}
      </View>
      <QualificationBoard query={query} onOpen={(id) => router.push(`/modules/opportunities/${id}`)}
        onStageList={(stage) => router.push({ pathname: '/modules/opportunities', params: { view: 'list', qualification: stage, search } } as unknown as Href)} />
    </SafeAreaView>
  );
}
