import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useLookupRows, useSpecTemplates } from '@/src/api/admin.hooks';
import { useTheme } from '@/src/theme/theme';
import { Card, Chip, EmptyState, ErrorState, ListSkeleton, SCREEN_PAD, SearchBar } from '@/src/ui';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, ChipSelect } from '@/src/ui/admin/controls';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';
import { specTemplateStats } from '@/src/ui/admin/spec-template-model';
import { useSettingsDivision } from '@/src/ui/admin/useSettingsDivision';

export default function SpecTemplateLibraryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const access = useAdminAccess();
  const allowed = access.isSuperAdmin;
  const { divisionId, setDivisionId, options } = useSettingsDivision();
  const scope = divisionId ? { divisionId } : undefined;
  const types = useLookupRows('product-types', scope, allowed);
  const subcategories = useLookupRows('product-subcategories', scope, allowed);
  const specs = useSpecTemplates(scope ?? {}, allowed);
  const [search, setSearch] = useState('');

  const subcategoryNames = useMemo(
    () => new Map((subcategories.data ?? []).map((row) => [row.id, row.name])),
    [subcategories.data]
  );
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    return (types.data ?? [])
      .filter((type) => type.isActive !== false)
      .map((type) => ({
        type,
        subcategory: type.subcategoryId ? subcategoryNames.get(type.subcategoryId) ?? null : null,
        stats: specTemplateStats(type.code, specs.data ?? []),
      }))
      .filter(({ type, subcategory }) =>
        !query || [type.name, type.code, subcategory ?? ''].join(' ').toLocaleLowerCase('tr-TR').includes(query)
      )
      .sort((a, b) => (a.subcategory ?? '').localeCompare(b.subcategory ?? '', 'tr-TR') || a.type.name.localeCompare(b.type.name, 'tr-TR'));
  }, [search, specs.data, subcategoryNames, types.data]);

  const error = types.error ?? specs.error;
  const loading = types.isPending || specs.isPending;
  const refetch = () => {
    void types.refetch();
    void subcategories.refetch();
    void specs.refetch();
  };
  const withDivision = (path: string) => `${path}${path.includes('?') ? '&' : '?'}divisionId=${divisionId ?? ''}` as Href;

  return (
    <SettingsSubpage
      title="Teknik Bilgi Merkezi"
      subtitle="Şablon kütüphanesi ve ürün çalışma sayfaları"
      allowed={allowed}
      scroll={false}
      actions={[{ icon: 'add', label: 'Yeni ürün şablonu', onPress: () => router.push(withDivision('/modal/spec-template-new')) }]}
    >
      <FlashList
        maintainVisibleContentPosition={{ disabled: true }}
        style={{ flex: 1 }}
        data={loading || error ? [] : rows}
        keyExtractor={(item) => item.type.id}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 12, paddingBottom: 32 }}
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            {options.length ? (
              <ChipSelect
                label="Bölüm"
                options={options.map((d) => ({ value: d.id, label: d.name }))}
                value={divisionId}
                onChange={setDivisionId}
              />
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              <ActionPill icon="add-circle-outline" label="Yeni ürün şablonu" onPress={() => router.push(withDivision('/modal/spec-template-new'))} />
              <ActionPill icon="cloud-upload-outline" label="Excel / CSV ile aktar" onPress={() => router.push(withDivision('/modal/spec-template-import'))} />
              <ActionPill icon="flash-outline" label="Lazer profilleri" onPress={() => router.push('/(tabs)/more/settings/laser-profiles' as Href)} />
            </View>
            <Text className="font-inter-semibold text-[13px] text-foreground">Ürün şablonları</Text>
            <Help>Teknik alan kapsamını kontrol edin veya çalışma sayfasını açın.</Help>
            <SearchBar value={search} onChange={setSearch} placeholder="Ürün tipi veya şablon ara" />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push(withDivision(`/(tabs)/more/settings/spec-templates/${encodeURIComponent(item.type.code)}?name=${encodeURIComponent(item.type.name)}`))
            }
            accessibilityRole="button"
            accessibilityLabel={`${item.type.name} çalışma sayfasını aç`}
            className="my-1.5 active:opacity-70"
          >
            <Card className="flex-row items-center gap-3 p-3.5">
              <View className="min-h-[44px] flex-1 justify-center gap-1">
                <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
                  {item.type.name}
                </Text>
                <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
                  {[item.subcategory, item.type.code].filter(Boolean).join(' · ')}
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  <Chip tone="neutral" label={`${item.stats.active} teknik alan`} />
                  <Chip tone="neutral" label={`${item.stats.groups} bölüm`} />
                  {item.stats.total === 0 ? <Chip tone="warning" label="Şablon yok" /> : <Chip tone="success" label="Şablon hazır" />}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Card>
          </Pressable>
        )}
        refreshing={types.isRefetching || specs.isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState message={`Teknik şablonlar yüklenemedi: ${error.message}`} onRetry={refetch} />
          ) : (
            <EmptyState
              icon="search-outline"
              title="Bu filtrede şablon bulunamadı"
              actionLabel={search ? 'Aramayı temizle' : undefined}
              onAction={search ? () => setSearch('') : undefined}
            />
          )
        }
      />
    </SettingsSubpage>
  );
}
