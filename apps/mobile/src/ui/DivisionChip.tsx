import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { getActiveDivision, setActiveDivision } from '@/src/api/apiClient';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';

/**
 * Figma TopBar bölüm seçici chip'i ("Tümü" + chevron). Yalnızca birden çok bölüm
 * gören ya da tüm bölümleri görebilen kullanıcılar değiştirebilir (handoff §4).
 * Seçim `X-Active-Division` için apiClient'a yazılır; ekranlar bir sonraki
 * fetch'te yeni bölümü kullanır.
 */
export function DivisionChip({ onChange }: { onChange?: () => void }) {
  const { user } = useAuth();
  const divisions = user?.divisions ?? [];
  const canAll = Boolean(user?.roles.includes('super_admin') && user?.canViewAllDivisions);
  const [activeId, setActiveId] = useState<string | null>(getActiveDivision());
  const [open, setOpen] = useState(false);

  const current = activeId ? divisions.find((d) => d.id === activeId) : null;
  const label = current?.name ?? 'Tümü';
  const switchable = canAll;

  const select = (id: string | null) => {
    void setActiveDivision(id);
    setActiveId(id);
    setOpen(false);
    onChange?.();
  };

  return (
    <>
      <Pressable
        style={styles.chip}
        onPress={() => switchable && setOpen(true)}
        disabled={!switchable}
        accessibilityRole="button"
        accessibilityLabel={`Aktif bölüm: ${label}`}
      >
        <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
        {switchable ? <Ionicons name="chevron-down" size={12} color={colors.textMuted} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Aktif Bölüm</Text>
            {canAll ? <Row label="Tümü" active={activeId === null} onPress={() => select(null)} /> : null}
            {divisions.map((d) => (
              <Row key={d.id} label={d.name} active={activeId === d.id} onPress={() => select(d.id)} />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Row({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={[styles.rowText, active && styles.rowTextActive]}>{label}</Text>
      {active ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(0,12,105,0.15)',
    backgroundColor: 'rgba(0,12,105,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.textPrimary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xs,
  },
  sheetTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  row: {
    minHeight: layout.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowText: { ...typography.body, color: colors.textPrimary },
  rowTextActive: { fontFamily: fonts.semibold, color: colors.primary },
});
