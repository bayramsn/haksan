import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyList } from '@/src/api/companies.hooks';
import { companies, type CompanyListItem } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { SearchBar } from '@/src/ui';

export type PickedCompany = { id: string; name: string };

/** Form içi firma seçici: alana dokununca aranabilir firma listesi açılır. */
export function CompanyPickerField({
  value,
  onChange,
  label = 'Firma',
  required,
  error,
  disabled,
  allowCreate,
}: {
  value: PickedCompany | null;
  onChange: (company: PickedCompany) => void;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  /** Web'deki RemoteCompanyCombobox gibi: aranan ad yoksa o adla firma açılabilir. */
  allowCreate?: boolean;
}) {
  const canCreateCompany = useCan('companies.create');
  const [creating, setCreating] = useState(false);
  const { colors } = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const [search, setSearch] = useState('');
  const list = useCompanyList(
    useMemo(() => ({ search: search.trim() || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }), [search])
  );

  function choose(company: CompanyListItem) {
    onChange({ id: company.id, name: company.shortName ?? company.legalTitle });
    sheet.current?.dismiss();
  }

  async function createCompany(name: string) {
    setCreating(true);
    try {
      const created = await companies.create({ companyType: 'company', legalTitle: name } as Parameters<typeof companies.create>[0]);
      choose(created);
    } catch (cause) {
      Alert.alert('Firma oluşturulamadı', cause instanceof Error ? cause.message : 'İstek başarısız oldu.');
    } finally {
      setCreating(false);
    }
  }
  const typed = search.trim();
  const showCreate = Boolean(allowCreate && canCreateCompany && typed.length >= 2);

  return (
    <View className="gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${required ? ' (zorunlu)' : ''}: ${value?.name ?? 'seçilmedi'}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => sheet.current?.present()}
        className={`min-h-12 flex-row items-center gap-3 rounded-control border bg-card px-3 py-2 ${error ? 'border-destructive' : 'border-border'} ${disabled ? 'opacity-60' : 'active:opacity-70'}`}
      >
        <Ionicons name="business-outline" size={19} color={colors.primary} />
        <View className="flex-1 gap-0.5">
          <Text className="font-inter-medium text-xs text-muted-foreground">{label}{required ? ' *' : ''}</Text>
          <Text className="font-inter text-base text-foreground" numberOfLines={1}>{value?.name ?? 'Firma seçin'}</Text>
        </View>
        {disabled ? null : <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
      </Pressable>
      {error ? <Text className="font-inter text-xs text-destructive">{error}</Text> : null}

      <BottomSheetModal
        ref={sheet}
        snapPoints={['80%']}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-4 pb-2">
          <Text className="font-inter-semibold text-base text-foreground">Firma seçin</Text>
          <SearchBar value={search} onChange={setSearch} placeholder="Firma ara" />
        </BottomSheetView>
        <BottomSheetFlatList
          data={list.data?.items ?? []}
          keyExtractor={(item: CompanyListItem) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }}
          ListHeaderComponent={showCreate ? (
            <Pressable
              accessibilityRole="button"
              disabled={creating}
              onPress={() => void createCompany(typed)}
              className="min-h-12 flex-row items-center gap-2 border-b border-border py-2 active:opacity-70"
            >
              <Ionicons name="add-circle-outline" size={19} color={colors.primary} />
              <Text className="flex-1 font-inter-medium text-sm text-primary" numberOfLines={2}>{creating ? 'Firma oluşturuluyor…' : `"${typed}" adıyla yeni firma oluştur`}</Text>
            </Pressable>
          ) : null}
          renderItem={({ item }: { item: CompanyListItem }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => choose(item)}
              className="min-h-12 justify-center border-b border-border py-2 active:opacity-70"
            >
              <Text className="font-inter-medium text-sm text-foreground" numberOfLines={1}>{item.shortName ?? item.legalTitle}</Text>
              {item.primaryAddress?.province ? (
                <Text className="font-inter text-xs text-muted-foreground">
                  {[item.primaryAddress.district, item.primaryAddress.province].filter(Boolean).join(', ')}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      </BottomSheetModal>
    </View>
  );
}
