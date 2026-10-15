import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import { useAllProducts } from '@/src/api/products.hooks';
import { usePriceListItems, usePriceLists } from '@/src/api/inventory.hooks';
import type { CatalogProduct } from '@/src/api/products.api';
import { toneColor, useTheme } from '@/src/theme/theme';
import { Chip, EmptyState, ErrorState, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { KpiGrid, KpiTile, SmallButton } from '@/src/ui/finance/kit';
import { ProductThumb } from '@/src/ui/products/ProductThumb';
import { formatPrice } from '@/src/ui/products/sales-price';
import {
  SERVICE_PRICE_CATEGORIES,
  compatibilityLabel,
  defaultPriceListId,
  effectivePrices,
  matchesProduct,
  overridesFromItems,
  priceCurrency,
  serviceCategoryProducts,
  servicePriceCounts,
  sortPriceLists,
  type ServicePriceTab,
} from '@/src/ui/service/priceList';

/** Web ServicePriceListPage: kategori sekmeli parça, aksesuar, opsiyonel donanım ve işçilik fiyatları. */
export default function ServicePriceListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canRead = useCan('price_lists.read');
  const canUpdate = useCan('price_lists.update');
  const canCreate = useCan('price_lists.create');
  const canEdit = canUpdate || canCreate;
  const [tab, setTab] = useState<ServicePriceTab>('parts');
  const [query, setQuery] = useState('');
  const [listId, setListId] = useState('');

  const products = useAllProducts(canRead);
  const lists = usePriceLists();
  const items = usePriceListItems(listId);

  useEffect(() => {
    if (!listId && lists.data?.length) setListId(defaultPriceListId(lists.data));
  }, [lists.data, listId]);

  const allProducts = products.data ?? [];
  const counts = useMemo(() => servicePriceCounts(allProducts), [allProducts]);
  const categoryRows = useMemo(() => serviceCategoryProducts(allProducts, tab), [allProducts, tab]);
  const rows = useMemo(() => categoryRows.filter((product) => matchesProduct(product, query)), [categoryRows, query]);
  const overrides = useMemo(() => overridesFromItems(items.data ?? []), [items.data]);
  const sortedLists = useMemo(() => sortPriceLists(lists.data ?? []), [lists.data]);
  const selectedList = lists.data?.find((list) => list.id === listId);
  const listCurrency = selectedList?.currency?.code;
  const activeCategory = SERVICE_PRICE_CATEGORIES.find((category) => category.value === tab) ?? SERVICE_PRICE_CATEGORIES[0]!;
  const isLabor = tab === 'labor';
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  if (!canRead) return <Redirect href={'/(tabs)/modules' as Href} />;

  function editPrice(product: CatalogProduct) {
    if (!listId) return;
    router.push({
      pathname: '/modal/service-price-edit',
      params: { listId, productId: product.id, labor: isLabor ? '1' : '0' },
    } as unknown as Href);
  }

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader
        title="Servis Fiyat Listesi"
        subtitle="Üretici, uyumluluk ve seçili fiyat listesi bağlamını kaybetmeden servis kalemlerini karşılaştırın."
      />
      <KpiGrid>
        {[
          <KpiTile key="t" icon="cube-outline" label="Toplam Kalem" value={String(total)} />,
          <KpiTile key="k" icon="pricetags-outline" label="Kategori" value={String(SERVICE_PRICE_CATEGORIES.length)} />,
          <KpiTile key="g" icon="eye-outline" tone="success" label="Görünen" value={String(rows.length)} />,
          <KpiTile key="l" icon="checkmark-done-outline" label="Liste" value={selectedList?.code || '—'} sub={listCurrency || 'Para birimi yok'} />,
        ]}
      </KpiGrid>
      <Tabs
        tabs={SERVICE_PRICE_CATEGORIES.map((category) => ({ value: category.value, label: category.label, badge: counts[category.value] }))}
        value={tab}
        onChange={setTab}
      />
      <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-2.5">
        {sortedLists.length > 0 ? (
          <OptionPicker
            label="Fiyat listesi"
            value={listId || null}
            options={sortedLists.map((list) => ({ value: list.id, label: list.name || list.code, hint: list.currency?.code }))}
            onChange={(value) => setListId(value ?? '')}
          />
        ) : null}
        <View className="flex-row items-start gap-2 rounded-control border border-border bg-card p-3">
          <Ionicons name={canEdit ? 'create-outline' : 'lock-closed-outline'} size={15} color={canEdit ? colors.primary : colors.mutedForeground} />
          <Text className={`flex-1 font-inter text-xs ${canEdit ? 'text-primary' : 'text-muted-foreground'}`}>
            {canEdit
              ? 'Fiyat listesi yetkisi: Fiyatlara dokunarak seçili liste kalemini düzenleyebilirsiniz.'
              : 'Servis fiyat listesi salt-okunur. Kalemler kategori sekmelerine ayrılmıştır.'}
          </Text>
        </View>
      </View>
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={isLabor ? 'İşçilik kalemi ara...' : `${activeCategory.label}, marka ara...`}
      />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      {products.isPending || lists.isPending ? (
        <>
          <ScreenHeader title="Servis Fiyat Listesi" />
          <ListSkeleton />
        </>
      ) : products.error || lists.error ? (
        <>
          <ScreenHeader title="Servis Fiyat Listesi" />
          <ErrorState
            message={(products.error ?? lists.error)!.message}
            onRetry={() => {
              void products.refetch();
              void lists.refetch();
            }}
          />
        </>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(product) => product.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshing={products.isRefetching || items.isRefetching}
          onRefresh={() => {
            void products.refetch();
            void lists.refetch();
            void items.refetch();
          }}
          renderItem={({ item: product }) => {
            const prices = effectivePrices(product, overrides[product.id]);
            const currency = priceCurrency(product, listCurrency);
            const title = product.modelName?.trim() || product.fullName || product.modelCode;
            return (
              <View style={{ paddingHorizontal: SCREEN_PAD }}>
                <View className="my-[5px] gap-2.5 rounded-[16px] border border-border bg-card p-3.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${title} ürün detayı`}
                    onPress={() => router.push(`/(tabs)/modules/products/${product.id}` as Href)}
                    className="min-h-[44px] flex-row items-center gap-3 active:opacity-70"
                  >
                    {isLabor ? (
                      <View className="h-[46px] w-[46px] items-center justify-center rounded-control bg-stage-soft">
                        <Ionicons name="construct-outline" size={18} color={toneColor(colors, 'stage')} />
                      </View>
                    ) : (
                      <ProductThumb imageUrl={product.imageUrl} label={title} />
                    )}
                    <View className="min-w-0 flex-1">
                      {isLabor ? null : (
                        <Text className="font-inter-semibold text-[10px] uppercase tracking-wider text-primary" numberOfLines={1}>
                          {product.stockCode || 'STOK KODU YOK'}
                        </Text>
                      )}
                      <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={2}>
                        {title}
                      </Text>
                      {isLabor ? null : (
                        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                          {[product.brand?.name || 'Üretici yok', product.originCountry].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </Pressable>
                  {isLabor ? null : (
                    <View className="flex-row flex-wrap gap-1.5">
                      <Chip tone="info" label={compatibilityLabel(product)} />
                      {product.subcategory?.name ? <Chip tone="neutral" label={product.subcategory.name} /> : null}
                    </View>
                  )}
                  <View className="flex-row items-end gap-3 border-t border-border pt-2">
                    {isLabor ? (
                      <>
                        <PriceCell label="Birim Ücret" value={formatPrice(prices.list, currency)} />
                        <PriceCell label="KDV" value={product.vatRate ? `%${Number(product.vatRate)}` : '—'} />
                      </>
                    ) : (
                      <>
                        <PriceCell label="Peşin" value={formatPrice(prices.cash, currency)} tone="success" />
                        <PriceCell label="Liste Fiyatı" value={formatPrice(prices.list, currency)} />
                      </>
                    )}
                    {canEdit ? (
                      <SmallButton icon="create-outline" label="Fiyat" disabled={!listId} onPress={() => editPrice(product)} />
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={isLabor ? 'construct-outline' : 'cube-outline'}
              title={isLabor ? 'İşçilik kalemi bulunamadı.' : `${activeCategory.label} bulunamadı.`}
            />
          }
          ListFooterComponent={
            rows.length ? (
              <Text style={{ paddingHorizontal: SCREEN_PAD }} className="pt-2 font-inter text-xs text-muted-foreground">
                Toplam {rows.length} {isLabor ? 'işçilik kalemi' : activeCategory.label.toLocaleLowerCase('tr-TR')}
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function PriceCell({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <View className="flex-1">
      <Text className="font-inter text-[11px] text-muted-foreground">{label}</Text>
      <Text
        className={`font-inter-semibold text-[13px] ${tone === 'success' ? 'text-success' : 'text-foreground'}`}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}
