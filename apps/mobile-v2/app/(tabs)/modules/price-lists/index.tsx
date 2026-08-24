import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { usePriceListItems, usePriceLists, useUpdatePriceListItem } from '@/src/api/inventory.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import { Button, ListSkeleton, EmptyState, ErrorState, FilterChips, Field, Loading, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useTheme } from '@/src/theme/theme';
import { SyncStatus } from '@/src/ui/SyncStatus';

type PriceListItemRow = {
  item: {
    id: string;
    listPrice: string | null;
    cashPrice: string | null;
    campaignPrice: string | null;
    campaignIsActive: boolean | null;
  };
  product?: { fullName?: string | null; modelCode?: string | null } | null;
};

export default function PriceListsScreen() {
  const { colors } = useTheme();
  const editSheet = useRef<BottomSheetModal>(null);
  const [search, setSearch] = useState('');
  const [listId, setListId] = useState<string | null>(null);

  const lists = usePriceLists();
  // Ekran açıldığında aktif ilk listeyi seç; kullanıcı boş tabloya bakmasın.
  useEffect(() => {
    if (!listId && lists.data?.length) {
      setListId((lists.data.find((l) => l.isActive) ?? lists.data[0])!.id);
    }
  }, [lists.data, listId]);

  const selected = lists.data?.find((l) => l.id === listId) ?? null;
  const items = usePriceListItems(listId ?? '');
  const updateItem = useUpdatePriceListItem();

  // Satır fiyat düzenleme sayfası
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [listPrice, setListPrice] = useState('');
  const [cashPrice, setCashPrice] = useState('');
  const [campaignPrice, setCampaignPrice] = useState('');

  function beginEdit(row: PriceListItemRow) {
    setEditingRow(row.item.id);
    editSheet.current?.present();
    setListPrice(row.item.listPrice ?? '');
    setCashPrice(row.item.cashPrice ?? '');
    setCampaignPrice(row.item.campaignIsActive ? row.item.campaignPrice ?? '' : '');
  }

  function submitEdit() {
    if (!editingRow || !listId) return;
    updateItem.mutate(
      {
        listId,
        itemId: editingRow,
        body: {
          ...(listPrice.trim() ? { listPrice: Number(listPrice.replace(',', '.')) } : {}),
          ...(cashPrice.trim() ? { cashPrice: Number(cashPrice.replace(',', '.')) } : {}),
          ...(campaignPrice.trim()
            ? { campaignPrice: Number(campaignPrice.replace(',', '.')), campaignIsActive: true }
            : { campaignIsActive: false }),
        },
      },
      {
        onSuccess: () => {
          toast.success('Fiyat güncellendi');
          void items.refetch();
          setEditingRow(null);
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    return (items.data ?? []).filter(
      (row) =>
        !term ||
        [row.product?.fullName, row.product?.modelCode]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('tr')
          .includes(term)
    );
  }, [items.data, search]);

  const currency = selected?.currency?.code ?? 'TRY';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Fiyat Listeleri" subtitle="Ürün ve hizmet satış fiyatlarını görüntüleyin." />

      {lists.isPending ? (
        <ListSkeleton />
      ) : lists.error ? (
        <ErrorState message={lists.error.message} onRetry={() => void lists.refetch()} />
      ) : (
        <>
          <View className="pb-2">
            <StatStrip
              items={[
                { label: 'Aktif Fiyat Listesi', value: String((lists.data ?? []).filter((l) => l.isActive).length) },
                { label: 'Toplam Ürün', value: String(items.data?.length ?? 0) },
              ]}
            />
          </View>

          <View className="gap-2 pb-2">
            <FilterChips
              options={(lists.data ?? []).map((list) => ({ value: list.id, label: list.name }))}
              value={listId}
              onChange={setListId}
              allLabel="Seçiniz"
            />
            <SearchBar value={search} onChange={setSearch} placeholder="Ürün adı veya kod" />
          </View>

          {selected ? (
            <View className="mx-4 mb-2 flex-row items-center justify-between rounded-surface border border-border bg-card px-3.5 py-2.5">
              <View className="flex-1">
                <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={1}>
                  {selected.name}
                </Text>
                <Text className="font-inter text-[12px] text-muted-foreground">
                  {selected.validFrom ? formatDate(selected.validFrom) : '—'}
                  {selected.validUntil ? ` – ${formatDate(selected.validUntil)}` : ''}
                </Text>
              </View>
              <Text className="font-inter-semibold text-[13px] text-muted-foreground">
                {rows.length} ürün · {currency}
              </Text>
            </View>
          ) : null}

          {items.isPending && listId ? (
            <Loading />
          ) : (
            <FlashList
              data={rows}
              keyExtractor={(row) => row.item.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
              renderItem={({ item: row }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${row.product?.fullName ?? 'Ürün'} fiyatını düzenle`}
                  onPress={() => beginEdit(row)}
                  className="my-1 gap-1.5 rounded-overlay border border-border bg-card px-3.5 py-3 active:opacity-70"
                >
                  <Text className="text-[14px] font-inter-semibold text-foreground" numberOfLines={2}>
                    {row.product?.fullName ?? '—'}
                  </Text>
                  <Text className="font-inter text-[12px] text-muted-foreground">{row.product?.modelCode}</Text>
                  <View className="flex-row gap-4 pt-1">
                    <View className="flex-1">
                      <Text className="font-inter text-[11px] text-muted-foreground">Liste</Text>
                      <Text className="font-inter-semibold text-[13px] text-foreground">
                        {formatAmount(row.item.listPrice, currency)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-inter text-[11px] text-muted-foreground">Peşin</Text>
                      <Text className="font-inter-semibold text-[13px] text-destructive">
                        {formatAmount(row.item.cashPrice, currency)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-inter text-[11px] text-muted-foreground">Kampanya</Text>
                      <Text
                        className={`font-inter-semibold text-[13px] ${
                          row.item.campaignIsActive ? 'text-success' : 'text-muted-foreground'
                        }`}
                      >
                        {row.item.campaignIsActive ? formatAmount(row.item.campaignPrice, currency) : '—'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              )}
              refreshing={items.isRefetching}
              onRefresh={() => void items.refetch()}
              ListEmptyComponent={
                <EmptyState
                  title={listId ? 'Bu listede ürün yok' : 'Fiyat listesi seçin'}
                  hint={listId && search ? 'Aramayı değiştirin.' : undefined}
                />
              }
            />
          )}
        </>
      )}

      <BottomSheetModal
        ref={editSheet}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Fiyat Düzenle</Text>
          {(() => {
            const row = rows.find((r) => r.item.id === editingRow);
            if (!row) return null;
            return (
              <>
                <Text className="font-inter text-sm text-muted-foreground" numberOfLines={1}>{row.product?.fullName ?? '—'}</Text>
                <Field label="Liste fiyatı" value={listPrice} onChangeText={setListPrice} keyboardType="decimal-pad" />
                <Field label="Peşin fiyat" value={cashPrice} onChangeText={setCashPrice} keyboardType="decimal-pad" />
                <Field label="Kampanya fiyatı" value={campaignPrice} onChangeText={setCampaignPrice} keyboardType="decimal-pad" />
                <Button label="Kaydet" onPress={submitEdit} loading={updateItem.isPending} disabled={updateItem.isPending} />
              </>
            );
          })()}
          <View style={{ height: 4 }} />
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
