import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { companyService, inventoryService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import {
  CompaniesSearchField,
  CompanyFilterChips,
  FILTER_TO_API,
  locationFromRow,
  statusLabelFromRow,
  statusToneFromCode,
  type CompanyFilter,
} from '@/src/ui/company/CompaniesListWidgets';
import {
  ServiceTicketCompanyAvatar,
  ServiceTicketMachineIcon,
  deviceLabelFromRow,
} from '@/src/ui/forms/ServiceTicketFormWidgets';
import { EmptyState } from '@/src/ui/EmptyState';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type MachineFilter = 'Tümü' | 'Garantide' | 'Bakım Yaklaşan' | 'Süresi Dolan';

const MACHINE_FILTERS: MachineFilter[] = ['Tümü', 'Garantide', 'Bakım Yaklaşan', 'Süresi Dolan'];

function emptyMachineCounts(): Record<MachineFilter, number> {
  return { Tümü: 0, Garantide: 0, 'Bakım Yaklaşan': 0, 'Süresi Dolan': 0 };
}

const WARRANTY_BADGE_STYLES = {
  green: { bg: '#dcfce7', fg: '#166534' },
  amber: { bg: '#fef3c7', fg: '#92400e' },
  gray: { bg: '#f3f4f6', fg: '#4b5563' },
  neutral: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant },
} as const;

type PickerSheetHeaderProps = {
  title: string;
  onClose: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
};

function PickerSheetHeader({ title, onClose, rightIcon, onRightPress }: PickerSheetHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      {rightIcon ? (
        <Pressable onPress={onRightPress} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
          <Ionicons name={rightIcon} size={22} color={colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.headerBtn} />
      )}
    </View>
  );
}

function CustomerPickerCard({
  title,
  code,
  location,
  statusLabel,
  statusTone,
  selected,
  onPress,
}: {
  title: string;
  code?: string;
  location?: string;
  statusLabel?: string;
  statusTone: ReturnType<typeof statusToneFromCode>;
  selected?: boolean;
  onPress: () => void;
}) {
  const toneMap = {
    active: { bg: colors.statusActiveBg, fg: colors.statusActiveText },
    passive: { bg: colors.statusPassiveBg, fg: colors.statusPassiveText },
    potential: { bg: colors.statusPotentialBg, fg: colors.statusPotentialText },
    default: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant },
  } as const;
  const tone = toneMap[statusTone];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.customerCard,
        selected && styles.cardSelected,
        pressFade(pressed),
      ]}
    >
      <ServiceTicketCompanyAvatar name={title} />
      <View style={styles.customerBody}>
        <Text style={styles.customerTitle} numberOfLines={2}>
          {title}
        </Text>
        {code ? <Text style={styles.customerCode}>{code}</Text> : null}
        {location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={colors.outline} />
            <Text style={styles.locationText}>{location}</Text>
          </View>
        ) : null}
        {statusLabel ? (
          <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.statusBadgeText, { color: tone.fg }]}>{statusLabel.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.outlineVariant} />
      )}
    </Pressable>
  );
}

