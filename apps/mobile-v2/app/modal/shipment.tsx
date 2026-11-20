import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { shipmentCreateSchema, type ShipmentTransportMode } from '@haksan/shared';
import { useWarehouses } from '@/src/api/inventory.hooks';
import { ops } from '@/src/api/ops.endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { CompanyPickerField } from '@/src/features/CompanyPickerField';
import { Button, Eyebrow, Field, FilterChips } from '@/src/ui';

const MODES: { value: ShipmentTransportMode; label: string }[] = [
  { value: 'road', label: 'Kara' },
  { value: 'sea', label: 'Deniz' },
  { value: 'air', label: 'Hava' },
  { value: 'local_cargo', label: 'Yurt içi kargo' },
];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/**
 * Sevkiyat kaydı (web'deki "Yeni Sevkiyat"ın başlık kısmı). Paketleme listesi ve
 * stok kalemi bağlama webde kalır; fırsattan açılınca fırsat ve firma taşınır.
 */
export default function ShipmentFormScreen() {
  const params = useLocalSearchParams<{ opportunityId?: string; companyId?: string; companyName?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const allowed = useCan('shipments.create');
  const warehouses = useWarehouses();
  const opportunityId = first(params.opportunityId);
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing');
  const [companyId, setCompanyId] = useState(first(params.companyId));
  const [companyName, setCompanyName] = useState(first(params.companyName));
  const [transportMode, setTransportMode] = useState<ShipmentTransportMode | null>('road');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [shipmentNo, setShipmentNo] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [eta, setEta] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!allowed) return <Redirect href="/modules/shipments" />;

  function save() {
    setError('');
    if (eta.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(eta.trim())) return setError('Tahmini varış biçimi: YYYY-AA-GG');
    const parsed = shipmentCreateSchema.safeParse({
      direction,
      opportunityId: opportunityId || undefined,
      companyId: companyId || undefined,
      transportMode: transportMode ?? undefined,
      destinationWarehouseId: direction === 'incoming' ? warehouseId ?? undefined : undefined,
      shipmentNo: shipmentNo.trim() || undefined,
      carrier: carrier.trim() || undefined,
      trackingNo: trackingNo.trim() || undefined,
      origin: origin.trim() || undefined,
      destination: destination.trim() || undefined,
      eta: eta.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Alanları kontrol edin.');
    setSaving(true);
    ops.createShipment(parsed.data)
      .then(async (created) => {
        await qc.invalidateQueries({ queryKey: ['service', 'shipments'] });
        router.replace(`/modules/shipments/${created.id}` as Href);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Sevkiyat kaydedilemedi.'))
      .finally(() => setSaving(false));
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni sevkiyat', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Sevkiyat</Eyebrow>
            <FilterChips options={[{ value: 'outgoing', label: 'Giden (müşteriye)' }, { value: 'incoming', label: 'Gelen (depoya)' }]} value={direction} onChange={(value) => value && setDirection(value)} allLabel="" />
            <CompanyPickerField value={companyId ? { id: companyId, name: companyName } : null} onChange={(company) => { setCompanyId(company.id); setCompanyName(company.name); }} />
            {opportunityId ? <Text className="font-inter text-xs text-muted-foreground">Fırsata bağlı olarak kaydedilecek.</Text> : null}
            <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Taşıma şekli</Text><FilterChips options={MODES} value={transportMode} onChange={setTransportMode} allLabel="" /></View>
            {direction === 'incoming' ? (
              <View className="gap-1.5">
                <Text className="font-inter-medium text-[13px] text-muted-foreground">Varış deposu</Text>
                <FilterChips options={(warehouses.data ?? []).map((item) => ({ value: item.id, label: item.name }))} value={warehouseId} onChange={setWarehouseId} allLabel="" />
                <Text className="font-inter text-xs text-muted-foreground">Gelen sevkiyat teslim alınmadan önce depo seçilmeli; şimdi veya detayda seçebilirsiniz.</Text>
              </View>
            ) : null}
          </View>
          <View className="gap-3">
            <Eyebrow>Taşıma</Eyebrow>
            <Field label="Sevkiyat no" value={shipmentNo} onChangeText={setShipmentNo} maxLength={64} />
            <Field label="Taşıyıcı" value={carrier} onChangeText={setCarrier} maxLength={255} />
            <Field label="Takip no" value={trackingNo} onChangeText={setTrackingNo} maxLength={128} autoCapitalize="characters" />
            <Field label="Çıkış yeri" value={origin} onChangeText={setOrigin} maxLength={255} />
            <Field label="Varış yeri" value={destination} onChangeText={setDestination} maxLength={255} />
            <Field label="Tahmini varış" value={eta} onChangeText={setEta} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} />
            <Field label="Notlar" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
            <Text className="font-inter text-xs text-muted-foreground">Paketleme listesi ve stok kalemi bağlama webde yapılır.</Text>
          </View>
          {error ? <Text accessibilityRole="alert" className="font-inter text-sm text-destructive">{error}</Text> : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Sevkiyatı Kaydet" loading={saving} disabled={saving} onPress={save} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
