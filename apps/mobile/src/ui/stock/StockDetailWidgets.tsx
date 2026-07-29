import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stockLevelLabel, type AggregatedStockSku, type StockLevel } from '@/src/ui/stock/stockHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type WarehouseBreakdown = { name: string; count: number; badge?: string };

export type StockMovementFilter = 'Tümü' | 'Giriş' | 'Çıkış' | 'Transfer' | 'Sayım';

const LEVEL_COLORS: Record<StockLevel, string> = {
  critical: colors.error,
  low: '#ca8a04',
  ok: '#16a34a',
};

export function StockDetailTopBar({
  onBack,
  onMore,
}: {
  onBack: () => void;
  onMore?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.topBarTitle}>Stok Detay</Text>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.iconBtn} />
      )}
    </View>
  );
}

export function StockProductHeader({
  title,
  sku,
  categoryLabel,
  unitLabel,
  level,
}: {
  title: string;
  sku: string;
  categoryLabel: string;
  unitLabel: string;
  level: StockLevel;
}) {
  const statusLabel = stockLevelLabel(level);
  const statusColor = LEVEL_COLORS[level];

  return (
    <View style={[styles.card, shadowCard]}>
      <View style={styles.productRow}>
        <View style={styles.productIcon}>
          <Ionicons name="cube-outline" size={32} color={colors.onPrimaryContainer} />
        </View>
        <View style={styles.productMeta}>
          <Text style={styles.productTitle}>{title}</Text>
          <View style={styles.skuRow}>
            <Text style={styles.skuText}>SKU: {sku}</Text>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
              <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={styles.categoryText}>
            Kategori: {categoryLabel} · Birim: {unitLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function StockKpiStrip({
  available,
  reserved,
  net,
}: {
  available: number;
  reserved: number;
  net: number;
}) {
  return (
    <View style={styles.kpiRow}>
      <View style={[styles.kpiCard, styles.kpiPrimary, shadowCard]}>
        <Text style={styles.kpiLabel}>Mevcut</Text>
        <Text style={[styles.kpiValue, { color: colors.onPrimaryContainer }]}>{available} ad</Text>
      </View>
      <View style={[styles.kpiCard, styles.kpiWarning, shadowCard]}>
        <Text style={styles.kpiLabel}>Rezerve</Text>
        <Text style={[styles.kpiValue, { color: '#d97706' }]}>{reserved} ad</Text>
      </View>
      <View style={[styles.kpiCard, styles.kpiSuccess, shadowCard]}>
        <Text style={styles.kpiLabel}>Net</Text>
        <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{net} ad</Text>
      </View>
    </View>
  );
}

export function StockLevelProgress({ minQty, progress }: { minQty: number; progress: number }) {
  return (
    <View style={styles.progressSection}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>Kritik Seviye: {minQty}</Text>
        <Text style={styles.progressPct}>{progress}% Doluluk</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]} />
      </View>
    </View>
  );
}

export function StockWarehouseList({ rows }: { rows: WarehouseBreakdown[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Depo Bazlı Dağılım</Text>
      <View style={[styles.listCard, shadowCard]}>
        {rows.length === 0 ? (
          <Text style={styles.emptyHint}>Depo dağılımı bulunamadı</Text>
        ) : (
          rows.map((row, i) => (
            <View
              key={row.name}
              style={[styles.warehouseRow, i < rows.length - 1 && styles.warehouseRowBorder]}
            >
              <View style={styles.warehouseLeft}>
                <Text style={styles.warehouseName}>{row.name}</Text>
                {row.badge ? (
                  <View style={styles.warehouseBadge}>
                    <Text style={styles.warehouseBadgeText}>{row.badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.warehouseCount}>{row.count} ad</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

export function StockMovementSection({
  filter,
  onFilterChange,
  empty,
}: {
  filter: StockMovementFilter;
  onFilterChange: (f: StockMovementFilter) => void;
  empty?: boolean;
}) {
  const filters: StockMovementFilter[] = ['Tümü', 'Giriş', 'Çıkış', 'Transfer', 'Sayım'];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Hareket Geçmişi</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.movementTabs}>
        {filters.map((f) => {
          const active = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => onFilterChange(f)}
              style={[styles.movementTab, active && styles.movementTabActive]}
            >
              <Text style={[styles.movementTabText, active && styles.movementTabTextActive]}>{f}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.listCard, shadowCard]}>
        <Text style={styles.emptyHint}>
          {empty ? 'Hareket kaydı API üzerinden henüz sunulmuyor.' : 'Bu filtre için hareket yok.'}
        </Text>
      </View>
    </View>
  );
}

export function StockSupplyInfo({
  unitCost,
  totalValue,
  leadDays,
  supplier,
}: {
  unitCost?: string;
  totalValue?: string;
  leadDays?: string;
  supplier?: string;
}) {
  const rows = [
    { label: 'Birim Maliyet', value: unitCost ?? '—' },
    { label: 'Toplam Değer', value: totalValue ?? '—' },
    { label: 'Ortalama Tedarik Süresi', value: leadDays ?? '—' },
    { label: 'Tedarikçi', value: supplier ?? '—', badge: supplier ? 'Onaylı' : undefined },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Tedarik Bilgisi</Text>
      <View style={[styles.listCard, shadowCard, styles.supplyCard]}>
        {rows.map((row, i) => (
          <View key={row.label} style={[styles.supplyRow, i < rows.length - 1 && styles.supplyRowBorder]}>
            <Text style={styles.supplyLabel}>{row.label}</Text>
            <View style={styles.supplyRight}>
              <Text style={styles.supplyValue}>{row.value}</Text>
              {row.badge ? (
                <View style={styles.supplierBadge}>
                  <Text style={styles.supplierBadgeText}>{row.badge}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function StockDetailFooter({
  onCount,
  onMovement,
}: {
  onCount: () => void;
  onMovement: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }, shadowCard]}>
      <Pressable onPress={onCount} style={({ pressed }) => [styles.footerBtnOutline, pressFade(pressed)]}>
        <Text style={styles.footerBtnOutlineText}>Sayım Başlat</Text>
      </Pressable>
      <Pressable onPress={onMovement} style={({ pressed }) => [styles.footerBtnPrimary, pressFade(pressed)]}>
        <Text style={styles.footerBtnPrimaryText}>Hareket Ekle</Text>
      </Pressable>
    </View>
  );
}

export function buildWarehouseBreakdown(items: Record<string, unknown>[]): WarehouseBreakdown[] {
  const map = new Map<string, number>();
  for (const row of items) {
    const warehouse = row.warehouse as Record<string, unknown> | undefined;
    const name = String(warehouse?.name ?? 'Belirtilmedi');
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count], i) => ({
      name,
      count,
      badge: i === 0 ? 'Şu an' : undefined,
    }))
    .sort((a, b) => b.count - a.count);
}

export type { AggregatedStockSku };

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.canvas,
  },
  topBarTitle: { ...typography.headline, fontSize: 22, color: colors.primary, fontFamily: fonts.bold },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  productRow: { flexDirection: 'row', gap: spacing.md },
  productIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productMeta: { flex: 1, gap: 4 },
  productTitle: { ...typography.headlineMd, color: colors.textPrimary },
  skuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  skuText: { ...typography.bodySm, color: colors.onSurfaceVariant },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  statusPillText: { ...typography.caption, fontFamily: fonts.semibold },
  categoryText: { ...typography.label, color: colors.outline, marginTop: 4 },
  kpiRow: { flexDirection: 'row', gap: spacing.sm },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderLeftWidth: 2,
  },
  kpiPrimary: { borderLeftColor: colors.primary },
  kpiWarning: { borderLeftColor: '#d97706' },
  kpiSuccess: { borderLeftColor: '#16a34a' },
  kpiLabel: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: { ...typography.headlineMd, marginTop: 4 },
  progressSection: { gap: spacing.xs },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { ...typography.caption, color: colors.outline },
  progressPct: { ...typography.caption, color: colors.onPrimaryContainer },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.headlineMd, color: colors.textPrimary },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  warehouseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  warehouseRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerLow },
  warehouseLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginRight: spacing.sm },
  warehouseName: { ...typography.bodySm, color: colors.textPrimary },
  warehouseBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  warehouseBadgeText: { ...typography.caption, color: colors.onPrimaryContainer },
  warehouseCount: { ...typography.bodySm, fontFamily: fonts.semibold, color: colors.textPrimary },
  movementTabs: { gap: spacing.xs, paddingBottom: spacing.xs },
  movementTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  movementTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  movementTabText: { ...typography.label, color: colors.onSurfaceVariant },
  movementTabTextActive: { color: '#fff', fontFamily: fonts.semibold },
  emptyHint: { ...typography.bodySm, color: colors.onSurfaceVariant, padding: spacing.md, textAlign: 'center' },
  supplyCard: { padding: spacing.md, gap: spacing.sm },
  supplyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: spacing.sm },
  supplyRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerLow },
  supplyLabel: { ...typography.bodySm, color: colors.onSurfaceVariant },
  supplyRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  supplyValue: { ...typography.bodySm, fontFamily: fonts.semibold, color: colors.textPrimary },
  supplierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  supplierBadgeText: { ...typography.caption, color: colors.onPrimaryContainer },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerLow,
  },
  footerBtnOutline: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnOutlineText: { ...typography.headlineMd, color: colors.primary },
  footerBtnPrimary: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnPrimaryText: { ...typography.headlineMd, color: '#fff' },
});
