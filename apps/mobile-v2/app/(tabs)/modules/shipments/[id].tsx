import { useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useShipment, useStartShipment, useUpdateShipmentStatus, type ShipmentStatusCodeInput } from '@/src/api/operations.hooks';
import { formatDateTime } from '@/src/lib/format';
import { toneColor, useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, DetailSkeleton } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { InfoRows, type InfoItem } from '@/src/ui/data';
import { useCan } from '@/src/auth/AuthProvider';
import { useCompany } from '@/src/api/companies.hooks';
import type { ShipmentDetail } from '@/src/api/logistics.api';
import { useDeleteShipment } from '@/src/api/logistics.hooks';
import { FormSection } from '@/src/ui/service/fields';
import { JourneySteps } from '@/src/ui/service/JourneySteps';
import { companyUserInfo, etaState, ROUTE_STEPS, routeStep, TRANSPORT_MODE_LABELS } from '@/src/ui/service/logistics';
import { DispatchNoteDocument } from '@/src/ui/service/ShipmentDocuments';

/** Sunucudaki shipmentStatusCodeSchema ile birebir; etiketler web ShipmentsPage ile aynı. */
const STATUS_LABELS: Record<ShipmentStatusCodeInput, string> = {
  preparing: 'Hazırlanıyor',
  in_transit: 'Yolda',
  at_customs: 'Gümrükte',
  cleared: 'Gümrükten Çıktı',
  delivered: 'Teslim Edildi',
};

/** İlerleme sırası — geriye dönüş web'de de yok. */
const NEXT_STATUS: Record<ShipmentStatusCodeInput, ShipmentStatusCodeInput[]> = {
  preparing: ['in_transit'],
  in_transit: ['at_customs', 'cleared', 'delivered'],
  at_customs: ['cleared', 'delivered'],
  cleared: ['delivered'],
  delivered: [],
};

/** Tasarımdaki dikey takip çizgisi: gerçekleşen adımlar dolu, bekleyen boş.
 * Harita bileşeni burada KAPSAM DIŞI (Expo Go'yu bozuyor) — bu çizgi onun yerine kalıyor. */
function TrackStep({
  label,
  at,
  done,
  last,
}: {
  label: string;
  at: string | null;
  done: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View
          className="h-3 w-3 rounded-full border-2"
          style={{
            borderColor: done ? toneColor(colors, 'success') : colors.lineStrong,
            backgroundColor: done ? toneColor(colors, 'success') : 'transparent',
          }}
        />
        {!last ? <View className="w-0.5 flex-1" style={{ backgroundColor: colors.lineStrong }} /> : null}
      </View>
      <View className={`flex-1 ${last ? '' : 'pb-4'}`}>
        <Text className={`text-[14px] ${done ? 'font-inter-medium text-foreground' : 'font-inter text-muted-foreground'}`}>
          {label}
        </Text>
        {at ? <Text className="font-inter text-[12px] text-muted-foreground">{formatDateTime(at)}</Text> : null}
      </View>
    </View>
  );
}

