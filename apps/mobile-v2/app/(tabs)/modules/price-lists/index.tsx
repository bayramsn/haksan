import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { isMainMachineCategory, machineFamilyForType } from '@haksan/shared';
import { useAuth } from '@/src/auth/AuthProvider';
import { activeScope } from '@/src/auth/scope';
import { useAllProducts, usePriceListItemsFull, useScopedPriceLists } from '@/src/api/products.hooks';
import type { CatalogProduct } from '@/src/api/products.api';
import { useTheme } from '@/src/theme/theme';
import { Chip, EmptyState, ErrorState, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { KpiGrid, KpiTile, SmallButton } from '@/src/ui/finance/kit';
import { ProductThumb } from '@/src/ui/products/ProductThumb';
import {
  SALES_PRICE_FILTER_LABELS,
  changeSalesPriceFilter,
  displayPrices,
  emptySalesPriceFilters,
  filterSalesPrices,
  formatPrice,
  priceOverrideMap,
  salesMachines,
  salesPriceCounts,
  salesPriceFilterOptions,
  salesPricePermissions,
  type SalesPriceFilterField,
  type SalesPriceProduct,
} from '@/src/ui/products/sales-price';

const FILTER_FIELDS: SalesPriceFilterField[] = ['group', 'category', 'subcategory', 'type', 'brand'];

function toSalesProduct(product: CatalogProduct): SalesPriceProduct & { imageUrl: string | null } {
  return {
    id: product.id,
    divisionId: product.divisionId ?? null,
    modelCode: product.modelCode,
    modelName: product.modelName,
    fullName: product.fullName,
    series: product.series,
    stockCode: product.stockCode,
    listPrice: product.listPrice,
    cashPrice: product.cashPrice,
    compatibleMachineTypeCode: product.compatibleMachineType?.code ?? null,
    brand: product.brand,
    currency: product.currency,
    productGroup: product.productGroup,
    category: product.category,
    subcategory: product.subcategory,
    productType: product.productType,
    imageUrl: product.imageUrl,
  };
}

export default function SalesPriceListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const permissions = salesPricePermissions(user);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(emptySalesPriceFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [listId, setListId] = useState<string | null>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);

  const lists = useScopedPriceLists();
  const products = useAllProducts();
  const items = usePriceListItemsFull(listId ?? '');

  useEffect(() => {
    if (!listId && lists.data?.length) setListId((lists.data.find((list) => list.isActive) ?? lists.data[0])!.id);
  }, [lists.data, listId]);

  useEffect(() => setCampaignOpen(false), [listId]);

  const selectedList = lists.data?.find((list) => list.id === listId);
  const listCurrency = selectedList?.currency?.code;
  const scopeDivision = activeScope().divisionId ?? undefined;
  const priceDivisionId = selectedList?.divisionId ?? scopeDivision;
  const priceDivisionCode = user?.divisions?.find((division) => division.id === priceDivisionId)?.code.toUpperCase() ?? '';

  useEffect(() => {
    setFilters(emptySalesPriceFilters());
    setQuery('');
  }, [priceDivisionId]);

  const machines = useMemo(
    () =>
      salesMachines((products.data ?? []).map(toSalesProduct), { divisionId: priceDivisionId, divisionCode: priceDivisionCode }, {
        isMainMachineCategory,
        machineFamilyForType: (group, typeCode) => machineFamilyForType(group, typeCode),
      }),
    [products.data, priceDivisionId, priceDivisionCode],
  );
  const overrides = useMemo(() => priceOverrideMap(items.data ?? []), [items.data]);
  const counts = salesPriceCounts(machines, overrides);
  const campaignVisible = counts.campaign > 0 || (permissions.canManageCampaign && campaignOpen);

  const groupProducts = filterSalesPrices(machines, { group: filters.group });
  const categoryProducts = filterSalesPrices(groupProducts, { category: filters.category });
  const subcategoryProducts = filterSalesPrices(categoryProducts, { subcategory: filters.subcategory });
  const choices: Record<SalesPriceFilterField, SalesPriceProduct[]> = {
    group: machines,
    category: groupProducts,
    subcategory: categoryProducts,
    type: subcategoryProducts,
    brand: machines,
  };
  const filtered = useMemo(() => filterSalesPrices(machines, filters, query), [machines, filters, query]);
  const hasFilters = Boolean(query.trim() || Object.values(filters).some(Boolean));

  const note = permissions.canManageCampaign
    ? campaignOpen
      ? 'Kampanya fiyatını, tarihlerini ve aktiflik durumunu satırdan kaydedin.'
      : counts.campaign > 0
        ? 'Aktif kampanyalar ayrı fiyat sütununda gösteriliyor.'
        : 'Kampanya alanı kapalıdır.'
    : counts.campaign > 0
      ? 'Peşin, liste ve kampanyalı fiyatlar salt okunurdur.'
      : 'Peşin ve liste fiyatları salt okunurdur. Kampanyayı yalnız Süper Admin oluşturabilir.';

  const loading = lists.isPending || products.isPending;
  const loadError = lists.error ?? products.error;

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader
        title="Satış Fiyat Listesi"
        subtitle="Ürün adı, sabit satış fiyatları ve aktif kampanya bağlamını tek satırda karşılaştırın."
      />
      <KpiGrid>
        {[
          <KpiTile key="m" icon="construct-outline" label="Tezgah" value={String(counts.machines)} />,
          <KpiTile key="p" icon="checkmark-done-outline" tone="success" label="Fiyatlı" value={String(counts.priced)} />,
          <KpiTile key="c" icon="pricetags-outline" tone={counts.campaign ? 'warning' : 'neutral'} label="Kampanya" value={String(counts.campaign)} />,
          <KpiTile key="l" icon="list-outline" label="Liste" value={selectedList?.code || '—'} sub={listCurrency || 'Para birimi yok'} />,
        ]}
      </KpiGrid>
      <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-2.5">
        <View className="flex-row items-start gap-2 rounded-control border border-border bg-card p-3">
          <Ionicons name={campaignOpen ? 'pricetags-outline' : 'lock-closed-outline'} size={15} color={colors.mutedForeground} />
          <Text className="flex-1 font-inter text-xs text-muted-foreground">{note}</Text>
        </View>
        {permissions.canManageCampaign ? (
          <SmallButton
            icon={campaignOpen ? 'close' : 'add'}
            label={campaignOpen ? 'Kampanya Düzenlemeyi Kapat' : 'Kampanya Oluştur'}
            disabled={!listId}
            onPress={() => setCampaignOpen((open) => !open)}
          />
        ) : null}
        {(lists.data ?? []).length > 0 ? (
          <OptionPicker
            label="Fiyat listesi"
            value={listId}
            options={(lists.data ?? []).map((list) => ({ value: list.id, label: list.name || list.code, hint: list.currency?.code }))}
            onChange={(value) => setListId(value)}
          />
        ) : null}
      </View>
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Tezgah, marka, model ara..."
        onFilterPress={() => setShowFilters((open) => !open)}
        filterActive={Object.values(filters).some(Boolean)}
      />
      {showFilters ? (
        <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-2.5">
          {FILTER_FIELDS.map((field) => (
            <OptionPicker
              key={field}
              label={SALES_PRICE_FILTER_LABELS[field]}
              value={filters[field] || null}
              placeholder="Tümü"
              clearable
              searchable={field === 'brand' || field === 'type'}
              options={salesPriceFilterOptions(choices[field], field)}
              onChange={(value) => setFilters((current) => changeSalesPriceFilter(current, field, value ?? ''))}
            />
          ))}
        </View>
      ) : null}
      <View style={{ paddingHorizontal: SCREEN_PAD }} className="flex-row items-center justify-between">
        <Text accessibilityLiveRegion="polite" className="font-inter text-xs text-muted-foreground">
          {filtered.length} / {machines.length} tezgah gösteriliyor
        </Text>
        <SmallButton
          icon="close"
          label="Filtreleri temizle"
          disabled={!hasFilters}
          onPress={() => {
            setFilters(emptySalesPriceFilters());
            setQuery('');
          }}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      {loading ? (
        <>
          <ScreenHeader title="Satış Fiyat Listesi" />
          <ListSkeleton />
        </>
      ) : loadError ? (
        <>
          <ScreenHeader title="Satış Fiyat Listesi" />
          <ErrorState
            message={loadError.message}
            onRetry={() => {
              void lists.refetch();
              void products.refetch();
            }}
          />
        </>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(product) => product.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshing={items.isRefetching || products.isRefetching}
          onRefresh={() => {
            void products.refetch();
            void items.refetch();
          }}
          renderItem={({ item: product }) => {
            const override = overrides[product.id];
            const prices = displayPrices(product, override, listCurrency);
            const campaignActive = Boolean(override?.campaignIsActive && override.campaignPrice != null);
            const title = product.fullName || `${product.brand?.name ?? ''} ${product.modelCode}`.trim();
            return (
              <View style={{ paddingHorizontal: SCREEN_PAD }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${title} ürün detayı`}
                  onPress={() => router.push(`/(tabs)/modules/products/${product.id}` as Href)}
                  className="my-[5px] gap-2.5 rounded-[16px] border border-border bg-card p-3.5 active:opacity-70"
                >
                  <View className="flex-row items-center gap-3">
                    <ProductThumb imageUrl={product.imageUrl} label={title} />
                    <View className="min-w-0 flex-1">
                      <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={2}>
                        {title}
                      </Text>
                      <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                        {[product.brand?.name, product.series, product.modelCode].filter(Boolean).join(' · ') || '—'}
                      </Text>
                      <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                        Tip: {product.productType?.name || '—'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </View>
                  <View className="flex-row gap-3 border-t border-border pt-2">
                    <PriceCell label="Peşin Fiyat" value={formatPrice(prices.cash, prices.currency)} tone="success" />
                    <PriceCell label="Liste Fiyatı" value={formatPrice(prices.list, prices.currency)} />
                    {campaignVisible ? (
                      <PriceCell
                        label="Kampanyalı Fiyat"
                        value={campaignActive ? formatPrice(override?.campaignPrice, prices.currency) : '—'}
                        tone={campaignActive ? 'warning' : undefined}
                      />
                    ) : null}
                  </View>
                  {campaignActive && (override?.campaignValidFrom || override?.campaignValidUntil) ? (
                    <Chip
                      tone="warning"
                      label={`Kampanya ${override?.campaignValidFrom || '…'} → ${override?.campaignValidUntil || '…'}`}
                    />
                  ) : null}
                  {permissions.canManageCampaign && campaignOpen && listId ? (
                    <SmallButton
                      icon="pricetags-outline"
                      label={override?.itemId ? 'Kampanyayı düzenle' : 'Kampanya ekle'}
                      onPress={() =>
                        router.push(`/modal/price-campaign?listId=${listId}&productId=${product.id}` as Href)
                      }
                    />
                  ) : null}
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={<EmptyState title="Tezgah bulunamadı." hint={hasFilters ? 'Filtreleri temizleyip tekrar deneyin.' : undefined} />}
          ListFooterComponent={
            filtered.length ? (
              <Text style={{ paddingHorizontal: SCREEN_PAD }} className="pt-2 font-inter text-xs text-muted-foreground">
                Toplam {filtered.length} tezgah
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function PriceCell({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' }) {
  return (
    <View className="flex-1">
      <Text className="font-inter text-[11px] text-muted-foreground">{label}</Text>
      <Text
        className={`font-inter-semibold text-[13px] ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-foreground'}`}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}
