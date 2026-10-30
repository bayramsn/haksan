import { OpportunityPickerSheet } from '@/src/ui/documents/pickers';
import { PickerField } from '@/src/ui/pickers/PickerField';
import type { SheetHandle } from '@/src/ui/pickers/HostedSheet';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { STOCK_CATEGORY_CODES, STOCK_CATEGORY_LABELS } from '@haksan/shared';
import { useCompany } from '@/src/api/companies.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import { useWarehouses } from '@/src/api/inventory.hooks';
import { useCreateShipment, useShipmentCompanyOptions } from '@/src/api/logistics.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Field } from '@/src/ui';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, DayField, FormSection, ProductPicker } from '@/src/ui/service/fields';
import { InventorySerialSelect } from '@/src/ui/select/fields';
import {
  buildShipmentPayload,
  dayInput,
  defaultTrackingNo,
  emptyShipmentLine,
  PACKAGE_UNIT_LABELS,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_ORDER,
  TRANSPORT_MODE_LABELS,
  type ShipmentDraft,
  type ShipmentLineDraft,
} from '@/src/ui/service/logistics';

type Line = ShipmentLineDraft & { key: string };
type TransportMode = ShipmentDraft['transportMode'];

const DIRECTION_OPTIONS = [
  { value: 'incoming' as const, label: '↓ Gelen Sevkiyat' },
  { value: 'outgoing' as const, label: '↑ Giden Sevkiyat' },
];
const MODE_OPTIONS = (Object.keys(TRANSPORT_MODE_LABELS) as TransportMode[]).map((value) => ({ value, label: TRANSPORT_MODE_LABELS[value]! }));
const STATUS_OPTIONS = SHIPMENT_STATUS_ORDER.map((value) => ({ value, label: SHIPMENT_STATUS_LABELS[value]! }));
const CATEGORY_OPTIONS = STOCK_CATEGORY_CODES.map((value) => ({ value, label: STOCK_CATEGORY_LABELS[value] }));
// Web gibi: ayarlardaki `shipment-package-units` listesi; boş/erişilemezse sabit birimler.
const DEFAULT_UNIT_OPTIONS = Object.entries(PACKAGE_UNIT_LABELS).map(([value, label]) => ({ value, label }));

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

let lineSeq = 0;
const newLine = (): Line => ({ ...emptyShipmentLine(), key: `line-${++lineSeq}` });

function addressSnapshot(address: { fullAddress: string | null; street: string | null; buildingNumber: string | null; district: string | null; province: string | null; country: string }) {
  return address.fullAddress?.trim() || [[address.street, address.buildingNumber].filter(Boolean).join(' '), address.district, address.province, address.country].filter(Boolean).join(', ');
}

