import { forwardRef, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyList } from '@/src/api/companies.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';

/** Firma seçici alt sayfası; arama sunucuda yapılır, sonsuz kaydırır. */
export const CompanyPickerSheet = forwardRef<
  BottomSheetModal,
  { selectedId?: string | null; onSelect: (company: CompanyListItem) => void; title?: string }
>(function CompanyPickerSheet({ selectedId, onSelect, title = 'Firma seçin' }, ref) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const companyList = useCompanyList(
    useMemo(() => ({ search: debounced || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }), [debounced])
  );

  const header = (
    <View className="gap-3 bg-card pb-2">
      <Text className="font-display-semibold text-[18px] text-foreground">{title}</Text>
      <SearchBar value={search} onChange={setSearch} placeholder="Firma ara" />
    </View>
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['85%']}
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor: colors.card }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
    >
      <BottomSheetFlatList
        data={companyList.data?.items ?? []}
        keyExtractor={(item: CompanyListItem) => item.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }: { item: CompanyListItem }) => {
          const selected = item.id === selectedId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.shortName ?? item.legalTitle}
              accessibilityState={{ selected }}
              onPress={() => onSelect(item)}
              className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
            >
              <Ionicons name="business-outline" size={19} color={selected ? colors.primary : colors.mutedForeground} />
              <View className="flex-1">
                <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>
                  {item.shortName ?? item.legalTitle}
                </Text>
                {item.shortName ? (
                  <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                    {item.legalTitle}
                  </Text>
                ) : null}
              </View>
              {selected ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
            </Pressable>
          );
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (companyList.hasNextPage && !companyList.isFetchingNextPage) void companyList.fetchNextPage();
        }}
        ListEmptyComponent={
          companyList.isPending ? (
            <Loading />
          ) : companyList.error ? (
            <ErrorState message={companyList.error.message} onRetry={() => void companyList.refetch()} />
          ) : (
            <EmptyState title="Firma bulunamadı" />
          )
        }
        ListFooterComponent={companyList.isFetchingNextPage ? <Loading /> : null}
      />
    </BottomSheetModal>
  );
});
