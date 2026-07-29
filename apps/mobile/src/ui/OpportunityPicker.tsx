import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { opportunityService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { ListRow } from '@/src/ui/ListRow';
import { SheetHeader } from '@/src/ui/SheetHeader';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

type Opportunity = { id: string; title?: string; requestedProduct?: string };

type Props = {
  label?: string;
  companyId?: string;
  value?: string;
  displayName?: string;
  onSelect: (opportunity: Opportunity | null) => void;
};

/** Satış kartı seçimi — web QuoteDialog "Satış Kartı" alanı */
export function OpportunityPicker({
  label = 'Satış Kartı',
  companyId,
  value,
  displayName,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await opportunityService.list({ companyId, pageSize: 50 });
      setItems(normalizeList(res) as Opportunity[]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const oppLabel = (o: Opportunity) => {
    const short = o.id.slice(0, 8).toUpperCase();
    const detail = o.title ?? o.requestedProduct;
    return detail ? `#${short} · ${detail}` : `#${short}`;
  };

  const selectedLabel = !companyId
    ? 'Önce firma seçin'
    : displayName ?? (value ? oppLabel({ id: value, title: displayName }) : 'Otomatik oluştur');

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [styles.trigger, !companyId && styles.triggerDisabled, pressFade(pressed)]}
        onPress={() => companyId && setOpen(true)}
        disabled={!companyId}
      >
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {value ? selectedLabel : 'Otomatik oluştur'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <SheetHeader title="Satış Kartı" onClose={() => setOpen(false)} />
          {loading ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          ) : (
            <FlatList
              style={styles.list}
              data={items}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                <ListRow
                  title="Otomatik oluştur"
                  subtitle="Yeni satış kartı açılır"
                  onPress={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                />
              }
              renderItem={({ item }) => (
                <ListRow title={oppLabel(item)} onPress={() => {
                  onSelect(item);
                  setOpen(false);
                }} />
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>Bu firmaya ait açık satış kartı yok — otomatik oluşturulacak</Text>
              }
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
  triggerDisabled: { opacity: 0.55 },
  triggerText: { flex: 1, ...typography.body, color: colors.textPrimary },
  placeholder: { color: colors.textMuted },
  sheet: { flex: 1, backgroundColor: colors.canvas },
  loader: { marginTop: spacing.xxl },
  list: { flex: 1 },
  listContent: { padding: layout.screenPadding, paddingTop: spacing.sm },
  empty: { ...typography.bodySm, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxxl },
});
