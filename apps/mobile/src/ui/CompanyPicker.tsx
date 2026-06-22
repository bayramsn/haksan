import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { companyService } from '../api/services';
import { SearchBar } from './index';
import { colors, radius, spacing } from './theme';

/** Form alanı: firma seçici. Modal içinde arayıp seçim yapar. */
export function CompanyPicker({
  label = 'Firma',
  value,
  valueLabel,
  onChange,
}: {
  label?: string;
  value: string | null;
  valueLabel?: string | null;
  onChange: (id: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  const list = useQuery({
    queryKey: ['company-picker', search],
    queryFn: () => companyService.list({ search: search || undefined, pageSize: 30 }),
    enabled: open,
  });

  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={s.trigger} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[s.triggerText, !value && s.placeholder]} numberOfLines={1}>
          {valueLabel || 'Firma seç…'}
        </Text>
        <Text style={s.caret}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} transparent>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>Firma seç</Text>
            <SearchBar value={searchInput} onChangeText={setSearchInput} placeholder="Firma ara…" autoFocus />
            {list.isLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={(list.data?.data as any[]) ?? []}
                keyExtractor={(c) => c.id}
                keyboardShouldPersistTaps="handled"
                style={s.results}
                renderItem={({ item }) => {
                  const lbl = item.shortName || item.legalTitle;
                  return (
                    <TouchableOpacity
                      style={s.option}
                      onPress={() => {
                        onChange(item.id, lbl);
                        setOpen(false);
                      }}
                    >
                      <Text style={s.optionText}>{lbl}</Text>
                      {item.taxNumber ? <Text style={s.optionSub}>{item.taxNumber}</Text> : null}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={s.empty}>Sonuç yok</Text>}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { color: '#334155', fontSize: 12, fontWeight: '700' },
  trigger: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
  },
  triggerText: { color: colors.text, fontSize: 15, flex: 1 },
  placeholder: { color: colors.textSubtle },
  caret: { color: colors.textMuted },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, maxHeight: '80%' },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  results: { marginTop: spacing.sm },
  option: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  optionText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  optionSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 20 },
});
