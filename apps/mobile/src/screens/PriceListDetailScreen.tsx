import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { productService } from '@/src/api/services';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { InfoCard } from '@/src/ui/DetailLayout';
import { colors, typography } from '@/src/theme/tokens';

/** Stitch #55 Satış Fiyat Listesi — kalem detayı */
export function PriceListDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    void productService.listPriceListItems(id).then((rows) => {
      setItems(rows as Record<string, unknown>[]);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <FormPageLayout title={name ?? 'Fiyat Listesi'} subtitle={`${items.length} kalem`}>
      {items.length === 0 ? (
        <Text style={styles.empty}>Kalem yok</Text>
      ) : (
        items.map((item, i) => (
          <InfoCard
            key={String(item.id ?? i)}
            label={String(item.productCode ?? item.sku ?? 'SKU')}
            value={`${String(item.description ?? item.productName ?? '—')} · ${String(item.unitPrice ?? item.listPrice ?? '')}`}
          />
        ))
      )}
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', paddingVertical: 32 },
});
