import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useInventoryItem, useReserveInventoryItem, useUpdateInventoryItemStatus } from '@/src/api/inventory.hooks';
import { formatDate } from '@/src/lib/format';
import { chipClass, chipTextClass, useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, DetailSkeleton, Loading, SearchBar } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { toast } from '@/src/ui/toast';

/** INVENTORY_STATUSES (packages/shared) — etiketler web StockPage ile aynı. */
const STATUS_OPTIONS: { code: string; label: string; tone: Tone }[] = [
  { code: 'available', label: 'Hazır', tone: 'success' },
  { code: 'reserved', label: 'Rezerve', tone: 'warning' },
  { code: 'in_transit', label: 'Yolda', tone: 'info' },
  { code: 'sold', label: 'Satıldı', tone: 'neutral' },
  { code: 'damaged', label: 'Hasarlı', tone: 'destructive' },
];

type InventoryTab = 'general' | 'reservation';

function InventoryRow({
  icon,
  label,
  value,
  tone,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null | undefined;
  tone?: Tone;
  last?: boolean;
}) {
  const { colors } = useTheme();
  if (!value) return null;

  const valueColor =
    tone === 'success'
      ? colors.success
      : tone === 'destructive'
        ? colors.destructive
        : tone === 'warning'
          ? colors.warning
          : colors.foreground;

  return (
    <View className={`min-h-[54px] flex-row items-center gap-3 py-3 ${last ? '' : 'border-b border-border'}`}>
      <Ionicons name={icon} size={20} color={colors.mutedForeground} />
      <Text className="min-w-[100px] font-inter text-[15px] text-muted-foreground" style={{ letterSpacing: 0 }}>
        {label}
      </Text>
      <Text
        className="flex-1 text-right font-inter-medium text-[15px]"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        style={{ color: valueColor, letterSpacing: 0, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function InventoryItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const canUpdate = useCan('inventory.update');
  const sheetRef = useRef<BottomSheetModal>(null);
  // 'status' -> durum değiştirme sayfası; 'reserve' -> firma rezervasyonu
  const [sheetMode, setSheetMode] = useState<'status' | 'reserve' | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [tab, setTab] = useState<InventoryTab>('general');

  const { data, isPending, error, refetch } = useInventoryItem(id);
  const reserve = useReserveInventoryItem(id);
  const updateStatus = useUpdateInventoryItemStatus(id);

  const companyList = useCompanyList(
    useMemo(() => ({ search: search.trim() || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }), [search])
  );

  if (isPending || error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Stok Kartı" />
        {isPending ? (
          <DetailSkeleton />
        ) : (
          <ErrorState message={error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const statusCode = data.status?.code ?? 'available';
  const statusMeta = STATUS_OPTIONS.find((option) => option.code === statusCode);

  function openStatusSheet() {
    setSelectedStatus(statusCode);
    setSheetMode('status');
    sheetRef.current?.present();
  }

  function openReserveSheet() {
    setCompanyId('');
    setSearch('');
    setSheetMode('reserve');
    sheetRef.current?.present();
  }

  function submitStatus() {
    if (!selectedStatus) return;
    sheetRef.current?.dismiss();
    updateStatus.mutate(
      { stockStatusCode: selectedStatus },
      {
        onSuccess: () => toast.success(`Durum güncellendi: ${STATUS_OPTIONS.find((s) => s.code === selectedStatus)?.label ?? ''}`),
        onError: (err) => toast.error(err.message),
      }
    );
  }

  function submitReserve(companyIdToReserve?: string) {
    const target = companyIdToReserve ?? companyId;
    if (!target) {
      toast.error('Firma seçin.');
      return;
    }
    sheetRef.current?.dismiss();
    reserve.mutate(
      { companyId: target },
      {
        onSuccess: () => toast.success('Stok firmaya rezerve edildi'),
        onError: (err) => toast.error(err.message),
      }
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Stok Detayı" />

      <ScrollView contentContainerClassName="pb-6" showsVerticalScrollIndicator={false}>
        <View className="px-[18px] pt-4">
          <Card className="min-h-[178px] flex-row items-center gap-4 p-4">
            <View className="h-[140px] w-[42%] items-center justify-center rounded-control bg-card-subtle">
              <Ionicons name="cube-outline" size={64} color={colors.lineStrong} />
            </View>
            <View className="min-w-0 flex-1 gap-3">
              <Text
                className="font-inter-bold text-[21px] leading-[1.16] text-foreground"
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                style={{ letterSpacing: 0 }}
              >
                {data.product?.fullName ?? data.product?.modelCode ?? 'Stok kalemi'}
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {data.status ? <Chip tone={statusMeta?.tone ?? 'info'} label={data.status.name} /> : null}
                {data.reservedCompany ? <Chip tone="warning" label="Rezerve" /> : null}
              </View>
              <View className="gap-1">
                <Text className="font-inter text-[13px] text-muted-foreground" style={{ letterSpacing: 0 }}>
                  Seri Numarası
                </Text>
                <Text
                  className="font-inter-semibold text-[17px] text-primary"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ letterSpacing: 0, fontVariant: ['tabular-nums'] }}
                >
                  {data.serialNumber}
                </Text>
              </View>
            </View>
          </Card>
        </View>

        <View className="pt-5">
          <Tabs
            tabs={[
              { value: 'general', label: 'Genel', icon: 'document-text-outline' },
              { value: 'reservation', label: 'Rezervasyon', icon: 'business-outline' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        <View className="gap-4 px-[18px] pt-4">
          {tab === 'general' ? (
            <>
              <Card className="gap-0 px-4 py-1">
                <InventoryRow icon="barcode-outline" label="Model kodu" value={data.product?.modelCode} />
                <InventoryRow icon="pricetag-outline" label="Stok kodu" value={data.product?.stockCode} />
                <InventoryRow icon="ribbon-outline" label="Marka" value={data.brand?.name} />
                <InventoryRow icon="grid-outline" label="Kategori" value={data.category?.name} />
                <InventoryRow icon="business-outline" label="Depo" value={data.warehouse?.name} />
                <InventoryRow
                  icon="shield-checkmark-outline"
                  label="Kondisyon"
                  value={data.itemCondition === 'new' ? 'Sıfır' : data.itemCondition}
                />
                <InventoryRow icon="location-outline" label="Konum durumu" value={data.locationStatus?.name} />
                <InventoryRow icon="information-circle-outline" label="Stok durumu" value={data.status?.name} tone={statusMeta?.tone} last />
              </Card>

              {(data.controlUnit || data.controlUnitSerialNumber || data.arrivalDate || data.receivedDate || data.loadingDate) ? (
                <Card className="gap-0 px-4 py-1">
                  <InventoryRow icon="hardware-chip-outline" label="Kontrol ünitesi" value={data.controlUnit} />
                  <InventoryRow icon="barcode-outline" label="Ünite SN" value={data.controlUnitSerialNumber} />
                  <InventoryRow icon="cube-outline" label="Yüklenme" value={data.loadingDate ? formatDate(data.loadingDate) : null} />
                  <InventoryRow icon="calendar-outline" label="Geliş" value={data.arrivalDate ? formatDate(data.arrivalDate) : null} />
                  <InventoryRow icon="checkmark-done-outline" label="Teslim alma" value={data.receivedDate ? formatDate(data.receivedDate) : null} last />
                </Card>
              ) : null}

              {data.notes ? (
                <Card className="gap-2">
                  <Text className="font-inter-semibold text-[15px] text-foreground" style={{ letterSpacing: 0 }}>Not</Text>
                  <Text className="font-inter text-[14px] leading-5 text-foreground" style={{ letterSpacing: 0 }}>{data.notes}</Text>
                </Card>
              ) : null}

              {data.product?.id ? (
                <Button
                  label="Ürün Kartını Aç"
                  variant="ghost"
                  trailingIcon="arrow-forward"
                  onPress={() => router.push(`/(tabs)/modules/products/${data.product!.id}`)}
                />
              ) : null}
            </>
          ) : null}

          {tab === 'reservation' ? (
            <Card className="gap-4">
              {data.reservedCompany ? (
                <>
                  <View className="flex-row items-start gap-3">
                    <View className="h-11 w-11 items-center justify-center rounded-full bg-warning-soft">
                      <Ionicons name="business-outline" size={20} color={colors.warning} />
                    </View>
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="font-inter text-[12px] text-muted-foreground" style={{ letterSpacing: 0 }}>Rezerve edilen firma</Text>
                      <Text className="font-inter-semibold text-[16px] text-foreground" numberOfLines={2} style={{ letterSpacing: 0 }}>
                        {data.reservedCompany.shortName ?? data.reservedCompany.legalTitle}
                      </Text>
                      {data.reservedCompany.shortName ? (
                        <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={2} style={{ letterSpacing: 0 }}>
                          {data.reservedCompany.legalTitle}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {data.reservedAt ? <InventoryRow icon="calendar-outline" label="Rezervasyon" value={formatDate(data.reservedAt)} last /> : null}
                  <Button
                    label="Firma Kartını Aç"
                    variant="ghost"
                    trailingIcon="arrow-forward"
                    onPress={() => router.push(`/(tabs)/modules/companies/${data.reservedCompany!.id}`)}
                  />
                </>
              ) : (
                <View className="items-center gap-3 py-7">
                  <View className="h-14 w-14 items-center justify-center rounded-full bg-card-subtle">
                    <Ionicons name="business-outline" size={26} color={colors.mutedForeground} />
                  </View>
                  <Text className="text-center font-inter-medium text-[14px] text-muted-foreground" style={{ letterSpacing: 0 }}>
                    Bu stok kalemi henüz bir firmaya rezerve edilmedi
                  </Text>
                </View>
              )}
            </Card>
          ) : null}
        </View>
      </ScrollView>

      {canUpdate ? (
        <View className="flex-row gap-3 border-t border-border bg-card px-[18px] py-3">
          <View className="flex-1">
            <Button
              label="Durum Değiştir"
              variant="ghost"
              onPress={openStatusSheet}
              loading={updateStatus.isPending}
              disabled={updateStatus.isPending}
            />
          </View>
          {statusCode === 'available' ? (
            <View className="flex-1">
              <Button
                label="Firmaya Rezerve Et"
                onPress={openReserveSheet}
                loading={reserve.isPending}
                disabled={reserve.isPending}
              />
            </View>
          ) : null}
          {/* Web StockPage'de ayrı menü öğesi; mobilde önce durum değiştirmek gerekiyordu. */}
          {statusCode === 'reserved' ? (
            <View className="flex-1">
              <Button
                label="Rezervasyonu Kaldır"
                variant="ghost"
                loading={updateStatus.isPending}
                disabled={updateStatus.isPending}
                onPress={() =>
                  Alert.alert('Rezervasyonu kaldır', 'Stok kalemi tekrar "müsait" durumuna alınacak.', [
                    { text: 'Vazgeç', style: 'cancel' },
                    {
                      text: 'Kaldır',
                      onPress: () =>
                        updateStatus.mutate(
                          { stockStatusCode: 'available' },
                          {
                            onSuccess: () => toast.success('Rezervasyon kaldırıldı'),
                            onError: (err) => Alert.alert('Kaldırılamadı', err.message),
                          }
                        ),
                    },
                  ])
                }
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        {sheetMode === 'status' ? (
          <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
            <Text className="font-inter-semibold text-base text-foreground">Stok Durumu</Text>
            {STATUS_OPTIONS.map((option) => (
              <Button
                key={option.code}
                label={option.label}
                variant={selectedStatus === option.code ? 'primary' : 'ghost'}
                onPress={() => setSelectedStatus(option.code)}
              />
            ))}
            <Button
              label="Kaydet"
              onPress={submitStatus}
              disabled={!selectedStatus || selectedStatus === statusCode || updateStatus.isPending}
              loading={updateStatus.isPending}
            />
            <View style={{ height: 4 }} />
          </BottomSheetView>
        ) : null}

        {sheetMode === 'reserve' ? (
          <>
            <BottomSheetView className="gap-3 px-4 pb-2">
              <Text className="font-inter-semibold text-base text-foreground">Rezerve edilecek firma</Text>
              <SearchBar value={search} onChange={setSearch} placeholder="Firma ara" />
            </BottomSheetView>
            <BottomSheetFlatList
              data={companyList.data?.items ?? []}
              keyExtractor={(item: CompanyListItem) => item.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
              style={{ flex: 1 }}
              renderItem={({ item }: { item: CompanyListItem }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === companyId }}
                  onPress={() => {
                    setCompanyId(item.id);
                    submitReserve(item.id);
                  }}
                  className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
                >
                  <Ionicons name="business-outline" size={19} color={item.id === companyId ? colors.primary : colors.mutedForeground} />
                  <View className="flex-1">
                    <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.shortName ?? item.legalTitle}</Text>
                    {item.shortName ? <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{item.legalTitle}</Text> : null}
                  </View>
                  <View className={`self-start rounded-full border px-2 py-0.5 ${chipClass['success']}`}>
                    <Text className={`font-inter-medium text-xs ${chipTextClass['success']}`}>Seç</Text>
                  </View>
                </Pressable>
              )}
              onEndReachedThreshold={0.5}
              onEndReached={() => { if (companyList.hasNextPage && !companyList.isFetchingNextPage) void companyList.fetchNextPage(); }}
              ListEmptyComponent={
                companyList.isPending ? <Loading /> : companyList.error ? <ErrorState message={companyList.error.message} onRetry={() => void companyList.refetch()} /> : <EmptyState title="Firma bulunamadı" />
              }
              ListFooterComponent={companyList.isFetchingNextPage ? <Loading /> : null}
            />
          </>
        ) : null}
      </BottomSheetModal>
    </SafeAreaView>
  );
}
