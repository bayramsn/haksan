import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useInventoryItem, useReserveInventoryItem, useUpdateInventoryItemStatus } from '@/src/api/inventory.hooks';
import { formatDate } from '@/src/lib/format';
import { chipClass, chipTextClass, useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, DetailSkeleton, Field, Loading, SearchBar } from '@/src/ui';
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

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between gap-4 border-b border-border py-2.5">
      <Text className="font-inter text-sm text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right font-inter text-sm text-foreground" numberOfLines={3}>
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
      <DetailHeader title="Stok Kartı" subtitle={data.serialNumber} />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <View className="flex-row flex-wrap gap-1.5">
            {data.status ? <Chip tone="info" label={data.status.name} /> : null}
            {data.locationStatus ? <Chip tone="neutral" label={data.locationStatus.name} /> : null}
            {data.reservedCompany ? <Chip tone="warning" label="Rezerve" /> : null}
          </View>
          <Text className="text-[19px] font-inter-semibold leading-[1.2] text-foreground">
            {data.product?.fullName ?? data.product?.modelCode ?? 'Ürün'}
          </Text>
          <Text className="font-inter text-[13px] text-muted-foreground">SN: {data.serialNumber}</Text>
        </Card>

        {canUpdate ? (
          <View className="gap-2">
            <Button label="Durum Değiştir" variant="ghost" onPress={openStatusSheet} loading={updateStatus.isPending} disabled={updateStatus.isPending} />
            {statusCode === 'available' ? (
              <Button label="Firmaya Rezerve Et" onPress={openReserveSheet} loading={reserve.isPending} disabled={reserve.isPending} />
            ) : null}
          </View>
        ) : null}

        <Card>
          <Row label="Model kodu" value={data.product?.modelCode} />
          <Row label="Stok kodu" value={data.product?.stockCode} />
          <Row label="Marka" value={data.brand?.name} />
          <Row label="Kategori" value={data.category?.name} />
          <Row label="Depo" value={data.warehouse?.name} />
          <Row label="Durum" value={data.itemCondition === 'new' ? 'Sıfır' : data.itemCondition} />
          <Row label="Kontrol ünitesi" value={data.controlUnit} />
          <Row label="Kontrol ünitesi SN" value={data.controlUnitSerialNumber} />
          <Row label="Geliş" value={data.arrivalDate ? formatDate(data.arrivalDate) : null} />
          <Row label="Teslim alma" value={data.receivedDate ? formatDate(data.receivedDate) : null} />
          <Row
            label="Rezervasyon"
            value={
              data.reservedCompany
                ? `${data.reservedCompany.legalTitle}${data.reservedAt ? ` · ${formatDate(data.reservedAt)}` : ''}`
                : null
            }
          />
        </Card>

        {data.notes ? (
          <Card className="gap-1.5">
            <Eyebrow>Not</Eyebrow>
            <Text className="font-inter text-sm text-foreground">{data.notes}</Text>
          </Card>
        ) : null}

        {data.reservedCompany?.id ? (
          <Button
            label="Firma Kartı"
            variant="ghost"
            onPress={() => router.push(`/(tabs)/modules/companies/${data.reservedCompany!.id}`)}
          />
        ) : null}

        {data.product?.id ? (
          <Button
            label="Ürün Kartı"
            variant="ghost"
            onPress={() => router.push(`/(tabs)/modules/products/${data.product!.id}`)}
          />
        ) : null}
      </ScrollView>

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