function MachinePickerCard({
  modelName,
  serialNumber,
  brandName,
  warrantyLabel,
  warrantyTone,
  location,
  selected,
  onPress,
}: {
  modelName: string;
  serialNumber?: string;
  brandName?: string;
  warrantyLabel: string;
  warrantyTone: 'green' | 'amber' | 'gray' | 'neutral';
  location?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const warrantyStyle = WARRANTY_BADGE_STYLES[warrantyTone];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.machineCard,
        selected && styles.cardSelected,
        pressFade(pressed),
      ]}
    >
      <View style={styles.machineCardTop}>
        <View style={styles.machineTitleRow}>
          <ServiceTicketMachineIcon />
          <Text style={styles.machineTitle} numberOfLines={2}>
            {modelName}
          </Text>
        </View>
        <View style={[styles.warrantyBadge, { backgroundColor: warrantyStyle.bg }]}>
          <Text style={[styles.warrantyBadgeText, { color: warrantyStyle.fg }]}>{warrantyLabel}</Text>
        </View>
      </View>
      <View style={styles.machineGrid}>
        <View style={styles.machineGridCol}>
          <Text style={styles.machineGridLabel}>Seri No</Text>
          <Text style={styles.machineGridValue}>{serialNumber || '—'}</Text>
        </View>
        {brandName ? (
          <View style={styles.machineGridCol}>
            <Text style={styles.machineGridLabel}>Marka</Text>
            <Text style={styles.machineGridValue} numberOfLines={1}>
              {brandName}
            </Text>
          </View>
        ) : null}
      </View>
      {location ? (
        <View style={styles.machineLocationRow}>
          <Ionicons name="location-outline" size={14} color={colors.outline} />
          <Text style={styles.machineLocationText} numberOfLines={1}>
            {location}
          </Text>
        </View>
      ) : null}
      {selected ? (
        <View style={styles.selectedPill}>
          <Ionicons name="checkmark" size={14} color="#fff" />
          <Text style={styles.selectedPillText}>Seçildi</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function warrantyBucket(row: Record<string, unknown>): MachineFilter | 'unknown' {
  const end = row.warrantyEndDate;
  if (!end) return 'unknown';
  const endDate = new Date(String(end));
  const now = Date.now();
  if (Number.isNaN(endDate.getTime())) return 'unknown';
  if (endDate.getTime() > now) {
    const days = (endDate.getTime() - now) / 86400000;
    if (days <= 60) return 'Bakım Yaklaşan';
    return 'Garantide';
  }
  return 'Süresi Dolan';
}

export function warrantyLabelFromRow(row: Record<string, unknown>): string {
  const bucket = warrantyBucket(row);
  if (bucket === 'unknown') return '—';
  return bucket;
}

function warrantyToneFromRow(row: Record<string, unknown>): 'green' | 'amber' | 'gray' | 'neutral' {
  const bucket = warrantyBucket(row);
  if (bucket === 'Garantide') return 'green';
  if (bucket === 'Bakım Yaklaşan') return 'amber';
  if (bucket === 'Süresi Dolan') return 'gray';
  return 'neutral';
}

function companyCodeFromRow(row: Record<string, unknown>): string | undefined {
  if (row.taxNumber) return `CR-${String(row.taxNumber).slice(-4)}`;
  if (row.id) return `CR-${String(row.id).slice(0, 4).toUpperCase()}`;
  return undefined;
}

function MachineFilterChips({
  value,
  onChange,
  counts,
}: {
  value: MachineFilter;
  onChange: (v: MachineFilter) => void;
  counts: Record<MachineFilter, number>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.machineFilterRow}>
      {MACHINE_FILTERS.map((f) => {
        const active = f === value;
        const count = counts[f];
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            style={[styles.machineFilterChip, active && styles.machineFilterChipActive]}
          >
            <Text style={[styles.machineFilterText, active && styles.machineFilterTextActive]}>
              {f === 'Tümü' ? `Tümü (${count})` : `${f} (${count})`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Stitch Firmalar — servis formu müşteri seçici */
export function ServiceCustomerPickerSheet({
  visible,
  selectedId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selectedId?: string;
  onClose: () => void;
  onSelect: (company: { id: string; name: string; location?: string }) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<CompanyFilter>('Tümü');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = { pageSize: 50 };
      if (q.trim()) params.search = q.trim();
      const statusCode = FILTER_TO_API[filter];
      if (statusCode) params.customerStatusCode = statusCode;
      const res = await companyService.list(params);
      setItems(normalizeList(res));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, filter]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [visible, load]);

  useEffect(() => {
    if (!visible) {
      setQ('');
      setFilter('Tümü');
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <PickerSheetHeader title="Müşteri Seç" onClose={onClose} />
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <CompaniesSearchField value={q} onChangeText={setQ} />
              <CompanyFilterChips value={filter} onChange={setFilter} />
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : (
              <EmptyState title="Firma bulunamadı" subtitle="Arama veya filtreyi değiştirmeyi deneyin" />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const id = String(item.id ?? '');
            const title = String(item.legalTitle ?? item.shortName ?? '—');
            const status = item.customerStatus as Record<string, unknown> | undefined;
            return (
              <CustomerPickerCard
                title={title}
                code={companyCodeFromRow(item)}
                location={locationFromRow(item)}
                statusLabel={statusLabelFromRow(item)}
                statusTone={statusToneFromCode(String(status?.code ?? ''))}
                selected={selectedId === id}
                onPress={() =>
                  onSelect({
                    id,
                    name: title,
                    location: locationFromRow(item),
                  })
                }
              />
            );
          }}
        />
      </View>
    </Modal>
  );
}

/** Stitch Makineler — servis formu makine seçici */
export function ServiceMachinePickerSheet({
  visible,
  companyId,
  companyName,
  selectedId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  companyId?: string;
  companyName?: string;
  selectedId?: string;
  onClose: () => void;
  onSelect: (device: { id: string; label: string; location?: string }) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<MachineFilter>('Tümü');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await inventoryService.customerDevices({ companyId, pageSize: 100 });
      setItems(normalizeList(res));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!visible) return;
    void load();
  }, [visible, load]);

  useEffect(() => {
    if (!visible) {
      setQ('');
      setFilter('Tümü');
    }
  }, [visible]);

  const counts = items.reduce<Record<MachineFilter, number>>((acc, row) => {
    acc['Tümü'] += 1;
    const bucket = warrantyBucket(row);
    if (bucket === 'Garantide' || bucket === 'Bakım Yaklaşan' || bucket === 'Süresi Dolan') {
      acc[bucket] += 1;
    }
    return acc;
  }, emptyMachineCounts());

  const filtered = items.filter((row) => {
    const label = deviceLabelFromRow(row).toLowerCase();
    const serial = String(row.serialNumber ?? '').toLowerCase();
    const brand = String(row.brandName ?? '').toLowerCase();
    const term = q.trim().toLowerCase();
    const matchesSearch = !term || label.includes(term) || serial.includes(term) || brand.includes(term);
    const bucket = warrantyBucket(row);
    const matchesFilter = filter === 'Tümü' || bucket === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <PickerSheetHeader title="Makine Seç" onClose={onClose} rightIcon="options-outline" />
        {companyName ? (
          <View style={styles.companyBanner}>
            <Ionicons name="business-outline" size={16} color={colors.primary} />
            <Text style={styles.companyBannerText} numberOfLines={1}>
              {companyName}
            </Text>
          </View>
        ) : null}
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.machineSearchWrap}>
                <Ionicons name="search" size={20} color={colors.secondary} style={styles.machineSearchIcon} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="Seri no, model, marka ara..."
                  placeholderTextColor={colors.onSurfaceVariant}
                  style={styles.machineSearchInput}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />
              </View>
              <MachineFilterChips value={filter} onChange={setFilter} counts={counts} />
            </View>
          }
          ListEmptyComponent={
            !companyId ? (
              <EmptyState title="Önce müşteri seçin" subtitle="Makine listesi için firma seçilmelidir" />
            ) : loading ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : (
              <EmptyState title="Makine bulunamadı" subtitle="Bu müşteriye ait kayıtlı makine yok" />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const id = String(item.id ?? '');
            const modelName = String(item.productModelName ?? item.modelName ?? item.model ?? 'Makine');
            return (
              <MachinePickerCard
                modelName={modelName}
                serialNumber={String(item.serialNumber ?? '') || undefined}
                brandName={String(item.brandName ?? '') || undefined}
                warrantyLabel={warrantyLabelFromRow(item)}
                warrantyTone={warrantyToneFromRow(item)}
                location={companyName}
                selected={selectedId === id}
                onPress={() =>
                  onSelect({
                    id,
                    label: deviceLabelFromRow(item),
                    location: companyName,
                  })
                }
              />
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#f7f7f8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.canvas,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.headlineMd,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  companyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: layout.containerMargin,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.secondaryContainer,
  },
  companyBannerText: {
    flex: 1,
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.xxxl,
  },
  listHeader: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  loader: { marginTop: spacing.xxxl },
  separator: { height: spacing.sm },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadowCard,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#f8f9ff',
  },
  customerBody: {
    flex: 1,
    gap: 4,
  },
  customerTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  customerCode: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  locationText: {
    ...typography.caption,
    color: colors.outline,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fonts.semibold,
    letterSpacing: 0.8,
  },
  machineSearchWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  machineSearchIcon: {
    position: 'absolute',
    left: spacing.lg,
    zIndex: 1,
  },
  machineSearchInput: {
    height: 48,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingLeft: 44,
    paddingRight: spacing.lg,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  machineFilterRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  machineFilterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  machineFilterChipActive: {
    backgroundColor: colors.secondaryContainer,
  },
  machineFilterText: {
    ...typography.label,
    color: colors.secondary,
  },
  machineFilterTextActive: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  machineCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadowCard,
  },
  machineCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  machineTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  machineTitle: {
    flex: 1,
    ...typography.headlineMd,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  warrantyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  warrantyBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.semibold,
  },
  machineGrid: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  machineGridCol: {
    flex: 1,
    gap: 2,
  },
  machineGridLabel: {
    ...typography.caption,
    color: colors.secondary,
  },
  machineGridValue: {
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  machineLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  machineLocationText: {
    flex: 1,
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  selectedPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  selectedPillText: {
    ...typography.caption,
    color: '#fff',
    fontFamily: fonts.semibold,
  },
});
