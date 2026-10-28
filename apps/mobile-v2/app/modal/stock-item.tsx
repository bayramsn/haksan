import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useCan } from '@/src/auth/AuthProvider';
import {
  useAllInventory,
  useCreateInventoryItem,
  useInventoryItem,
  useUpdateInventoryFields,
  useWarehouses,
} from '@/src/api/inventory.hooks';
import { useAllProducts } from '@/src/api/products.hooks';
import { stockApi, type InventoryItemBody } from '@/src/api/products.api';
import { ErrorState, Field, Loading } from '@/src/ui';
import { MultiOptionPicker, OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { SuggestionSelect } from '@/src/ui/select/fields';
import { toast } from '@/src/ui/toast';
import { DateInputField, FormScreen, Segmented } from '@/src/ui/finance/kit';
import {
  STOCK_CATEGORY_TABS,
  STOCK_CONDITION_OPTIONS,
  STOCK_CREATE_STATUS_OPTIONS,
  bulkSerials,
  stockCategory,
  stockExtraNotes,
  validateStockForm,
} from '@/src/ui/products/stock-logic';

type Condition = InventoryItemBody['itemCondition'];
const MODES = [
  { value: 'single', label: 'Tekli' },
  { value: 'bulk', label: 'Toplu' },
] as const;

/** Web `CreateStockDialog` (Yeni Stok Kalemi) ve `EditStockDialog` (Stok Kalemini Düzenle). */
export default function StockItemScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);
  const allowed = useCan(editing ? 'inventory.update' : 'inventory.create');

  const existing = useInventoryItem(id);
  const stock = useAllInventory();
  const products = useAllProducts();
  const warehouses = useWarehouses();
  const create = useCreateInventoryItem();
  const update = useUpdateInventoryFields(id);

  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [quantity, setQuantity] = useState('5');
  const [categoryCode, setCategoryCode] = useState('TEZGAH');
  const [productModelId, setProductModelId] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [serialNumber, setSerialNumber] = useState('');
  const [controlUnit, setControlUnit] = useState('');
  const [controlUnitSerial, setControlUnitSerial] = useState('');
  const [condition, setCondition] = useState<Condition>('new');
  const [warehouseId, setWarehouseId] = useState('');
  const [statusCode, setStatusCode] = useState('available');
  const [loadingDate, setLoadingDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [optionalHardware, setOptionalHardware] = useState('');
  const [spareParts, setSpareParts] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const item = existing.data;
    if (!editing || hydrated || !item) return;
    setCategoryCode(item.category?.code ?? 'TEZGAH');
    setProductModelId(item.product?.id ?? '');
    setSerialNumber(item.serialNumber);
    setControlUnit(item.controlUnit ?? '');
    setControlUnitSerial(item.controlUnitSerialNumber ?? '');
    setCondition((item.itemCondition as Condition) || 'new');
    setWarehouseId(item.warehouse?.id ?? '');
    setLoadingDate(item.loadingDate?.slice(0, 10) ?? '');
    setReceivedDate(item.receivedDate?.slice(0, 10) ?? '');
    setArrivalDate(item.arrivalDate?.slice(0, 10) ?? '');
    setNotes(item.notes ?? '');
    setHydrated(true);
  }, [editing, existing.data, hydrated]);

  const rows = stock.data ?? [];
  const catalog = useMemo(
    () => (products.data ?? []).filter((product) => (product.category?.code ?? 'TEZGAH') === categoryCode),
    [products.data, categoryCode],
  );
  const productOptions = useMemo(
    () =>
      catalog.map((product) => ({
        value: product.id,
        label: product.fullName || [product.brand?.name, product.modelName ?? product.modelCode].filter(Boolean).join(' '),
        hint: [product.brand?.name, product.modelCode].filter(Boolean).join(' · ') || null,
      })),
    [catalog],
  );
  const controlUnitValues = useMemo(
    () => rows.filter((row) => stockCategory(row) === categoryCode).map((row) => row.controlUnit),
    [rows, categoryCode],
  );
  const machineOptions = useMemo(
    () =>
      rows
        .filter((row) => stockCategory(row) === 'TEZGAH' && !row.parentInventoryItemId)
        .map((row) => ({ value: row.id, label: row.product?.fullName ?? row.serialNumber, hint: row.serialNumber })),
    [rows],
  );
  const freeOptionals = useMemo(
    () =>
      rows
        .filter((row) => stockCategory(row) === 'OPSIYONEL_DONANIM' && !row.parentInventoryItemId)
        .map((row) => ({ value: row.id, label: row.product?.fullName ?? row.serialNumber, hint: row.serialNumber })),
    [rows],
  );
  const selectedProduct = catalog.find((product) => product.id === productModelId);
  const isMachine = categoryCode === 'TEZGAH';

  if (!allowed) return <Redirect href={'/modules/inventory' as Href} />;
  if (editing && existing.isPending) return <Loading />;
  if (editing && existing.error) return <ErrorState message={existing.error.message} onRetry={() => void existing.refetch()} />;

  const takenSerials = new Set(rows.filter((row) => row.id !== id).map((row) => row.serialNumber));

  async function submitCreate() {
    const bulk = mode === 'bulk';
    const qty = Number.parseInt(quantity || '0', 10) || 0;
    if (bulk && qty < 1) return toast.error('Adet en az 1 olmalı');
    if (bulk && qty > 100) return toast.error('Tek seferde en fazla 100 kalem');
    if (bulk && qty > 1 && controlUnitSerial.trim()) {
      return toast.error('Her kontrol ünitesinin seri numarası ayrıdır. Seri numaralarını tek tek stok kaydı açarak girin.');
    }
    const serials = bulk ? bulkSerials(selectedProduct?.modelCode ?? '', qty, takenSerials) : [serialNumber.trim()];
    const check = validateStockForm(
      { categoryCode, productModelId, serialNumber: serials[0] ?? '', controlUnit, warehouseId, loadingDate, receivedDate, arrivalDate },
      { mode: 'create', takenSerials },
    );
    if (!check.ok) return toast.error(check.title);
    setSaving(true);
    try {
      const base: Omit<InventoryItemBody, 'serialNumber'> = {
        productModelId,
        parentInventoryItemId: categoryCode === 'OPSIYONEL_DONANIM' ? parentId : undefined,
        itemCondition: condition,
        controlUnit: controlUnit.trim() || undefined,
        controlUnitSerialNumber: controlUnitSerial.trim() || undefined,
        loadingDate: loadingDate || undefined,
        receivedDate: receivedDate || undefined,
        arrivalDate: arrivalDate || undefined,
        stockStatusCode: statusCode,
        warehouseId: warehouseId || undefined,
        notes: stockExtraNotes(optionalHardware, spareParts) || undefined,
      };
      let created = 0;
      let firstId = '';
      for (const serial of serials) {
        // Sıralı: sunucu seri numarası benzersizliğini her kayıtta kontrol ediyor.
        // eslint-disable-next-line no-await-in-loop
        const result = await create.mutateAsync({ ...base, serialNumber: serial });
        if (!firstId) firstId = result.id;
        created += 1;
      }
      if (!bulk && isMachine && linkedIds.length) {
        await Promise.all(linkedIds.map((optionId) => stockApi.updateFields(optionId, { parentInventoryItemId: firstId })));
        void qc.invalidateQueries({ queryKey: ['inventory'] });
      }
      toast.success(bulk ? `${created} adet stok kalemi eklendi` : `Stok kalemi eklendi · ${serials[0]}`);
      router.back();
    } catch (error) {
      toast.error(`Stok kalemi eklenemedi: ${error instanceof Error ? error.message : 'API isteği başarısız oldu.'}`);
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    const check = validateStockForm(
      { categoryCode, productModelId, serialNumber, controlUnit, warehouseId, loadingDate, receivedDate, arrivalDate },
      { mode: 'edit', existingControlUnit: existing.data?.controlUnit, takenSerials },
    );
    if (!check.ok) return toast.error(check.title);
    setSaving(true);
    try {
      await update.mutateAsync({
        productModelId: productModelId || undefined,
        serialNumber: serialNumber.trim(),
        controlUnit: controlUnit.trim(),
        controlUnitSerialNumber: controlUnitSerial.trim(),
        itemCondition: condition,
        warehouseId: warehouseId || undefined,
        loadingDate: loadingDate || undefined,
        receivedDate: receivedDate || undefined,
        arrivalDate: arrivalDate || undefined,
        notes,
      });
      toast.success(`Stok kalemi güncellendi · ${serialNumber.trim()}`);
      router.back();
    } catch (error) {
      toast.error(`Stok kalemi güncellenemedi: ${error instanceof Error ? error.message : 'API isteği başarısız oldu.'}`);
    } finally {
      setSaving(false);
    }
  }

  const qty = Number.parseInt(quantity || '0', 10) || 0;

  return (
    <FormScreen
      title={editing ? 'Stok Kalemini Düzenle' : 'Yeni Stok Kalemi'}
      submitLabel={saving ? 'Kaydediliyor...' : editing ? 'Kaydet' : mode === 'bulk' ? `${qty} Kalem Üret` : 'Stoğa Ekle'}
      submitting={saving}
      onSubmit={() => void (editing ? submitEdit() : submitCreate())}
    >
      {products.isPending || stock.isPending ? <Loading /> : null}
      {editing ? null : (
        <OptionPicker
          label="Stok Kategorisi"
          value={categoryCode}
          options={STOCK_CATEGORY_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
          onChange={(next) => {
            setCategoryCode(next ?? 'TEZGAH');
            setProductModelId('');
            setParentId(null);
            setLinkedIds([]);
          }}
        />
      )}
      {!editing && categoryCode === 'OPSIYONEL_DONANIM' ? (
        <OptionPicker
          label="Bağlı Tezgah"
          value={parentId}
          options={machineOptions}
          placeholder="Bağımsız stok kalemi"
          searchable
          onChange={setParentId}
        />
      ) : null}
      {!editing && isMachine && mode === 'single' && freeOptionals.length ? (
        <MultiOptionPicker
          label="Bağlanacak Opsiyonel Donanımlar"
          values={linkedIds}
          options={freeOptionals}
          onChange={setLinkedIds}
        />
      ) : null}
      {editing ? null : <Segmented value={mode} options={MODES} onChange={setMode} />}
      <OptionPicker
        label={editing ? 'Ürün' : 'Ürün Adı *'}
        value={productModelId || null}
        options={productOptions}
        placeholder={editing ? 'Katalogdan ürün seçin...' : 'Katalogdan ürün adı seçin...'}
        searchable
        onChange={(next) => setProductModelId(next ?? '')}
      />
      {!editing ? (
        <Text className="font-inter text-xs text-muted-foreground">
          Marka ve teknik özellikler seçilen ürün kaydından otomatik alınır; ayrıca model veya sayaç tipi seçilmez.
        </Text>
      ) : null}
      {mode === 'bulk' && !editing ? (
        <View className="gap-1">
          <Field label="Adet" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
          <Text className="font-inter text-xs text-muted-foreground">
            Seri numaraları seçilen ürünün iç model önekinden otomatik üretilir.
          </Text>
        </View>
      ) : (
        <Field label="Seri No *" value={serialNumber} onChangeText={setSerialNumber} placeholder="SN-200-0001" autoCapitalize="characters" />
      )}
      <SuggestionSelect
        label={`Kontrol Ünitesi${isMachine ? ' *' : ''}`}
        placeholder="Kontrol ünitesi seç veya yaz..."
        icon="hardware-chip-outline"
        value={controlUnit}
        values={controlUnitValues}
        loading={stock.isPending}
        onChange={setControlUnit}
      />
      <Field label="Kontrol Ünitesi Seri No" value={controlUnitSerial} onChangeText={setControlUnitSerial} placeholder="Ünitenin seri numarası" />
      <Segmented label="Kondisyon" value={condition} options={STOCK_CONDITION_OPTIONS} onChange={setCondition} />
      <OptionPicker
        label="Fiziksel Konum / Depo"
        value={warehouseId || null}
        options={(warehouses.data ?? []).map((warehouse) => ({
          value: warehouse.id,
          label: warehouse.type ? `${warehouse.name} · ${warehouse.type}` : warehouse.name,
        }))}
        placeholder="Depo seçin"
        onChange={(next) => setWarehouseId(next ?? '')}
      />
      {editing ? null : (
        <OptionPicker
          label="Durum"
          value={statusCode}
          options={STOCK_CREATE_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(next) => setStatusCode(next ?? 'available')}
        />
      )}
      <DateInputField label="Yüklendiği Tarih" value={loadingDate} onChange={setLoadingDate} />
      <DateInputField label="Geldiği Tarih" value={receivedDate} onChange={setReceivedDate} />
      <DateInputField label="Geleceği Tarih" value={arrivalDate} onChange={setArrivalDate} />
      {editing ? (
        <Field label="Notlar (opsiyon donanım / yedek parça)" value={notes} onChangeText={setNotes} multiline />
      ) : (
        <>
          <Field label="Opsiyon Donanım" value={optionalHardware} onChangeText={setOptionalHardware} placeholder="Opsiyon donanım..." />
          <Field label="Yedek Parça" value={spareParts} onChangeText={setSpareParts} placeholder="Yedek parça..." />
        </>
      )}
    </FormScreen>
  );
}
