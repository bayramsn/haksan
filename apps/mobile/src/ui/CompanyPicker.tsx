import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { companyService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { ListRow } from '@/src/ui/ListRow';
import { SearchBar } from '@/src/ui/SearchBar';
import { SheetHeader } from '@/src/ui/SheetHeader';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

type Company = { id: string; legalTitle?: string; shortName?: string };

type Props = {
  label?: string;
  value?: string;
  displayName?: string;
  onSelect: (company: Company) => void;
};

/** Firma arama ve seçim — Stitch sheet */
export function CompanyPicker({ label = 'Firma', value, displayName, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const res = await companyService.list({ q: term || undefined, pageSize: 30 });
      setItems(normalizeList(res) as Company[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(q), 300);
    return () => clearTimeout(t);
  }, [open, q, search]);

  const selectedLabel = displayName ?? (value ? `Seçili: ${value.slice(0, 8)}…` : 'Firma seçin…');

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={({ pressed }) => [styles.trigger, pressFade(pressed)]} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <SheetHeader title="Firma Seç" onClose={() => setOpen(false)}>
            <View style={styles.search}>
              <SearchBar value={q} onChangeText={setQ} placeholder="Firma ara…" />
            </View>
          </SheetHeader>
          {loading ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          ) : (
            <FlatList
              style={styles.list}
              data={items}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <ListRow
                  title={item.legalTitle ?? item.shortName ?? item.id}
                  subtitle={item.shortName && item.legalTitle ? item.shortName : undefined}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                />
              )}
              ListEmptyComponent={<Text style={styles.empty}>Sonuç yok</Text>}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { ...typography.bodySm, fontFamily: fonts.medium, color: colors.textPrimary },
  trigger: {
    minHeight: layout.touchMin,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerText: { flex: 1, ...typography.body, color: colors.textPrimary },
  placeholder: { color: colors.textMuted },
  sheet: { flex: 1, backgroundColor: colors.canvas },
  search: { marginTop: spacing.sm },
  loader: { marginTop: spacing.xxl },
  list: { flex: 1 },
  listContent: { padding: layout.screenPadding, paddingTop: spacing.sm },
  empty: { ...typography.bodySm, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxxl },
});
