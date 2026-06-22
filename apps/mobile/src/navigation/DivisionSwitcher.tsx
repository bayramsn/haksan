import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { queryClient } from '../lib/queryClient';
import { colors, radius, spacing } from '../ui/theme';

/** Header'da aktif bölüm seçici. Bölüm değişince tüm sorgular geçersizlenir (yeniden çekilir). */
export function DivisionSwitcher() {
  const { user, activeDivision, setActiveDivision } = useAuth();
  const [open, setOpen] = useState(false);
  const divisions = user?.divisions ?? [];
  const canViewAll = user?.canViewAllDivisions ?? false;
  if (divisions.length <= 1 && !canViewAll) return null;

  const options: Array<{ id: string; name: string }> = [
    ...(canViewAll ? [{ id: 'all', name: 'Tüm Bölümler' }] : []),
    ...divisions.map((d) => ({ id: d.id, name: d.name })),
  ];
  const activeLabel = activeDivision === 'all' ? 'Tümü' : divisions.find((d) => d.id === activeDivision)?.name ?? 'Bölüm';

  const pick = (id: string) => {
    setActiveDivision(id);
    setOpen(false);
    void queryClient.invalidateQueries();
  };

  return (
    <>
      <TouchableOpacity style={s.trigger} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={s.triggerText} numberOfLines={1}>
          {activeLabel}
        </Text>
        <Text style={s.caret}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Aktif Bölüm</Text>
            {options.map((opt) => {
              const active = opt.id === activeDivision;
              return (
                <TouchableOpacity key={opt.id} style={[s.option, active && s.optionActive]} onPress={() => pick(opt.id)}>
                  <Text style={[s.optionText, active && s.optionTextActive]}>{opt.name}</Text>
                  {active ? <Text style={s.check}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    maxWidth: 160,
  },
  triggerText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  caret: { color: colors.textMuted, fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: spacing.xs },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  optionActive: { backgroundColor: colors.accentSoft },
  optionText: { color: colors.text, fontWeight: '700' },
  optionTextActive: { color: colors.accent },
  check: { color: colors.accent, fontWeight: '900' },
});
