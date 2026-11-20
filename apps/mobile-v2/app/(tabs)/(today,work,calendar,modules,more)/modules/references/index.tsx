import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { request } from '@/src/api/client';
import { formatDate } from '@/src/lib/format';
import { EmptyState, ErrorState, ListRow, Loading, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';

type CompanyReference = {
  id: string;
  firm: string;
  contact: string | null;
  district: string | null;
  city: string | null;
  brand: string | null;
  model: string | null;
  deliveryDate: string | null;
  notes: string | null;
};

/** Teslim edilmiş makine referansları; sahada müşteriye gösterilmek için salt okunur. Ekleme/aktarım webde. */
export default function ReferencesScreen() {
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['references'], queryFn: () => request<CompanyReference[]>('/references'), staleTime: 60_000 });

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr');
    const all = query.data ?? [];
    if (!needle) return all;
    return all.filter((row) =>
      [row.firm, row.contact, row.city, row.district, row.brand, row.model].some((value) => value?.toLocaleLowerCase('tr').includes(needle))
    );
  }, [query.data, search]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <ScreenHeader title="Referanslar" count={query.data?.length} />
      <SearchBar value={search} onChange={setSearch} placeholder="Firma, şehir, marka veya model ara" />
      {query.isPending ? <Loading /> : query.error ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 8, paddingHorizontal: SCREEN_PAD, paddingBottom: 40 }}
          ListEmptyComponent={<EmptyState title={search ? 'Aramayla eşleşen referans yok' : 'Referans yok'} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.firm}
              lines={[
                [item.brand, item.model].filter(Boolean).join(' ') || null,
                [item.district, item.city].filter(Boolean).join(', ') || null,
                [item.contact, item.deliveryDate ? `Teslim ${formatDate(item.deliveryDate)}` : null].filter(Boolean).join(' · ') || null,
              ]}
              icon="ribbon-outline"
              iconTone="success"
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
