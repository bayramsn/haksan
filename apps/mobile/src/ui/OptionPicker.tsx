import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ListRow } from '@/src/ui/ListRow';
import { SearchBar } from '@/src/ui/SearchBar';
import { SheetHeader } from '@/src/ui/SheetHeader';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

export type PickerOption = { value: string; label: string; hint?: string };

type Props = {
  label: string;
  /** Tetikleyicide gösterilen seçili etiket; boşsa placeholder. */
  display?: string | null;
  placeholder?: string;
  /** Yerel seçenekler — `onSearch` verilmezse arama bunlar içinde yapılır. */
  options?: readonly PickerOption[];
  /** Uzaktan arama (ör. ürün kataloğu). */
  onSearch?: (term: string) => Promise<PickerOption[]>;
  /** Listede olmayan değeri yazıp kullanmaya izin verir. */
  allowCustom?: boolean;
  /** "Boş bırak" satırı; seçim `null` ile döner. */
  clearLabel?: string;
  onSelect: (option: PickerOption | null) => void;
};

const foldTr = (value: string) => value.toLocaleLowerCase('tr-TR');

/** Aranabilir seçim sayfası — firma seçici ile aynı düzen. */
export function OptionPicker({ label, display, placeholder = 'Seçin…', options, onSearch, allowCustom, clearLabel, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !onSearch) return;
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      onSearch(q.trim())
        .then((rows) => alive && setRemote(rows))
        .catch(() => alive && setRemote([]))
        .finally(() => alive && setLoading(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, q, onSearch]);

  const items = useMemo(() => {
    if (onSearch) return remote;
    const term = foldTr(q.trim());
    return (options ?? []).filter((o) => !term || foldTr(`${o.label} ${o.hint ?? ''}`).includes(term));
  }, [onSearch, remote, options, q]);

  const custom = q.trim();
  const showCustom = allowCustom && custom.length > 0 && !items.some((o) => foldTr(o.label) === foldTr(custom));

  // Kapanınca arama sıfırlanır; tekrar açılınca eski filtre/sonuç görünmesin.
  const close = () => {
    setOpen(false);
    setQ('');
    setRemote([]);
  };

  const pick = (option: PickerOption | null) => {
    onSelect(option);
    close();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={({ pressed }) => [styles.trigger, pressFade(pressed)]} onPress={() => setOpen(true)} accessibilityLabel={label}>
        <Text style={[styles.triggerText, !display && styles.placeholder]} numberOfLines={1}>
          {display || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View style={styles.sheet}>
          <SheetHeader title={label} onClose={close}>
            <View style={styles.search}>
              <SearchBar value={q} onChangeText={setQ} placeholder={`${label} ara…`} />
            </View>
          </SheetHeader>
          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={(i) => i.value}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <>
                {clearLabel ? <ListRow title={clearLabel} icon="close-circle-outline" iconColor={colors.textMuted} onPress={() => pick(null)} /> : null}
                {showCustom ? <ListRow title={`"${custom}" kullan`} icon="add-circle-outline" onPress={() => pick({ value: custom, label: custom })} /> : null}
                {loading ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : null}
              </>
            }
            renderItem={({ item }) => <ListRow title={item.label} subtitle={item.hint} onPress={() => pick(item)} />}
            ListEmptyComponent={loading || showCustom ? null : <Text style={styles.empty}>Sonuç yok</Text>}
          />
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
  loader: { marginVertical: spacing.lg },
  list: { flex: 1 },
  listContent: { padding: layout.screenPadding, paddingTop: spacing.sm, gap: spacing.sm },
  empty: { ...typography.bodySm, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxxl },
});
