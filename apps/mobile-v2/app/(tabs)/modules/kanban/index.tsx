import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import type { SalesListQuery } from '@/src/api/sales.api';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { Fab, ScreenHeader, SearchBar } from '@/src/ui';
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
      <ScreenHeader
        title="Fırsat Kanbanı"
        subtitle="Satış dereceleri arasında kart menüsünden taşıyın"
        actions={[{ icon: 'list-outline', label: 'Liste görünümü', onPress: () => router.push('/(tabs)/modules/opportunities' as Href) }]}
      />
      <View className="py-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Firma / kontak / ürün ara..." />
      </View>
      <QualificationBoard query={query} onOpen={(id) => router.push(`/(tabs)/modules/opportunities/${id}`)} />
      {canCreate ? <Fab label="Yeni Kart" onPress={() => router.push('/modal/create-case' as Href)} /> : null}
    </SafeAreaView>
  );
}