export default function ShipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const canUpdate = useCan('shipments.update');
  const { data, isPending, isRefetching, error, refetch } = useShipment(id);
  const start = useStartShipment();
  const updateStatus = useUpdateShipmentStatus();
  const remove = useDeleteShipment();
  const company = useCompany(data?.companyId ?? '');
  const [now] = useState(() => Date.now());

  if (isPending || error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Sevkiyat" />
        {isPending ? (
          <DetailSkeleton />
        ) : (
          <ErrorState message={error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const statusCode = (data.status?.code ?? (data.arrivedAt ? 'delivered' : data.shippedAt ? 'in_transit' : 'preparing')) as ShipmentStatusCodeInput;
  const nextOptions = NEXT_STATUS[statusCode] ?? [];
  /** Gelen sevkiyatta teslim öncesi varış deposu zorunlu — sunucu kuralı. */
  const deliveredBlocked =
    data.direction !== 'outgoing' && !data.destinationWarehouse && nextOptions.includes('delivered');

  function handleStart() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    start.mutate(
      { id },
      {
        onSuccess: () => toast.success('Sevkiyat yola çıktı'),
        onError: (err) => Alert.alert('Başılamadı', err.message),
      }
    );
  }

  function handleStatus(next: ShipmentStatusCodeInput) {
    if (next === 'delivered' && deliveredBlocked) {
      Alert.alert('Varış deposu gerekli', 'Gelen sevkiyatları teslim etmeden önce web panelden varış deposu seçilmelidir.');
      return;
    }
    sheetRef.current?.dismiss();
    updateStatus.mutate(
      { id, statusCode: next },
      {
        onSuccess: () => toast.success(`Durum güncellendi: ${STATUS_LABELS[next]}`),
        onError: (err) => Alert.alert('Durum güncellenemedi', err.message),
      }
    );
  }

  const tone = data.arrivedAt ? 'success' : data.shippedAt ? 'info' : 'warning';
  const eta = etaState(data.eta, now);
  const full = data as ShipmentDetail;
  const firm = company.data;

  function confirmDelete() {
    Alert.alert(
      'Sevkiyat kaydı silinsin mi?',
      `${data!.trackingNo || 'Sevkiyat'} · ${data!.carrier ?? ''}\nRota ve takip kaydı listeden kaldırılır; stok veya satış kartı kayıtları silinmez.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sevkiyatı Sil',
          style: 'destructive',
          onPress: () =>
            remove.mutate(id, {
              onSuccess: () => {
                toast.success('Sevkiyat silindi');
                router.back();
              },
              onError: (err) => toast.error(`Sevkiyat silinemedi: ${err.message}`),
            }),
        },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Sevkiyat Detayı" subtitle={data.shipmentNo ?? undefined} />

      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10 pt-4"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <Card className="gap-2">
          <Chip tone={tone} label={data.status?.name ?? (data.arrivedAt ? 'Teslim edildi' : data.shippedAt ? 'Yolda' : 'Hazırlanıyor')} />
          <Text className="text-[19px] font-inter-semibold text-foreground">
            {data.shipmentNo ?? 'Sevkiyat'}
          </Text>
          <Text className="font-inter text-[13px] text-muted-foreground">
            {data.company?.legalTitle ?? 'Firma bağlanmadı'}
          </Text>
          {data.origin || data.destination ? (
            <View className="flex-row items-center gap-2 pt-1">
              <Ionicons name="location-outline" size={15} color={colors.mutedForeground} />
              <Text className="flex-1 font-inter text-[13px] text-foreground" numberOfLines={2}>
                {[data.origin, data.destination].filter(Boolean).join('  →  ')}
              </Text>
            </View>
          ) : null}
          <View className="pt-2">
            <JourneySteps steps={ROUTE_STEPS} current={routeStep(statusCode)} />
          </View>
          <View className="flex-row items-center justify-between gap-2 pt-1">
            <Text className="font-inter text-xs text-muted-foreground">{data.direction === 'incoming' ? '↓ Gelen Sevkiyat' : '↑ Giden Sevkiyat'}</Text>
            <Chip tone={eta.tone} label={eta.label} />
          </View>
        </Card>

        <Card className="gap-0">
          <View className="pb-2">
            <Eyebrow>Takip</Eyebrow>
          </View>
          <TrackStep label="Sevkiyat oluşturuldu" at={data.createdAt} done />
          <TrackStep label="Yükleme" at={data.loadingDate} done={Boolean(data.loadingDate)} />
          <TrackStep label="Yola çıktı" at={data.shippedAt} done={Boolean(data.shippedAt)} />
          <TrackStep
            label="Teslim edildi"
            at={data.arrivedAt ?? data.eta}
            done={Boolean(data.arrivedAt)}
            last
          />
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Taşıyıcı', value: data.carrierCompany?.legalTitle ?? data.carrier },
              { label: 'Gönderen', value: data.senderCompany?.legalTitle },
              { label: 'Takip no', value: data.trackingNo },
              { label: 'Taşıma şekli', value: data.transportMode ? TRANSPORT_MODE_LABELS[data.transportMode] ?? data.transportMode : null },
              { label: 'Varış deposu', value: data.destinationWarehouse?.name },
              { label: 'Tahmini varış', value: data.eta ? formatDateTime(data.eta) : null },
            ] satisfies InfoItem[]}
          />
        </Card>

        {data.items?.length ? (
          <View className="gap-1.5">
            <View className="px-1">
              <Eyebrow>Kalemler ({data.items.length})</Eyebrow>
            </View>
            <Card className="gap-0">
              {data.items.map((item, index) => (
                <View
                  key={item.id}
                  className={`flex-row justify-between gap-3 py-2.5 ${index > 0 ? 'border-t border-border' : ''}`}
                >
                  <Text className="flex-1 font-inter text-[14px] text-foreground" numberOfLines={2}>
                    {item.description ?? '—'}
                  </Text>
                  <Text className="font-inter-semibold text-[13px] text-foreground">
                    {item.quantity ? Number(item.quantity) : ''}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {canUpdate && nextOptions.length > 0 ? (
          <View className="gap-2">
            {statusCode === 'preparing' ? (
              <Button label="Sevkiyati Başlat" onPress={handleStart} loading={start.isPending} disabled={start.isPending} />
            ) : null}
            <Button
              label="Durum Güncelle"
              variant={statusCode === 'preparing' ? 'ghost' : 'primary'}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                sheetRef.current?.present();
              }}
              disabled={updateStatus.isPending}
            />
          </View>
        ) : null}

        {data.notes ? (
          <Card className="gap-1.5">
            <Eyebrow>Not</Eyebrow>
            <Text className="font-inter text-sm text-foreground">{data.notes}</Text>
          </Card>
        ) : null}

        <FormSection title="Sevk İrsaliyesi">
          <DispatchNoteDocument
            data={{
              irsaliyeNo: data.shipmentNo || data.trackingNo || data.id.slice(0, 8),
              tarih: data.shippedAt ?? data.createdAt,
              carrier: data.carrierCompany?.legalTitle ?? data.carrier,
              trackingNo: data.trackingNo,
              origin: data.origin,
              destination: data.destination,
              incoterm: full.incoterm ?? null,
              eta: data.eta,
              firma: data.company?.legalTitle ?? data.company?.shortName ?? null,
              adres: full.deliveryAddressSnapshot || companyUserInfo(firm).adres || null,
              vergi: [firm?.taxOffice, firm?.taxNumber].filter(Boolean).join(' / ') || null,
              items: full.items.map((item) => ({
                description: item.description,
                serialNumber: item.serialNumber,
                quantity: item.quantity,
                unit: item.unit?.code ?? item.unit?.name ?? null,
              })),
              notlar: data.notes,
            }}
          />
        </FormSection>

        {data.company?.id ? (
          <Button
            label="Kargo Etiketi Yazdır"
            variant="ghost"
            trailingIcon="pricetag-outline"
            onPress={() =>
              router.push({
                pathname: '/modal/shipment-label',
                params: { companyId: data.company!.id, companyName: data.company!.legalTitle },
              } as unknown as Href)
            }
          />
        ) : null}

        {data.company?.id ? (
          <Button
            label="Firma Kartı"
            variant="ghost"
            onPress={() => router.push(`/(tabs)/modules/companies/${data.company!.id}`)}
          />
        ) : null}

        {canUpdate ? (
          <Button label="Sevkiyatı Sil" variant="destructive" trailingIcon="trash-outline" loading={remove.isPending} onPress={confirmDelete} />
        ) : null}
      </ScrollView>

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Yeni durum</Text>
          <Text className="mb-2 font-inter text-xs text-muted-foreground">
            Şu an: {STATUS_LABELS[statusCode] ?? data.status?.name ?? 'Bilinmiyor'}
          </Text>
          {nextOptions.map((next) => (
            <Button
              key={next}
              label={STATUS_LABELS[next]}
              variant={next === 'delivered' ? 'primary' : 'ghost'}
              onPress={() => handleStatus(next)}
              loading={updateStatus.isPending && updateStatus.variables?.statusCode === next}
              disabled={updateStatus.isPending}
            />
          ))}
          <View style={{ height: 4 }} />
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
