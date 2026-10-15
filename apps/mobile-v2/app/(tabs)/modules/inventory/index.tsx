import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCan } from '@/src/auth/AuthProvider';
import { useAllInventory } from '@/src/api/inventory.hooks';
import { useAllProducts } from '@/src/api/products.hooks';
import type { CatalogProduct, StockRow } from '@/src/api/products.api';
import { exportService } from '@/src/api/exports';
import { formatDate } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Chip, EmptyState, ErrorState, Fab, FilterChips, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { KpiGrid, KpiTile, Panel, ShareBar, runExport } from '@/src/ui/finance/kit';
import { ProductThumb } from '@/src/ui/products/ProductThumb';
import {
  LOCATION_STATUS_LABELS,
  LOW_STOCK_THRESHOLD,
  SPINDLE_POWER_KEYS,
  SPINDLE_SPEED_KEYS,
  STOCK_CATEGORY_TABS,
  STOCK_STATUS_TABS,
  TOOL_COUNT_KEYS,
  brandDistribution,
  criticalMachines,
  filterStock,
  optionsByParent,
  scopeByCategory,
  specValue,
  stockConditionLabel,
  stockCounts,
  stockExportParams,
  stockStatusLabel,
  warehouseDistribution,
} from '@/src/ui/products/stock-logic';

