import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { companyService, contactService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import {
  ContactCompanyChip,
  ContactNoneCard,
  ContactPickerCard,
  ContactPickerFooter,
  ContactPickerHeader,
  ContactPickerSearch,
  contactDisplayName,
  type ContactRow,
} from '@/src/ui/contact/ContactPickerWidgets';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

type Props = {
  label?: string;
  companyId?: string;
  companyName?: string;
  value?: string;
  displayName?: string;
  onSelect: (contact: ContactRow | null) => void;
};

/** Stitch Kontak Seç — `a505fa251b334b55af483eb03c989090` */
export function ContactPicker({
  label = 'Kontak',
  companyId,
  companyName: companyNameProp,
  value,
  displayName,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ContactRow[]>([]);
  const [companyName, setCompanyName] = useState(companyNameProp ?? '');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const [contactsRes, company] = await Promise.all([
        contactService.list({ companyId, pageSize: 100, search: q.trim() || undefined }),
        companyNameProp
          ? Promise.resolve(null)
          : companyService.get(companyId).catch(() => null),
      ]);
      setItems(normalizeList(contactsRes) as ContactRow[]);
      if (!companyNameProp && company) {
        setCompanyName(String(company.legalTitle ?? company.shortName ?? ''));
      }
    } finally {
      setLoading(false);
    }
  }, [companyId, companyNameProp, q]);

  useEffect(() => {
    if (companyNameProp) setCompanyName(companyNameProp);
  }, [companyNameProp]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, load, q]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((c) => {
      const hay = [
        contactDisplayName(c),
        c.title,
        c.workPhone,
        c.mobilePhone,
        c.workEmail,
        c.personalEmail,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [items, q]);

  const selectedLabel = !companyId
    ? 'Önce firma seçin'
    : displayName ?? (value ? `Seçili: ${value.slice(0, 8)}…` : 'Belirtilmedi');

  const close = () => setOpen(false);

  const pick = (contact: ContactRow | null) => {
    onSelect(contact);
    close();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [styles.trigger, !companyId && styles.triggerDisabled, pressFade(pressed)]}
        onPress={() => companyId && setOpen(true)}
        disabled={!companyId}
      >
        <Text style={[styles.triggerText, !value && !displayName && styles.placeholder]} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View style={styles.sheet}>
          <ContactPickerHeader onBack={close} onClose={close} />
          <ContactPickerSearch value={q} onChangeText={setQ} />
          {companyName ? <ContactCompanyChip companyName={companyName} /> : null}

          {loading ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          ) : (
            <FlatList
              style={styles.list}
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <ContactNoneCard selected={!value} onPress={() => pick(null)} />
              }
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <ContactPickerCard
                  contact={item}
                  selected={value === item.id}
                  onPress={() => pick(item)}
                />
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {q.trim() ? 'Aramayla eşleşen kontak yok' : 'Bu firmaya ait kontak yok'}
                </Text>
              }
            />
          )}

          <ContactPickerFooter
            onAddContact={() => {
              close();
              router.push(companyId ? `/forms/contact?companyId=${companyId}` : '/forms/contact');
            }}
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
  triggerDisabled: { opacity: 0.55 },
  triggerText: { flex: 1, ...typography.body, color: colors.textPrimary },
  placeholder: { color: colors.textMuted },
  sheet: { flex: 1, backgroundColor: colors.canvas },
  loader: { marginTop: spacing.xxl },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  separator: { height: spacing.sm },
  empty: {
    ...typography.bodySm,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xxxl,
    paddingHorizontal: layout.containerMargin,
  },
});
