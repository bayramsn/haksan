import { useOperationsLayout } from '@/src/ui/finance/useOperationsLayout';
import { useNavigationContext } from '@/src/modules/useNavigationContext';
import { productPriceLabel } from '@/src/ui/products/product-price';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { useAllProducts } from '@/src/api/products.hooks';
import type { CatalogProduct } from '@/src/api/products.api';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, Fab, FilterChips, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { KpiGrid, KpiTile } from '@/src/ui/finance/kit';
import { ProductThumb } from '@/src/ui/products/ProductThumb';
import {
  EMPTY_TAXONOMY,
  catalogView,
  changeTaxonomy,
  taxonomyOptions,
  visibleCatalog,
  type Taxonomy,
} from '@/src/ui/products/catalog-logic';

const TAXONOMY_FIELDS: { key: keyof Taxonomy; label: string }[] = [
  { key: 'group', label: 'Ürün Grubu' },
  { key: 'category', label: 'Ürün Kategorisi' },
  { key: 'subcategory', label: 'Ürün Alt Kategorisi' },
  { key: 'type', label: 'Ürün Tipi' },
];

function ProductCard({ product, onPress }: { product: CatalogProduct; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.fullName}, ${product.modelCode}`}
      onPress={onPress}
      className="gap-3 border-b border-border py-3 active:opacity-70"
    >
      <View className="flex-row items-center gap-3">
      <ProductThumb imageUrl={product.imageUrl} label={product.fullName} size={56} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={2}>
          {product.fullName}
        </Text>
        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
          {[product.brand?.name, product.modelCode].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </View>
      <Text className="font-inter-semibold text-[15px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
        {productPriceLabel(product.listPrice, product.currency?.code)}
      </Text>
    </Pressable>
  );
}

export default function ProductsScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const { listPad } = useOperationsLayout();
  const router = useRouter();
  const { user, scope } = useAuth();
  const roles = user?.roles ?? [];
  const isAdmin = roles.includes('super_admin') || roles.includes('admin');
  const canCreate = isAdmin || (user?.permissions ?? []).includes('products.create');
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('all');
  const [series, setSeries] = useState('all');
  const [taxonomy, setTaxonomy] = useState<Taxonomy>(EMPTY_TAXONOMY);
  const [showFilters, setShowFilters] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  useNavigationContext('products', ({ query }) => { setSearch(query ?? ''); setFamily('all'); setSeries('all'); setTaxonomy(EMPTY_TAXONOMY); });

  const list = useAllProducts();
  const divisionId = scope.divisionId;
  const divisionCode = user?.divisions?.find((division) => division.id === divisionId)?.code ?? null;

  const scoped = useMemo(() => visibleCatalog(list.data ?? [], { roles, divisionCode }), [list.data, roles, divisionCode]);
  const view = useMemo(
    () => catalogView(scoped, { taxonomy, family, series, query: search.trim() }),
    [scoped, taxonomy, family, series, search],
  );
  const taxonomyChoices = useMemo(() => taxonomyOptions(scoped, taxonomy), [scoped, taxonomy]);
  const taxonomyActive = Object.values(taxonomy).some((value) => value !== 'all');

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader
        title="Ürünler"
        actions={[
          { icon: 'mail-outline', label: 'Genel Kataloglar', onPress: () => router.push('/modal/product-catalog-mail' as Href) },
          ...(canCreate
            ? [{ icon: 'cloud-upload-outline' as const, label: 'İçe Aktar', onPress: () => router.push('/modal/product-import' as Href) }]
            : []),
        ]}
        compact/>
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Marka, model, ürün ara..."
        onFilterPress={() => setShowFilters((value) => !value)}
        filterActive={taxonomyActive}
      />
      {showFilters ? (
        <View className="gap-3" style={{ paddingHorizontal: SCREEN_PAD }}>
          {TAXONOMY_FIELDS.map((field) => (
            <OptionPicker
              key={field.key}
              label={field.label}
              value={taxonomy[field.key] === 'all' ? null : taxonomy[field.key]}
              options={taxonomyChoices[field.key].map((value) => ({ value, label: value }))}
              placeholder="Tümü"
              searchable
              onChange={(next) => setTaxonomy((current) => changeTaxonomy(current, field.key, next ?? 'all'))}
            />
          ))}
        </View>
      ) : null}
      <FilterChips
        options={view.families.map((item) => ({ value: item.label, label: item.label, count: item.count }))}
        value={view.family === 'all' ? null : view.family}
        onChange={(next) => {
          setFamily(next ?? 'all');
          setSeries('all');
        }}
      />
      {view.seriesOptions.length > 1 ? (
        <FilterChips
          options={view.seriesOptions.map((item) => ({ value: item.label, label: item.label, count: item.count }))}
          value={series === 'all' ? null : series}
          onChange={(next) => setSeries(next ?? 'all')}
          allLabel="Tüm Seriler"
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: overviewOpen }}
        onPress={() => setOverviewOpen((value) => !value)}
        className="min-h-[44px] flex-row items-center justify-between active:opacity-70"
      >
        <Text className="font-inter text-[13px] text-muted-foreground">Özet</Text>
        <Text className="font-inter-medium text-[13px] text-primary">{overviewOpen ? 'Gizle' : 'Göster'}</Text>
      </Pressable>
      {overviewOpen ? (
        <KpiGrid>
          {[
            <KpiTile
              key="total"
              icon="cube-outline"
              tone="stage"
              label="Toplam Ürün"
              value={String(view.kpis.total)}
              selected={view.family === 'all'}
              onPress={() => setFamily('all')}
            />,
            <KpiTile key="families" icon="albums-outline" tone="info" label="Kategori" value={String(view.kpis.families)} sub="ürün ailesi" />,
            <KpiTile key="series" icon="layers-outline" tone="warning" label="Seri" value={String(view.kpis.series)} sub="model serisi" />,
          ]}
        </KpiGrid>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      {list.isPending ? (
        <>
          <ScreenHeader title="Ürünler" compact/>
          <ListSkeleton />
        </>
      ) : list.error ? (
        <>
          <ScreenHeader title="Ürünler" compact/>
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        </>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={view.rows}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: listPad, paddingBottom: GLASS_TAB_BAR_HEIGHT + 96 }}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: SCREEN_PAD }}>
              <ProductCard product={item} onPress={() => router.push(`/modules/products/${item.id}` as Href)} />
            </View>
          )}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Ürün bulunamadı" hint="Aramayı, aileyi veya taksonomi filtresini değiştirin." />}
        />
      )}
      {canCreate ? <Fab label="Yeni Ürün" extended onPress={() => router.push('/modal/product-new' as Href)} /> : null}
    </SafeAreaView>
  );
}
