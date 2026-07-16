import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRODUCT_CATEGORY_FILTERS, type ProductCategoryFilter } from '@/src/ui/products/productHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type ProductsViewMode = 'grid' | 'list';

export function ProductsTopBar({
  onBack,
  viewMode,
  onToggleView,
}: {
  onBack: () => void;
  viewMode: ProductsViewMode;
  onToggleView: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.topBarTitle} numberOfLines={1}>
        Ürünler
      </Text>
      <View style={styles.topBarRight}>
        <Pressable
          onPress={onToggleView}
          hitSlop={8}
          style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}
          accessibilityLabel={viewMode === 'grid' ? 'Liste görünümü' : 'Izgara görünümü'}
        >
          <Ionicons
            name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
            size={22}
            color={colors.primary}
          />
        </Pressable>
      </View>
    </View>
  );
}

export function ProductsSearchField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={20} color={colors.outline} style={styles.searchIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Model, kod ara…"
        placeholderTextColor={colors.outline}
        style={styles.searchInput}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export function ProductsCategoryTabs({
  value,
  onChange,
}: {
  value: ProductCategoryFilter;
  onChange: (v: ProductCategoryFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chipsRow}
    >
      {PRODUCT_CATEGORY_FILTERS.map((chip) => {
        const active = chip === value;
        return (
          <Pressable
            key={chip}
            onPress={() => onChange(chip)}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : styles.chipIdle,
              pressFade(pressed),
            ]}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]} numberOfLines={1}>
              {chip}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function ProductGridCard({
  title,
  modelCode,
  priceText,
  badgeLabel,
  icon,
  imageUrl,
  onPress,
}: {
  title: string;
  modelCode: string;
  priceText?: string | null;
  badgeLabel: string;
  icon: 'construct' | 'cube' | 'hardware-chip' | 'layers';
  imageUrl?: string;
  onPress: () => void;
}) {
  const passive = badgeLabel === 'Pasif';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.gridCard, shadowCard, pressFade(pressed)]}
    >
      <View style={styles.gridImageWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.gridImage} resizeMode="cover" />
        ) : (
          <Ionicons name={icon} size={36} color={colors.onPrimaryContainer} />
        )}
      </View>
      <View style={styles.gridBody}>
        <Text style={styles.gridModelCode} numberOfLines={1}>
          {modelCode.toUpperCase()}
        </Text>
        <Text style={styles.gridTitle} numberOfLines={2}>
          {title}
        </Text>
        {priceText ? (
          <Text style={styles.gridPrice} numberOfLines={1}>
            {priceText}
            <Text style={styles.gridPriceVat}> + KDV</Text>
          </Text>
        ) : null}
      </View>
      <View style={[styles.gridBadge, passive ? styles.gridBadgePassive : styles.gridBadgeActive]}>
        <Text style={[styles.gridBadgeText, passive ? styles.gridBadgeTextPassive : styles.gridBadgeTextActive]}>
          {badgeLabel}
        </Text>
      </View>
    </Pressable>
  );
}

export function ProductListCard({
  title,
  modelCode,
  brandName,
  categoryLabel,
  priceText,
  icon,
  onPress,
}: {
  title: string;
  modelCode: string;
  brandName?: string;
  categoryLabel?: string;
  priceText?: string | null;
  icon: 'construct' | 'cube' | 'hardware-chip' | 'layers';
  onPress: () => void;
}) {
  const meta = [brandName, categoryLabel].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.listCard, shadowCard, pressFade(pressed)]}
    >
      <View style={styles.listCardIcon}>
        <Ionicons name={icon} size={22} color={colors.onPrimaryContainer} />
      </View>
      <View style={styles.listCardBody}>
        <Text style={styles.listModelCode} numberOfLines={1}>
          {modelCode.toUpperCase()}
        </Text>
        <Text style={styles.listCardTitle} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.listCardMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {priceText ? (
          <Text style={styles.listPrice} numberOfLines={1}>
            {priceText}
            <Text style={styles.gridPriceVat}> + KDV</Text>
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.outlineVariant} />
    </Pressable>
  );
}

export function ProductsFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, shadowCard, pressFade(pressed)]}>
      <Ionicons name="add" size={28} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.canvas,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.headlineMd,
    color: colors.primary,
    fontFamily: fonts.bold,
    paddingHorizontal: spacing.sm,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: spacing.md, zIndex: 1 },
  searchInput: {
    height: 48,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingLeft: 40,
    paddingRight: spacing.md,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  chipsScroll: { flexGrow: 0, marginHorizontal: -layout.containerMargin },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.xs,
  },
  chip: {
    flexShrink: 0,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chipIdle: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  chipText: { ...typography.label },
  chipTextActive: { color: '#fff', fontFamily: fonts.semibold },
  chipTextIdle: { color: colors.onSurfaceVariant },
  gridCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.sm,
    minWidth: 0,
  },
  gridImageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gridImage: { width: '100%', height: '100%' },
  gridBody: { gap: 4 },
  gridModelCode: {
    ...typography.caption,
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.outline,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  gridTitle: {
    ...typography.bodySm,
    fontFamily: fonts.semibold,
    color: colors.onSurface,
  },
  gridPrice: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.bold,
    marginTop: 2,
  },
  gridPriceVat: {
    ...typography.caption,
    color: colors.outline,
    fontFamily: fonts.regular,
  },
  gridBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  gridBadgeActive: { backgroundColor: '#d1fae5' },
  gridBadgePassive: { backgroundColor: colors.statusPassiveBg },
  gridBadgeText: { ...typography.caption, fontSize: 11, fontFamily: fonts.semibold },
  gridBadgeTextActive: { color: '#059669' },
  gridBadgeTextPassive: { color: colors.statusPassiveText },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
  },
  listCardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCardBody: { flex: 1, gap: 2 },
  listModelCode: {
    ...typography.caption,
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.outline,
    letterSpacing: 0.4,
  },
  listCardTitle: {
    ...typography.headlineMd,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
  },
  listCardMeta: {
    ...typography.label,
    color: colors.secondary,
  },
  listPrice: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.bold,
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: layout.containerMargin,
    bottom: 88,
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