/** Web CreateShipmentDialog ("Yeni Sevkiyat"). */
export default function ShipmentNewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string; opportunityId?: string; opportunityName?: string }>();
  const canCreate = useCan('shipments.create');
  const create = useCreateShipment();
  const warehouses = useWarehouses();
  const packageUnits = useLookup('shipment-package-units');
  const unitOptions = packageUnits.data?.length
    ? packageUnits.data.map((row) => ({ value: row.code, label: row.name }))
    : DEFAULT_UNIT_OPTIONS;
  const [company, setCompany] = useState<PickedRecord | null>(
    first(params.companyId) ? { id: first(params.companyId), name: first(params.companyName) || 'Seçili firma' } : null,
  );
  const [draft, setDraft] = useState<Omit<ShipmentDraft, 'lines'>>(() => ({
    direction: 'outgoing',
    companyId: first(params.companyId),
    opportunityId: first(params.opportunityId),
    deliveryAddressId: '',
    senderCompanyId: '',
    senderName: '',
    transportMode: 'road',
    carrierCompanyId: '',
    carrier: '',
    productCategoryCode: 'TEZGAH',
    destinationWarehouseId: '',
    destination: '',
    deliveryAddressSnapshot: '',
    trackingNo: defaultTrackingNo(Math.random()),
    origin: '',
    loadingDate: dayInput(new Date()),
    eta: dayInput(new Date()),
    statusCode: 'preparing',
    notes: '',
  }));
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);

  const senders = useShipmentCompanyOptions({ purpose: 'sender' }, canCreate);
  const carriers = useShipmentCompanyOptions({ purpose: 'carrier', transportMode: draft.transportMode }, canCreate);
  const detail = useCompany(draft.companyId);
  const opportunitySheet = useRef<SheetHandle>(null);
  const [opportunityLabel, setOpportunityLabel] = useState(first(params.opportunityName));

  const addresses = useMemo(() => detail.data?.addresses ?? [], [detail.data]);

  if (!canCreate) return <Redirect href={'/modules/shipments' as Href} />;

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateLine = (key: string, patch: Partial<ShipmentLineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const pickCompany = (next: PickedRecord | null) => {
    setCompany(next);
    setOpportunityLabel('');
    setDraft((current) => ({ ...current, companyId: next?.id ?? '', opportunityId: '', deliveryAddressId: '', deliveryAddressSnapshot: '', destination: current.destinationWarehouseId ? current.destination : '' }));
  };

  const submit = () => {
    const built = buildShipmentPayload({ ...draft, lines });
    if ('error' in built) return toast.error(built.error);
    create.mutate(built.body, {
      onSuccess: (row) => {
        toast.success(`Sevkiyat oluşturuldu · ${draft.trackingNo} · ${TRANSPORT_MODE_LABELS[draft.transportMode]}`);
        router.replace(`/modules/shipments/${row.id}` as Href);
      },
      onError: (error) => toast.error(`Sevkiyat oluşturulamadı: ${error.message}`),
    });
  };

  const senderOptions = (senders.data ?? []).map((row) => ({ value: row.id, label: row.shortName ?? row.legalTitle }));
  const carrierOptions = (carriers.data ?? []).map((row) => ({
    value: row.id,
    label: row.shortName ?? row.legalTitle,
    hint: row.supplierCategoryCode === 'transportation' ? 'Nakliye' : 'Lojistik',
  }));

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Sevkiyat', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-[13px] text-muted-foreground">
            Gelen veya giden sevkiyatı; seri no, paket adedi ve paket birimiyle kaydedin.
          </Text>
          <FormSection title="Sevkiyat">
            <ChoiceChips label="Sevkiyat yönü" value={draft.direction} options={DIRECTION_OPTIONS} onChange={(value) => set('direction', value)} />
            <CompanyPicker label="Müşteri" placeholder="Bağımsız sevkiyat" value={company} onChange={pickCompany} />
            <PickerField label="Satış Kartı" value={draft.opportunityId ? opportunityLabel || 'Seçili satış kartı' : ''}
              placeholder={draft.companyId ? 'Bağımsız kayıt' : 'Önce müşteri seçin'} icon="briefcase-outline" disabled={!draft.companyId}
              onPress={() => opportunitySheet.current?.present()} onClear={() => { set('opportunityId', ''); setOpportunityLabel(''); }} />

            <OptionPicker
              label="Gönderici Firma *"
              value={draft.senderCompanyId || null}
              displayValue={draft.senderCompanyId ? undefined : draft.senderName}
              options={senderOptions}
              placeholder="Firma seçin veya yazın"
              icon="business-outline"
              searchable
              allowFreeText
              clearable
              onChange={(value) => setDraft((current) => ({ ...current, senderCompanyId: value ?? '', senderName: '' }))}
              onFreeText={(text) => setDraft((current) => ({ ...current, senderCompanyId: '', senderName: text }))}
            />
            <ChoiceChips
              label="Sevkiyat Türü *"
              value={draft.transportMode}
              options={MODE_OPTIONS}
              onChange={(value) => setDraft((current) => ({ ...current, transportMode: value, carrierCompanyId: '', carrier: current.carrierCompanyId ? '' : current.carrier }))}
            />
            <OptionPicker
              label="Taşıyıcı Firma *"
              value={draft.carrierCompanyId || null}
              displayValue={draft.carrierCompanyId ? undefined : draft.carrier}
              options={carrierOptions}
              placeholder="Firma seçin veya yazın"
              icon="car-outline"
              searchable
              allowFreeText
              clearable
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  carrierCompanyId: value ?? '',
                  carrier: carrierOptions.find((option) => option.value === value)?.label ?? '',
                }))
              }
              onFreeText={(text) => setDraft((current) => ({ ...current, carrierCompanyId: '', carrier: text }))}
            />
            <OptionPicker
              label="Ürün Kategorisi"
              value={draft.productCategoryCode}
              options={CATEGORY_OPTIONS}
              icon="pricetags-outline"
              onChange={(value) => {
                set('productCategoryCode', value ?? 'TEZGAH');
                setLines([newLine()]);
              }}
            />
          </FormSection>

          <FormSection title="Rota">
            <OptionPicker
              label="Varış Yeri *"
              value={draft.destinationWarehouseId || null}
              displayValue={draft.destinationWarehouseId ? undefined : draft.deliveryAddressId ? '' : draft.destination}
              options={(warehouses.data ?? []).map((row) => ({ value: row.id, label: row.name, hint: row.type }))}
              placeholder="Depo seçin veya yazın"
              icon="cube-outline"
              searchable
              allowFreeText
              clearable
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  destinationWarehouseId: value ?? '',
                  deliveryAddressId: '',
                  deliveryAddressSnapshot: '',
                  destination: (warehouses.data ?? []).find((row) => row.id === value)?.name ?? '',
                }))
              }
              onFreeText={(text) =>
                setDraft((current) => ({ ...current, destinationWarehouseId: '', deliveryAddressId: '', deliveryAddressSnapshot: '', destination: text }))
              }
            />
            <OptionPicker
              label="Firma Teslimat Adresi"
              value={draft.deliveryAddressId || null}
              options={addresses.map((row) => ({ value: row.id, label: addressSnapshot(row), hint: row.isDefault ? 'Varsayılan' : null }))}
              placeholder={draft.companyId ? 'Firma adresi kullanılmayacak' : 'Önce müşteri seçin'}
              icon="location-outline"
              disabled={!draft.companyId}
              clearable
              onChange={(value) => {
                const address = addresses.find((row) => row.id === value);
                const snapshot = address ? addressSnapshot(address) : '';
                setDraft((current) => ({ ...current, deliveryAddressId: address?.id ?? '', deliveryAddressSnapshot: snapshot, destinationWarehouseId: '', destination: snapshot.slice(0, 255) }));
              }}
            />
            <Field label="Takip No *" value={draft.trackingNo} onChangeText={(value) => set('trackingNo', value)} placeholder="TRK-000000" maxLength={128} autoCapitalize="characters" />
            <Field label="Çıkış" value={draft.origin} onChangeText={(value) => set('origin', value)} placeholder="Hamburg" maxLength={255} />
            <DayField label="Yüklenme Tarihi" value={draft.loadingDate} onChange={(value) => set('loadingDate', value)} />
            <DayField label="Tahmini Varış (ETA)" value={draft.eta} onChange={(value) => set('eta', value)} />
            <OptionPicker label="Durum" value={draft.statusCode} options={STATUS_OPTIONS} icon="flag-outline" onChange={(value) => set('statusCode', value ?? 'preparing')} />
          </FormSection>

          <FormSection title="Ürün ve Paket Satırları">
            {lines.map((line, index) => (
              <View key={line.key} className="gap-3 rounded-control border border-border p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-inter-semibold text-[14px] text-foreground">Satır {index + 1}</Text>
                  <Button
                    label="Sil"
                    variant="ghost"
                    disabled={lines.length === 1}
                    accessibilityLabel={`Satır ${index + 1} sil`}
                    onPress={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                  />
                </View>
                <ProductPicker
                  label="Ürün *"
                  value={line.productModelId ? { id: line.productModelId, name: line.productLabel || line.description } : null}
                  categoryCodes={[draft.productCategoryCode]}
                  onChange={(product) => {
                    const label = product ? [product.brand?.name, product.modelName ?? product.modelCode].filter(Boolean).join(' ') || product.fullName : '';
                    updateLine(line.key, {
                      productModelId: product?.id ?? '',
                      productLabel: label,
                      description: label || line.description,
                      ...(product?.id !== line.productModelId ? { inventoryItemId: '', serialNumber: '' } : {}),
                    });
                  }}
                />
                <InventorySerialSelect
                  categoryCode={draft.productCategoryCode}
                  productModelId={line.productModelId || null}
                  value={line.serialNumber}
                  selectedId={line.inventoryItemId || null}
                  onSelect={(item) => {
                    const stock = item?.data;
                    if (!stock) {
                      updateLine(line.key, { inventoryItemId: '', serialNumber: item?.label.slice(0, 128) ?? '' });
                      return;
                    }
                    const label = [stock.brand?.name, stock.product?.fullName ?? stock.product?.modelCode].filter(Boolean).join(' ');
                    updateLine(line.key, {
                      inventoryItemId: stock.id,
                      serialNumber: stock.serialNumber,
                      ...(stock.product ? { productModelId: stock.product.id, productLabel: label || line.productLabel } : {}),
                      description: line.description || label,
                    });
                  }}
                />
                <Field label="Açıklama *" value={line.description} onChangeText={(value) => updateLine(line.key, { description: value })} placeholder="Ürün açıklaması" maxLength={500} />
                <View className="flex-row gap-3">
                  <View className="flex-1"><Field label="Adet" value={line.quantity} onChangeText={(value) => updateLine(line.key, { quantity: value })} keyboardType="decimal-pad" /></View>
                  <View className="flex-1"><Field label="Paket Adedi" value={line.packageQuantity} onChangeText={(value) => updateLine(line.key, { packageQuantity: value })} keyboardType="number-pad" /></View>
                </View>
                <OptionPicker label="Paket Birimi" value={line.packageUnitCode} options={unitOptions} icon="cube-outline" onChange={(value) => updateLine(line.key, { packageUnitCode: value ?? 'package' })} />
                <View className="flex-row gap-3">
                  <View className="flex-1"><Field label="Uzunluk cm" value={line.packageLengthCm} onChangeText={(value) => updateLine(line.key, { packageLengthCm: value })} keyboardType="decimal-pad" /></View>
                  <View className="flex-1"><Field label="Genişlik cm" value={line.packageWidthCm} onChangeText={(value) => updateLine(line.key, { packageWidthCm: value })} keyboardType="decimal-pad" /></View>
                </View>
                <View className="flex-row gap-3">
                  <View className="flex-1"><Field label="Yükseklik cm" value={line.packageHeightCm} onChangeText={(value) => updateLine(line.key, { packageHeightCm: value })} keyboardType="decimal-pad" /></View>
                  <View className="flex-1"><Field label="Brüt kg" value={line.grossWeightKg} onChangeText={(value) => updateLine(line.key, { grossWeightKg: value })} keyboardType="decimal-pad" /></View>
                </View>
                <Field label="Paket Notu" value={line.packageNotes} onChangeText={(value) => updateLine(line.key, { packageNotes: value })} placeholder="Paket bilgisi" maxLength={500} />
              </View>
            ))}
            <Button label="Satır" variant="ghost" trailingIcon="add" onPress={() => setLines((current) => [...current, newLine()])} />
          </FormSection>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <Button className="flex-1" label="Vazgeç" variant="ghost" disabled={create.isPending} onPress={() => router.back()} />
          <Button className="flex-[2]" label="Sevkiyatı Kaydet" loading={create.isPending} disabled={create.isPending} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
      <OpportunityPickerSheet sheetRef={opportunitySheet} companyId={draft.companyId || null} view="all" selectedId={draft.opportunityId}
        onSelect={(row) => { set('opportunityId', row.id); setOpportunityLabel(row.title); }} />
    </SafeAreaView>
  );
}
