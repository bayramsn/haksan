import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { companyService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import {
  CompaniesSearchField,
  locationFromRow,
} from '@/src/ui/company/CompaniesListWidgets';
import { ServiceTicketCompanyAvatar } from '@/src/ui/forms/ServiceTicketFormWidgets';
import { EmptyState } from '@/src/ui/EmptyState';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type SupplierFilter = 'Tümü' | 'Tedarikçi' | 'Tedarikçi + Müşteri';

const SUPPLIER_FILTERS: SupplierFilter[] = ['Tümü', 'Tedarikçi', 'Tedarikçi + Müşteri'];

const FILTER_TO_RELATION: Record<SupplierFilter, string | undefined> = {
  Tümü: undefined,
  Tedarikçi: 'supplier',
  'Tedarikçi + Müşteri': 'supplier_customer',
};

export type SupplierPickResult = {
  id: string;
  name: string;
  location?: string;
  relationLabel?: string;
};

function relationTypeCodeFromRow(row: Record<string, unknown>): string {
  const rel = row.relationType as Record<string, unknown> | undefined;
  return String(rel?.code ?? '').toLowerCase();
}

function relationLabelFromRow(row: Record<string, unknown>): string | undefined {
  const code = relationTypeCodeFromRow(row);
  if (code === 'supplier') return 'Tedarikçi';
  if (code === 'supplier_customer') return 'Tedarikçi + Müşteri';
  const rel = row.relationType as Record<string, unknown> | undefined;
  return rel?.name ? String(rel.name) : undefined;
}

function companyCodeFromRow(row: Record<string, unknown>): string | undefined {
  if (row.taxNumber) return `VD-${String(row.taxNumber).slice(-4)}`;
  if (row.id) return `TD-${String(row.id).slice(0, 4).toUpperCase()}`;
  return undefined;
}

function isSupplierRow(row: Record<string, unknown>): boolean {
  const code = relationTypeCodeFromRow(row);
  return code === 'supplier' || code === 'supplier_customer';
}

function SupplierPickerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerBtn} />
    </View>
  );
}

function SupplierFilterChips({
  value,
  onChange,
}: {
  value: SupplierFilter;
  onChange: (v: SupplierFilter) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      {SUPPLIER_FILTERS.map((f) => {
        const active = f === value;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            style={[styles.filterChip, active && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
              {f}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SupplierPickerCard({
  title,
  code,
  location,
  relationLabel,
  selected,
  onPress,
}: {
  title: string;
  code?: string;
  location?: string;
  relationLabel?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressFade(pressed)]}
    >
      <ServiceTicketCompanyAvatar name={title} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>
        {code ? <Text style={styles.cardCode}>{code}</Text> : null}
        {location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={colors.outline} />
            <Text style={styles.locationText} numberOfLines={1}>
              {location}
            </Text>
          </View>
        ) : null}
        {relationLabel ? (
          <View style={styles.relationBadge}>
            <Text style={styles.relationBadgeText}>{relationLabel.toUpperCase()}</Text>
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

/** Stitch Firmalar #01 — satın alma tedarikçi seçici */
export function SupplierPickerSheet({
  visible,
  selectedId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selectedId?: string;
  onClose: () => void;
  onSelect: (company: SupplierPickResult) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<SupplierFilter>('Tümü');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = { pageSize: 80 };
      if (q.trim()) params.search = q.trim();
      const relationTypeCode = FILTER_TO_RELATION[filter];
      if (relationTypeCode) params.relationTypeCode = relationTypeCode;
      const res = await companyService.list(params);
      let rows = normalizeList(res);
      if (filter === 'Tümü') rows = rows.filter(isSupplierRow);
      setItems(rows);
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
        <SupplierPickerHeader title="Tedarikçi Seç" onClose={onClose} />
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <CompaniesSearchField value={q} onChangeText={setQ} />
              <SupplierFilterChips value={filter} onChange={setFilter} />
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : (
              <EmptyState title="Tedarikçi bulunamadı" subtitle="Arama veya filtreyi değiştirmeyi deneyin" />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const id = String(item.id ?? '');
            const title = String(item.legalTitle ?? item.shortName ?? '—');
            return (
              <SupplierPickerCard
                title={title}
                code={companyCodeFromRow(item)}
                location={locationFromRow(item)}
                relationLabel={relationLabelFromRow(item)}
                selected={selectedId === id}
                onPress={() => {
                  onSelect({
                    id,
                    name: title,
                    location: locationFromRow(item),
                    relationLabel: relationLabelFromRow(item),
                  });
                  onClose();
                }}
              />
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.canvas,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  list: { flex: 1 },
  listContent: { paddingHorizontal: layout.containerMargin, paddingBottom: spacing.xxl },
  listHeader: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  filterRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  filterChip: {
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: { ...typography.label, color: colors.onSurfaceVariant },
  filterChipTextActive: { color: '#fff', fontFamily: fonts.semibold },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
    ...shadowCard,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { ...typography.headlineMd, color: colors.textPrimary },
  cardCode: { ...typography.label, color: colors.outline },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { flex: 1, ...typography.label, color: colors.secondary },
  relationBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.secondaryContainer,
  },
  relationBadgeText: { ...typography.caption, color: colors.onSecondaryContainer, fontFamily: fonts.bold },
  separator: { height: spacing.sm },
  loader: { marginTop: spacing.xxl },
});