const STATUS_TONE: Record<string, Tone> = {
  available: 'success',
  reserved: 'warning',
  in_transit: 'info',
  sold: 'stage',
  damaged: 'destructive',
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[46%] flex-1 gap-0.5">
      <Text className="font-inter text-[10px] uppercase text-muted-foreground">{label}</Text>
      <Text className="font-inter-medium text-xs text-foreground" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function StockCard({
  item,
  product,
  options,
  onPress,
}: {
  item: StockRow;
  product: CatalogProduct | undefined;
  options: StockRow[];
  onPress: (id: string) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const code = item.status?.code ?? '';
  const tone = STATUS_TONE[code] ?? 'neutral';
  const title = item.product?.fullName ?? item.product?.modelCode ?? 'Stok kalemi';
  const location = item.warehouse?.name ?? LOCATION_STATUS_LABELS[item.locationStatus?.code ?? ''] ?? '—';
  const isMachine = (item.category?.code ?? 'TEZGAH') === 'TEZGAH';
  return (
    <View className="my-1 rounded-[8px] border border-border bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, seri no ${item.serialNumber}`}
        onPress={() => onPress(item.id)}
        className="gap-3 p-3 active:opacity-70"
      >
        <View className="flex-row items-center gap-3">
          <ProductThumb imageUrl={product?.imageUrl} label={title} size={48} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={2}>
              {title}
            </Text>
            <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
              {[item.brand?.name, `SN: ${item.serialNumber}`].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Chip label={stockStatusLabel(code, item.status?.name)} tone={tone} />
        </View>
        <View className="flex-row flex-wrap gap-x-3 gap-y-2">
          <Detail label="Kondisyon" value={stockConditionLabel(item.itemCondition)} />
          <Detail label="Ürünün Bulunduğu Yer" value={location} />
          <Detail label="Rezerve Edildiği Firma" value={item.reservedCompany?.shortName ?? item.reservedCompany?.legalTitle ?? '—'} />
          {isMachine ? <Detail label="Kontrol Ünitesi" value={item.controlUnit || '—'} /> : null}
          {isMachine ? <Detail label="Fener Mili Devri" value={specValue(product?.specs, SPINDLE_SPEED_KEYS)} /> : null}
          {isMachine ? <Detail label="Takım Adeti" value={specValue(product?.specs, TOOL_COUNT_KEYS)} /> : null}
          {isMachine ? <Detail label="Fener Mili Motor Gücü" value={specValue(product?.specs, SPINDLE_POWER_KEYS)} /> : null}
          <Detail label="Yüklendiği Tarih" value={item.loadingDate ? formatDate(item.loadingDate) : '—'} />
          <Detail label="Geldiği Tarih" value={item.receivedDate ? formatDate(item.receivedDate) : '—'} />
          <Detail label="Geleceği Tarih" value={item.arrivalDate ? formatDate(item.arrivalDate) : '—'} />
        </View>
      </Pressable>
      {options.length ? (
        <View className="border-t border-border">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Opsiyonel donanımları göster"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((value) => !value)}
            className="min-h-11 flex-row items-center gap-2 px-3 active:opacity-70"
          >
            <Ionicons name="construct-outline" size={16} color={colors.mutedForeground} />
            <Text className="flex-1 font-inter-medium text-xs text-foreground">{options.length} bağlı opsiyonel donanım</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
          </Pressable>
          {open
            ? options.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.product?.fullName ?? 'Opsiyonel donanım'}, ${option.serialNumber}`}
                  onPress={() => onPress(option.id)}
                  className="min-h-11 flex-row items-center gap-2 border-t border-border px-3 py-2 active:opacity-70"
                >
                  <Text className="flex-1 font-inter text-xs text-foreground" numberOfLines={1}>
                    {option.product?.fullName ?? option.product?.modelCode ?? 'Opsiyonel donanım'}
                  </Text>
                  <Text className="font-inter text-[11px] text-muted-foreground">{option.serialNumber}</Text>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

export default function InventoryScreen() {
  const router = useRouter();
  const canCreate = useCan('inventory.create');
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const list = useAllInventory();
  const products = useAllProducts();
  const rows = list.data ?? [];

  const productById = useMemo(() => new Map((products.data ?? []).map((product) => [product.id, product])), [products.data]);
  const scoped = useMemo(() => scopeByCategory(rows, category), [rows, category]);
  const counts = useMemo(() => stockCounts(scoped), [scoped]);
  const critical = useMemo(() => criticalMachines(rows), [rows]);
  const active = useMemo(() => scoped.filter((row) => row.status?.code !== 'sold'), [scoped]);
  const warehouses = useMemo(() => warehouseDistribution(active).filter((item) => item.name), [active]);
  const brands = useMemo(() => brandDistribution(active).slice(0, 6), [active]);
  const children = useMemo(() => optionsByParent(rows), [rows]);
  const filter = { category, status, query: search };
  const visible = useMemo(() => filterStock(scoped, { category, status, query: search }), [scoped, category, status, search]);
  const maxWarehouse = Math.max(1, ...warehouses.map((item) => item.count));

  async function exportExcel() {
    setExporting(true);
    await runExport(() => exportService.inventory(stockExportParams(filter)));
    setExporting(false);
  }

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader
        title="Stoklar"
        subtitle="Tüm stoklarınızı görüntüleyin ve yönetin."
        actions={[
          { icon: exporting ? 'hourglass-outline' : 'download-outline', label: 'Excel', onPress: () => void exportExcel() },
          { icon: 'qr-code-outline', label: 'QR / Barkod Tara', onPress: () => router.push('/(tabs)/modules/inventory/scan' as Href) },
        ]}
      />
      <FilterChips
        options={STOCK_CATEGORY_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
        value={category}
        onChange={(next) => {
          setCategory(next);
          setStatus(null);
        }}
        allLabel="Tüm Stok"
      />
      <KpiGrid>
        {[
          <KpiTile key="available" icon="cube-outline" tone="success" label="Hazır Stok" value={String(counts.available)} sub="adet" selected={status === 'available'} onPress={() => setStatus(status === 'available' ? null : 'available')} />,
          <KpiTile key="reserved" icon="time-outline" tone="warning" label="Rezerve" value={String(counts.reserved)} sub="bekleyen sipariş" selected={status === 'reserved'} onPress={() => setStatus(status === 'reserved' ? null : 'reserved')} />,
          <KpiTile key="sold" icon="checkmark-circle-outline" tone="stage" label="Satılan" value={String(counts.sold)} sub="faturalanan" selected={status === 'sold'} onPress={() => setStatus(status === 'sold' ? null : 'sold')} />,
          <KpiTile key="damaged" icon="alert-circle-outline" tone="destructive" label="Pasif" value={String(counts.damaged)} sub="kullanım dışı" selected={status === 'damaged'} onPress={() => setStatus(status === 'damaged' ? null : 'damaged')} />,
        ]}
      </KpiGrid>
      {category === null || category === 'TEZGAH' ? (
        <Panel
          title="Kritik Makine Stoku"
          subtitle={`Hazır adedi ${LOW_STOCK_THRESHOLD} ve altındaki modeller — yeniden sipariş sinyali`}
          right={critical.length ? <Chip label={`${critical.length} model`} tone="warning" /> : undefined}
        >
          {critical.length === 0 ? (
            <Text className="py-2 font-inter text-sm text-muted-foreground">Tüm modellerde yeterli hazır stok var.</Text>
          ) : (
            critical.slice(0, 6).map((row) => (
              <Pressable
                key={row.productId}
                accessibilityRole="button"
                accessibilityLabel={`${row.label} stoklarını ara`}
                onPress={() => {
                  setCategory(null);
                  setStatus(null);
                  setSearch(productById.get(row.productId)?.modelCode ?? row.label);
                }}
                className="min-h-11 flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
              >
                <ProductThumb imageUrl={productById.get(row.productId)?.imageUrl} label={row.label} size={36} />
                <View className="min-w-0 flex-1">
                  <Text className="font-inter-medium text-sm text-foreground" numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Text className="font-inter text-xs text-muted-foreground">
                    Hazır: {row.available} · Rezerve: {row.reserved} · Toplam: {row.total}
                  </Text>
                </View>
                <Chip label={row.out ? 'Tükendi' : 'Düşük'} tone={row.out ? 'destructive' : 'warning'} />
              </Pressable>
            ))
          )}
        </Panel>
      ) : null}
      <Panel title="Depo Bazında Stok">
        {warehouses.length === 0 ? (
          <Text className="py-2 font-inter text-sm text-muted-foreground">Depo dağılımı için stok kaydı bekleniyor.</Text>
        ) : (
          warehouses.map((item) => (
            <View key={item.name} className="gap-1.5 py-1.5">
              <View className="flex-row justify-between">
                <Text className="flex-1 font-inter-medium text-sm text-foreground" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="font-inter text-xs text-muted-foreground">{item.count} kalem</Text>
              </View>
              <ShareBar ratio={item.count / maxWarehouse} tone="info" />
            </View>
          ))
        )}
      </Panel>
      {brands.length ? (
        <Panel title="Marka Dağılımı" subtitle="Aktif kalemler">
          {brands.map((item) => (
            <View key={item.name} className="gap-1.5 py-1.5">
              <View className="flex-row justify-between">
                <Text className="flex-1 font-inter-medium text-sm text-foreground" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="font-inter text-xs text-muted-foreground">
                  {item.count} · %{Math.round(item.share * 100)}
                </Text>
              </View>
              <ShareBar ratio={item.share} tone="stage" />
            </View>
          ))}
        </Panel>
      ) : null}
      <SearchBar value={search} onChange={setSearch} placeholder="Ürün adı / seri / marka..." />
      <FilterChips
        options={STOCK_STATUS_TABS.map((tab) => ({ value: tab.value, label: tab.label, count: counts[tab.value] }))}
        value={status}
        onChange={setStatus}
      />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      {list.isPending ? (
        <>
          <ScreenHeader title="Stoklar" />
          <ListSkeleton />
        </>
      ) : list.error ? (
        <>
          <ScreenHeader title="Stoklar" />
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        </>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: SCREEN_PAD }}>
              <StockCard
                item={item}
                product={productById.get(item.productModelId ?? item.product?.id ?? '')}
                options={category === 'OPSIYONEL_DONANIM' ? [] : (children.get(item.id) ?? [])}
                onPress={(id) => router.push(`/(tabs)/modules/inventory/${id}` as Href)}
              />
            </View>
          )}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState title="Kayıt bulunamadı" hint="Arama terimini veya durum/kategori sekmelerini değiştirerek tekrar deneyin." />
          }
        />
      )}
      {canCreate ? <Fab label="Yeni Stok" extended onPress={() => router.push('/modal/stock-item' as Href)} /> : null}
    </SafeAreaView>
  );
}
