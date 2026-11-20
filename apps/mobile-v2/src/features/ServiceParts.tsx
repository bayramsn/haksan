import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { productsApi, type ServiceTicket, type WarrantyClaim } from '@/src/api/endpoints';
import { useSetWarrantyParts } from '@/src/api/operations.hooks';
import { useConsumeServicePart } from '@/src/api/service.endpoints';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { ChoiceChips } from '@/src/features/ChoiceChips';
import { Button, Card, Eyebrow, Field, Loading, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const PART_CATEGORIES = [
  { value: 'YEDEK_PARCA', label: 'Yedek parça' },
  { value: 'AKSESUAR', label: 'Aksesuar' },
] as const;
type PartCategory = (typeof PART_CATEGORIES)[number]['value'];

/** Web "Yedek Parça / Aksesuar Kullanımı": stoktan düşer ve servis işlemlerine satır ekler. */
export function PartUsageCard({ ticket }: { ticket: Pick<ServiceTicket, 'id' | 'companyId' | 'metadata'> }) {
  const consume = useConsumeServicePart(ticket);
  const [category, setCategory] = useState<PartCategory>('YEDEK_PARCA');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const products = useQuery({
    queryKey: ['products', 'list', { search: debounced, categoryCode: category, picker: true }],
    queryFn: () => productsApi.list({ page: 1, pageSize: 20, search: debounced || undefined, categoryCode: category }),
    enabled: !picked,
  });

  function submit() {
    if (!picked) return;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) return toast.error('Adet 1 veya daha büyük olmalı.');
    consume.mutate(
      { productModelId: picked.id, label: picked.label, quantity: qty, notes: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Parça stoktan düşüldü');
          setPicked(null);
          setQuantity('1');
          setNote('');
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  return (
    <Card className="gap-3">
      <Eyebrow>Parça kullan</Eyebrow>
      {picked ? (
        <>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 font-inter-semibold text-sm text-foreground" numberOfLines={2}>{picked.label}</Text>
            <Pressable accessibilityRole="button" onPress={() => setPicked(null)} hitSlop={10}>
              <Text className="font-inter-medium text-sm text-primary">Değiştir</Text>
            </Pressable>
          </View>
          <Field label="Adet" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={6} />
          <Field label="Not" value={note} onChangeText={setNote} maxLength={1000} />
          <Button label="Stoktan Düş" loading={consume.isPending} disabled={consume.isPending} onPress={submit} />
        </>
      ) : (
        <>
          <ChoiceChips options={PART_CATEGORIES} value={category} onChange={setCategory} />
          <SearchBar value={search} onChange={setSearch} placeholder="Model veya stok kodu ara" />
          {products.isPending ? <Loading /> : products.error ? (
            <Text className="font-inter text-sm text-destructive">{products.error.message}</Text>
          ) : (products.data?.data ?? []).length === 0 ? (
            <Text className="font-inter text-sm text-muted-foreground">Ürün bulunamadı.</Text>
          ) : (
            (products.data?.data ?? []).map((product) => {
              const label = [product.fullName || product.modelCode, product.stockCode ? `(${product.stockCode})` : null].filter(Boolean).join(' ');
              return (
                <Pressable
                  key={product.id}
                  accessibilityRole="button"
                  onPress={() => setPicked({ id: product.id, label })}
                  className="min-h-11 justify-center border-b border-border py-2 active:opacity-70"
                >
                  <Text className="font-inter text-sm text-foreground" numberOfLines={2}>{label}</Text>
                </Pressable>
              );
            })
          )}
        </>
      )}
    </Card>
  );
}

const ACTIONS = [
  { value: 'replace', label: 'Değişim' },
  { value: 'repair', label: 'Onarım' },
  { value: 'return', label: 'İade' },
  { value: 'investigate', label: 'İnceleme' },
] as const;
const SOURCES = [
  { value: 'stock', label: 'Stok' },
  { value: 'supplier', label: 'Tedarikçi' },
  { value: 'customer', label: 'Müşteri' },
  { value: 'service', label: 'Servis' },
] as const;
type PartAction = (typeof ACTIONS)[number]['value'];
type PartSource = (typeof SOURCES)[number]['value'];

export const WARRANTY_ACTION_LABEL: Record<string, string> = Object.fromEntries(ACTIONS.map((a) => [a.value, a.label]));

/**
 * Garanti / RMA parça satırı ekleme ve kaldırma. Sunucu tüm listeyi PUT ile
 * değiştirir; mevcut satırlar id'leriyle geri gönderilir (web ile aynı).
 */
export function WarrantyPartsEditor({ ticketId, claim }: { ticketId: string; claim: WarrantyClaim }) {
  const setParts = useSetWarrantyParts(ticketId);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [action, setAction] = useState<PartAction>('replace');
  const [source, setSource] = useState<PartSource>('stock');
  const [charge, setCharge] = useState(false);

  const current = claim.parts.map((part) => ({
    id: part.id,
    description: part.description,
    quantity: Number(part.quantity) || 1,
    actionType: part.actionType ?? undefined,
    supplierRmaStatus: part.supplierRmaStatus,
    chargeToCustomer: Boolean(part.chargeToCustomer),
    unitCost: part.unitCost,
    currency: part.currency ?? undefined,
    // PUT tüm listeyi silip yeniden yazar: kaynak, ürün/stok bağı ve not kaybolmasın.
    source: (part.source ?? undefined) as PartSource | undefined,
    productModelId: part.productModelId ?? undefined,
    inventoryItemId: part.inventoryItemId ?? undefined,
    notes: part.notes ?? undefined,
  }));

  function add() {
    const qty = Number(quantity);
    if (!description.trim()) return toast.error('Parça / işlem açıklaması yazın.');
    if (!Number.isInteger(qty) || qty < 1) return toast.error('Adet 1 veya daha büyük olmalı.');
    const next = [
      ...current,
      { description: description.trim(), quantity: qty, actionType: action, source, chargeToCustomer: charge, currency: claim.costCurrency ?? 'USD' },
    ];
    setParts.mutate(next, {
      onSuccess: () => {
        toast.success('Garanti parça satırı eklendi');
        setDescription('');
        setQuantity('1');
        setCharge(false);
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function remove(index: number) {
    Alert.alert('Satır kaldırılsın mı?', claim.parts[index]?.description, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: () => setParts.mutate(current.filter((_, i) => i !== index), {
          onSuccess: () => toast.success('Satır kaldırıldı'),
          onError: (error) => toast.error(error.message),
        }),
      },
    ]);
  }

  return (
    <View className="gap-1.5">
      <View className="px-1"><Eyebrow>Garanti / RMA parçaları ({claim.parts.length})</Eyebrow></View>
      <Card className="gap-3">
        {claim.parts.map((part, index) => (
          <View key={part.id} className={`flex-row items-start gap-3 ${index > 0 ? 'border-t border-border pt-2.5' : ''}`}>
            <View className="flex-1 gap-0.5">
              <Text className="font-inter-medium text-[13px] text-foreground" numberOfLines={2}>{part.description}</Text>
              <Text className="font-inter text-[11px] text-muted-foreground">
                {[`${Number(part.quantity)} adet`, part.actionType ? WARRANTY_ACTION_LABEL[part.actionType] ?? part.actionType : null, part.chargeToCustomer ? 'Müşteriye yansıtılır' : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`${part.description} satırını kaldır`} hitSlop={10} onPress={() => remove(index)} disabled={setParts.isPending}>
              <Text className="font-inter-medium text-[13px] text-destructive">Kaldır</Text>
            </Pressable>
          </View>
        ))}
        <View className={`gap-3 ${claim.parts.length ? 'border-t border-border pt-3' : ''}`}>
          <Field label="Parça / işlem" value={description} onChangeText={setDescription} placeholder="Değişecek parça veya RMA işlemi" maxLength={1000} />
          <Field label="Adet" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={6} />
          <ChoiceChips options={ACTIONS} value={action} onChange={setAction} />
          <ChoiceChips options={SOURCES} value={source} onChange={setSource} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: charge }} onPress={() => setCharge((v) => !v)} className="min-h-11 flex-row items-center gap-2">
            <View className={`h-5 w-5 items-center justify-center rounded border ${charge ? 'border-primary bg-primary' : 'border-border'}`}>
              {charge ? <Text className="font-inter-semibold text-[12px] text-primary-foreground">✓</Text> : null}
            </View>
            <Text className="font-inter text-sm text-foreground">Müşteriye yansıt</Text>
          </Pressable>
          <Button label="Satır Ekle" variant="ghost" loading={setParts.isPending} disabled={setParts.isPending} onPress={add} />
        </View>
      </Card>
    </View>
  );
}
