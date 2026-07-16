import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { productService } from '@/src/api/services';
import { Screen } from '@/src/ui/Screen';
import { productTitle } from '@/src/ui/products/productHelpers';
import {
  ProductDetailFooter,
  ProductDetailTabs,
  ProductDetailTopBar,
  ProductEquipmentSection,
  ProductHeroSection,
  ProductInfoRows,
  ProductMetaRow,
  ProductPriceCard,
  ProductQuickActions,
  ProductSpecList,
  type ProductDetailTab,
} from '@/src/ui/products/ProductDetailWidgets';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

type Props = { id: string };

function pickLabel(data: Record<string, unknown>, key: string, nestedKey = 'name'): string | undefined {
  const nested = data[key] as Record<string, unknown> | undefined;
  if (nested && typeof nested === 'object') {
    const v = nested[nestedKey] ?? nested.code;
    if (v != null && v !== '') return String(v);
  }
  const flat = data[`${key}Name`];
  if (flat != null && flat !== '') return String(flat);
  return undefined;
}

function normalizeSpecs(rows: unknown[]): { key: string; value: string; unit?: string }[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      key: String(r.specKey ?? r.key ?? '—'),
      value: String(r.specValue ?? r.value ?? '—'),
      unit: r.specUnit ? String(r.specUnit) : r.unit ? String(r.unit) : undefined,
    };
  });
}

function splitEquipment(rows: unknown[]): { standard: string[]; optional: string[] } {
  const standard: string[] = [];
  const optional: string[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const title = String(r.title ?? r.name ?? '');
    if (!title) continue;
    const type = String(r.equipmentTypeCode ?? r.typeCode ?? '').toLowerCase();
    if (type.includes('opsiyonel') || type.includes('optional')) optional.push(title);
    else standard.push(title);
  }
  return { standard, optional };
}

/** Stitch Ürün Detay — `aa85e966cd724d27b8ab6ac3942622b5` */
export function ProductDetailScreen({ id }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [specs, setSpecs] = useState<{ key: string; value: string; unit?: string }[]>([]);
  const [equipment, setEquipment] = useState<{ standard: string[]; optional: string[] }>({
    standard: [],
    optional: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProductDetailTab>('genel');

  const load = useCallback(async () => {
    try {
      const [product, specRows, equipRows] = await Promise.all([
        productService.get(id),
        productService.specs(id).catch(() => []),
        productService.equipment(id).catch(() => []),
      ]);
      setData(product as Record<string, unknown>);
      setSpecs(normalizeSpecs(Array.isArray(specRows) ? specRows : []));
      setEquipment(splitEquipment(Array.isArray(equipRows) ? equipRows : []));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detay yüklenemedi');
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const generalRows = useMemo(() => {
    if (!data) return [];
    const rows: { label: string; value: string }[] = [];
    const push = (label: string, value?: string) => {
      if (value && value !== '—') rows.push({ label, value });
    };
    push('Kategori', pickLabel(data, 'category'));
    push('Ürün Grubu', pickLabel(data, 'productGroup'));
    push('Alt Kategori', pickLabel(data, 'subcategory'));
    push('Ürün Tipi', pickLabel(data, 'productType'));
    push('GTİP Kodu', data.hsCode ? String(data.hsCode) : undefined);
    push('Para Birimi', pickLabel(data, 'currency', 'code'));
    return rows;
  }, [data]);

  if (loading) {
    return (
      <Screen padded={false}>
        <ProductDetailTopBar modelCode="…" onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen padded={false}>
        <ProductDetailTopBar modelCode="—" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.err}>{error ?? 'Kayıt bulunamadı'}</Text>
        </View>
      </Screen>
    );
  }

  const fullName = productTitle(data);
  const modelCode = String(data.modelCode ?? '—');
  const brandName = pickLabel(data, 'brand');
  const categoryLabel = pickLabel(data, 'category');
  const currencyCode = pickLabel(data, 'currency', 'code');
  const description = data.description ? String(data.description) : undefined;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <ProductDetailTopBar
        modelCode={modelCode}
        onBack={() => router.back()}
        onShare={() => Alert.alert('Paylaş', 'Paylaşım yakında eklenecek.')}
        onMore={() => Alert.alert('Menü', 'Ek işlemler yakında eklenecek.')}
      />

      <View style={styles.body}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          directionalLockEnabled
        >
          <View style={styles.section}>
            <ProductHeroSection
              imageUrl={data.imageUrl ? String(data.imageUrl) : undefined}
              fullName={fullName}
              categoryLabel={categoryLabel}
              isActive={data.isActive !== false}
            />
          </View>

          <Text style={styles.fullName}>{fullName}</Text>

          <View style={styles.section}>
            <ProductMetaRow
              brandName={brandName}
              originCountry={data.originCountry ? String(data.originCountry) : undefined}
              stockCode={data.stockCode ? String(data.stockCode) : undefined}
            />
          </View>

          <View style={styles.section}>
            <ProductPriceCard
              listPrice={data.listPrice}
              cashPrice={data.cashPrice}
              vatRate={data.vatRate}
              currencyCode={currencyCode}
            />
          </View>

          <View style={styles.section}>
            <ProductQuickActions
              onAddToQuote={() => Alert.alert('Teklife Ekle', 'Teklif akışı yakında eklenecek.')}
            />
          </View>

          <View style={styles.section}>
            <ProductDetailTabs value={tab} onChange={setTab} />
          </View>

          <View style={styles.tabBody}>
            {tab === 'genel' ? (
              <>
                <ProductInfoRows rows={generalRows} />
                {description ? <Text style={styles.description}>{description}</Text> : null}
                {specs.length ? (
                  <>
                    <Text style={styles.previewTitle}>Teknik Özet</Text>
                    <ProductSpecList specs={specs.slice(0, 4)} />
                  </>
                ) : null}
              </>
            ) : null}
            {tab === 'teknik' ? <ProductSpecList specs={specs} /> : null}
            {tab === 'donanim' ? (
              <ProductEquipmentSection standard={equipment.standard} optional={equipment.optional} />
            ) : null}
            {tab === 'medya' ? (
              data.imageUrl ? (
                <Text style={styles.muted}>Görsel galerisi yakında eklenecek.</Text>
              ) : (
                <Text style={styles.muted}>Medya bulunamadı</Text>
              )
            ) : null}
          </View>
        </ScrollView>

        <ProductDetailFooter
          onEdit={() => Alert.alert('Düzenle', 'Ürün düzenleme yakında eklenecek.')}
          onAddToQuote={() => Alert.alert('Teklife Ekle', 'Teklif akışı yakında eklenecek.')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  section: { marginBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.error, ...typography.body },
  fullName: {
    ...typography.headline,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  description: {
    ...typography.body,
    color: colors.onSurfaceVariant,
    marginTop: spacing.sm,
  },
  previewTitle: {
    ...typography.label,
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  tabBody: { marginTop: spacing.sm, minHeight: 160, paddingBottom: spacing.xxl },
  muted: { ...typography.bodySm, color: colors.textMuted },
});
