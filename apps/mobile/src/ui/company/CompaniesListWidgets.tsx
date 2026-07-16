import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HaksanLogo } from '@/src/ui/HaksanLogo';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

/** Stitch `97f60630` — logo + başlık + arama/ekle */
export function CompaniesListHeader({
  onAdd,
  onSearchPress,
}: {
  onAdd: () => void;
  onSearchPress?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.headerRow}>
        <View style={styles.headerBrand}>
          <HaksanLogo height={28} />
          <Text style={styles.headerTitle}>Firmalar</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={onSearchPress}
            hitSlop={8}
            style={({ pressed }) => [styles.headerIconBtn, pressFade(pressed)]}
            accessibilityLabel="Ara"
          >
            <Ionicons name="search-outline" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
          <Pressable
            onPress={onAdd}
            hitSlop={8}
            style={({ pressed }) => [styles.headerAddBtn, pressFade(pressed)]}
            accessibilityLabel="Yeni firma"
          >
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function CompaniesSearchField({
  value,
  onChangeText,
  inputRef,
}: {
  value: string;
  onChangeText: (t: string) => void;
  inputRef?: React.Ref<TextInput>;
}) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={20} color={colors.outline} style={styles.searchIcon} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder="Firma ara..."
        placeholderTextColor={colors.outlineVariant}
        style={styles.searchInput}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
    </View>
  );
}

const FILTERS = ['Tümü', 'Aktif', 'Pasif', 'Potansiyel'] as const;
export type CompanyFilter = (typeof FILTERS)[number];

export function CompanyFilterChips({
  value,
  onChange,
}: {
  value: CompanyFilter;
  onChange: (f: CompanyFilter) => void;
}) {
  return (
    <View style={styles.filterRow}>
      {FILTERS.map((f) => {
        const active = f === value;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            style={[styles.filterChip, active && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type CompanyStatusTone = 'active' | 'passive' | 'potential' | 'default';

const STATUS_STYLES: Record<CompanyStatusTone, { bg: string; fg: string; label: string }> = {
  active: { bg: colors.statusActiveBg, fg: colors.statusActiveText, label: 'Aktif' },
  passive: { bg: colors.statusPassiveBg, fg: colors.statusPassiveText, label: 'Pasif' },
  potential: { bg: colors.statusPotentialBg, fg: colors.statusPotentialText, label: 'Potansiyel' },
  default: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant, label: '—' },
};

export function CompanyListCard({
  title,
  location,
  statusTone,
  statusLabel,
  meta,
  onPress,
}: {
  title: string;
  location?: string;
  statusTone: CompanyStatusTone;
  statusLabel?: string;
  meta?: string;
  onPress?: () => void;
}) {
  const status = STATUS_STYLES[statusTone];
  const badgeLabel = statusLabel ?? status.label;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressFade(pressed)]}>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>
        {location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={colors.outline} />
            <Text style={styles.locationText}>{location}</Text>
          </View>
        ) : null}
        <View style={styles.cardFooter}>
          {badgeLabel !== '—' ? (
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusBadgeText, { color: status.fg }]}>{badgeLabel.toUpperCase()}</Text>
            </View>
          ) : null}
          {meta ? <Text style={styles.metaText}>{meta}</Text> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.outlineVariant} />
    </Pressable>
  );
}

export function statusToneFromCode(code?: string | null): CompanyStatusTone {
  const c = String(code ?? '').toLowerCase();
  if (c === 'active') return 'active';
  if (c === 'passive') return 'passive';
  if (c === 'potential') return 'potential';
  return 'default';
}

export function statusLabelFromRow(item: Record<string, unknown>): string | undefined {
  const status = item.customerStatus as Record<string, unknown> | undefined;
  if (status?.name) return String(status.name);
  const code = String(status?.code ?? '');
  if (code === 'active') return 'Aktif';
  if (code === 'passive') return 'Pasif';
  if (code === 'potential') return 'Potansiyel';
  if (code === 'blacklist') return 'Kara Liste';
  return undefined;
}

export function locationFromRow(item: Record<string, unknown>): string | undefined {
  const addr = item.primaryAddress as Record<string, unknown> | undefined;
  if (addr?.province) return String(addr.province);
  if (addr?.district) return String(addr.district);
  if (addr?.locality) return String(addr.locality);
  const sector = item.sector;
  if (sector) return String(sector);
  return undefined;
}

const FILTER_TO_API: Record<CompanyFilter, string | undefined> = {
  Tümü: undefined,
  Aktif: 'active',
  Pasif: 'passive',
  Potansiyel: 'potential',
};

export { FILTER_TO_API };

const styles = StyleSheet.create({
  headerWrap: {
    backgroundColor: colors.canvas,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: layout.containerMargin,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  headerTitle: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  searchWrap: {
    position: 'relative',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 1,
  },
  searchInput: {
    paddingLeft: 40,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHighest,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.medium,
    letterSpacing: 0.24,
    color: colors.onSurfaceVariant,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadowCard,
    gap: spacing.sm,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  locationText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.regular,
    color: colors.outline,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  statusBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fonts.semibold,
    letterSpacing: 0.8,
  },
  metaText: {
    ...typography.caption,
    color: colors.outlineVariant,
    flex: 1,
    textAlign: 'right',
  },
});
