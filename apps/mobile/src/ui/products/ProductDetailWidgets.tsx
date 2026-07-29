import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatProductMoney } from '@/src/ui/products/productHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type ProductDetailTab = 'genel' | 'teknik' | 'donanim' | 'medya';

const TABS: { key: ProductDetailTab; label: string }[] = [
  { key: 'genel', label: 'Genel' },
  { key: 'teknik', label: 'Teknik' },
  { key: 'donanim', label: 'Donanım' },
  { key: 'medya', label: 'Medya' },
];

export function ProductDetailTopBar({
  modelCode,
  onBack,
  onShare,
  onMore,
}: {
  modelCode: string;
  onBack: () => void;
  onShare?: () => void;
  onMore?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.topTitle} numberOfLines={1}>
        {modelCode}
      </Text>
      <View style={styles.topActions}>
        {onShare ? (
          <Pressable onPress={onShare} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="share-outline" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
        {onMore ? (
          <Pressable onPress={onMore} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function ProductHeroSection({
  imageUrl,
  fullName,
  categoryLabel,
  isActive,
}: {
  imageUrl?: string;
  fullName: string;
  categoryLabel?: string;
  isActive: boolean;
}) {
  return (
    <View style={styles.heroWrap}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Ionicons name="cube-outline" size={48} color={colors.onSurfaceVariant} />
        </View>
      )}
      <View style={styles.heroBadges}>
        <View style={[styles.badge, styles.badgeActive]}>
          <Text style={styles.badgeActiveText}>{isActive ? 'Aktif' : 'Pasif'}</Text>
        </View>
        {categoryLabel ? (
          <View style={[styles.badge, styles.badgeCategory]}>
            <Text style={styles.badgeCategoryText}>{categoryLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ProductMetaRow({
  brandName,
  originCountry,
  stockCode,
}: {
  brandName?: string;
  originCountry?: string;
  stockCode?: string;
}) {
  return (
    <View style={styles.metaRow}>
      {brandName ? (
        <View style={styles.metaItem}>
          <Ionicons name="business-outline" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.metaText}>{brandName}</Text>
        </View>
      ) : null}
      {originCountry ? (
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.metaText}>{originCountry}</Text>
        </View>
      ) : null}
      {stockCode ? (
        <View style={styles.stockPill}>
          <Text style={styles.stockPillText}>{stockCode}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ProductPriceCard({
  listPrice,
  cashPrice,
  vatRate,
  currencyCode,
}: {
  listPrice?: unknown;
  cashPrice?: unknown;
  vatRate?: unknown;
  currencyCode?: string;
}) {
  const vat = vatRate != null && vatRate !== '' ? `%${Number(vatRate)}` : '';
  return (
    <View style={styles.priceCard}>
      <Text style={styles.priceLabel}>LİSTE FİYATI</Text>
      <Text style={styles.priceValue}>
        {formatProductMoney(listPrice, currencyCode)}
        {vat ? <Text style={styles.priceVat}> + KDV ({vat})</Text> : null}
      </Text>
      {cashPrice != null && cashPrice !== '' ? (
        <View style={styles.cashRow}>
          <Ionicons name="cash-outline" size={14} color={colors.statusActiveText} />
          <Text style={styles.cashText}>Peşin: {formatProductMoney(cashPrice, currencyCode)}</Text>
        </View>
      ) : null}
      <Text style={styles.priceNote}>Fiyatlar bilgi amaçlıdır</Text>
    </View>
  );
}

export function ProductQuickActions({
  onAddToQuote,
}: {
  onAddToQuote?: () => void;
}) {
  const chips = [
    { label: 'Teklife Ekle', icon: 'document-text-outline' as const, onPress: onAddToQuote, primary: true },
    { label: 'Fiyat Listesi', icon: 'list-outline' as const },
    { label: 'Muadil Ürün', icon: 'swap-horizontal-outline' as const },
    { label: 'PDF Katalog', icon: 'document-outline' as const },
  ];

  return (
    <View style={styles.quickRow}>
      {chips.map((chip) => (
        <Pressable
          key={chip.label}
          onPress={chip.onPress}
          style={({ pressed }) => [
            styles.quickChip,
            chip.primary ? styles.quickChipPrimary : null,
            pressFade(pressed),
          ]}
        >
          <Ionicons name={chip.icon} size={16} color={chip.primary ? colors.primary : colors.onSurfaceVariant} />
          <Text style={[styles.quickChipText, chip.primary ? styles.quickChipTextPrimary : null]}>
            {chip.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ProductDetailTabs({
  value,
  onChange,
}: {
  value: ProductDetailTab;
  onChange: (v: ProductDetailTab) => void;
}) {
  return (
    <View style={styles.tabs}>
      {TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={styles.tabBtn}>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            {active ? <View style={styles.tabIndicator} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProductInfoRows({ rows }: { rows: { label: string; value: string }[] }) {
  if (!rows.length) return <Text style={styles.muted}>Bilgi bulunamadı</Text>;
  return (
    <View style={styles.infoCard}>
      {rows.map((row, index) => (
        <View key={`${index}-${row.label}`} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{row.label}</Text>
          <Text style={styles.infoValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function ProductSpecList({ specs }: { specs: { key: string; value: string; unit?: string }[] }) {
  if (!specs.length) return <Text style={styles.muted}>Teknik özellik bulunamadı</Text>;
  return (
    <View style={styles.infoCard}>
      {specs.map((spec, index) => (
        <View key={`${index}-${spec.key || 'spec'}`} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{spec.key}</Text>
          <Text style={styles.infoValue}>
            {spec.value}
            {spec.unit ? ` ${spec.unit}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ProductEquipmentSection({
  standard,
  optional,
}: {
  standard: string[];
  optional: string[];
}) {
  return (
    <View style={styles.equipmentWrap}>
      {standard.length ? (
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Standart</Text>
          {standard.map((item) => (
            <Text key={item} style={styles.bullet}>
              • {item}
            </Text>
          ))}
        </View>
      ) : null}
      {optional.length ? (
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Opsiyonel</Text>
          {optional.map((item) => (
            <Text key={item} style={styles.bullet}>
              • {item}
            </Text>
          ))}
        </View>
      ) : null}
      {!standard.length && !optional.length ? (
        <Text style={styles.muted}>Donanım bilgisi bulunamadı</Text>
      ) : null}
    </View>
  );
}

export function ProductDetailFooter({
  onEdit,
  onAddToQuote,
}: {
  onEdit?: () => void;
  onAddToQuote?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Pressable
        onPress={onEdit}
        style={({ pressed }) => [styles.footerSecondary, pressFade(pressed)]}
      >
        <Text style={styles.footerSecondaryText}>Düzenle</Text>
      </Pressable>
      <Pressable
        onPress={onAddToQuote}
        style={({ pressed }) => [styles.footerPrimary, pressFade(pressed)]}
      >
        <Text style={styles.footerPrimaryText}>Teklife Ekle</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    paddingHorizontal: layout.containerMargin,
    minHeight: 56,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.headlineMd,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  topActions: { flexDirection: 'row' },
  heroWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...shadowCard,
  },
  heroImage: { width: '100%', aspectRatio: 16 / 9 },
  heroPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
  },
  heroBadges: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    gap: spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeActive: { backgroundColor: colors.statusActiveBg },
  badgeActiveText: { ...typography.caption, color: colors.statusActiveText, fontFamily: fonts.semibold },
  badgeCategory: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  badgeCategoryText: { ...typography.caption, color: colors.textPrimary },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.bodySm, color: colors.onSurfaceVariant },
  stockPill: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  stockPillText: { ...typography.caption, fontFamily: fonts.medium, color: colors.textPrimary },
  priceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...shadowCard,
    gap: spacing.xs,
  },
  priceLabel: { ...typography.caption, color: colors.onSurfaceVariant, letterSpacing: 0.5 },
  priceValue: { ...typography.kpi, fontSize: 24, color: colors.primary, fontFamily: fonts.bold },
  priceVat: { ...typography.bodySm, color: colors.onSurfaceVariant, fontFamily: fonts.regular },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.statusActiveBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  cashText: { ...typography.bodySm, color: colors.statusActiveText },
  priceNote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...shadowCard,
  },
  quickChipPrimary: {
    borderColor: colors.primary,
  },
  quickChipText: { ...typography.label, color: colors.onSurfaceVariant },
  quickChipTextPrimary: { color: colors.primary },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: spacing.sm },
  tabText: { ...typography.bodySm, color: colors.onSurfaceVariant },
  tabTextActive: { ...typography.bodySm, color: colors.primary, fontFamily: fonts.semibold },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...shadowCard,
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceVariant,
  },
  infoLabel: { ...typography.bodySm, color: colors.onSurfaceVariant, flex: 1 },
  infoValue: {
    ...typography.bodySm,
    color: colors.textPrimary,
    fontFamily: fonts.medium,
    flex: 1,
    textAlign: 'right',
  },
  sectionTitle: { ...typography.label, color: colors.primary, marginBottom: spacing.xs },
  bullet: { ...typography.bodySm, color: colors.textPrimary, marginBottom: 4 },
  equipmentWrap: { gap: spacing.md },
  muted: { ...typography.bodySm, color: colors.textMuted, paddingVertical: spacing.md },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    ...shadowCard,
  },
  footerSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerSecondaryText: { ...typography.body, color: colors.primary, fontFamily: fonts.semibold },
  footerPrimary: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrimaryText: { ...typography.body, color: '#fff', fontFamily: fonts.semibold },
});
