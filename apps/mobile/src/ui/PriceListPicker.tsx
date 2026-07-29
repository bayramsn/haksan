import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { productService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { ListRow } from '@/src/ui/ListRow';
import { SheetHeader } from '@/src/ui/SheetHeader';
import { TabStrip } from '@/src/ui/TabStrip';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

type PriceItem = {
  id: string;
  productModelId?: string;
  description?: string;
  productName?: string;
  stockCode?: string;
  unitPrice?: number;
  listPrice?: number;
  cashPrice?: number;
  vatRate?: number;
  currencyCode?: string;
};

function normalizePriceRow(row: unknown): PriceItem | null {
  const r = row as {
    item?: {
      id?: string;
      productModelId?: string;
      listPrice?: string | number;
      cashPrice?: string | number;
      vatRate?: string | number;
    };
    product?: { id?: string; modelCode?: string; fullName?: string };
  };
  const productModelId = r.product?.id ?? r.item?.productModelId;
  if (!productModelId && !r.product?.fullName) return null;
  const unitPrice = r.item?.cashPrice ?? r.item?.listPrice;
  return {
    id: r.item?.id ?? productModelId ?? Math.random().toString(36).slice(2),
    productModelId,
    stockCode: r.product?.modelCode,
    description: r.product?.fullName,
    productName: r.product?.fullName,
    unitPrice: unitPrice != null ? Number(unitPrice) : undefined,
    listPrice: r.item?.listPrice != null ? Number(r.item.listPrice) : undefined,
    vatRate: r.item?.vatRate != null ? Number(r.item.vatRate) : undefined,
  };
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (item: PriceItem) => void;
};

export type { PriceItem };
export function PriceListPicker({ visible, onClose, onPick }: Props) {
  const [lists, setLists] = useState<Record<string, unknown>[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const [items, setItems] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void productService.listPriceLists({ pageSize: 20 }).then((res) => {
      const rows = normalizeList(res);
      setLists(rows);
      if (rows[0]?.id) setListId(String(rows[0].id));
    });
  }, [visible]);

  useEffect(() => {
    if (!listId) return;
    setLoading(true);
    void productService.listPriceListItems(listId).then((rows) => {
      setItems((rows as unknown[]).map(normalizePriceRow).filter(Boolean) as PriceItem[]);
      setLoading(false);
    });
  }, [listId]);

  const listTabs = lists.map((l) => ({
    key: String(l.id),
    label: String(l.name ?? 'Liste'),
  }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <SheetHeader title="Fiyat Listesi" onClose={onClose} />
        {listTabs.length > 0 && listId ? (
          <TabStrip tabs={listTabs} value={listId} onChange={setListId} variant="pill" />
        ) : null}
        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : (
          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={(i, idx) => i.id ?? String(idx)}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ListRow
                title={item.description ?? item.productName ?? 'Kalem'}
                subtitle={`${Number(item.unitPrice ?? item.listPrice ?? 0).toLocaleString('tr-TR')} ${item.currencyCode ?? 'TRY'}`}
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
              />
            )}
            ListEmptyComponent={<Text style={styles.empty}>Kalem yok</Text>}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.canvas },
  loader: { marginTop: spacing.xxl },
  list: { flex: 1 },
  listContent: { padding: layout.screenPadding, paddingTop: spacing.sm },
  empty: { ...typography.bodySm, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxxl },
});
