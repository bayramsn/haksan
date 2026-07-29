import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SHIPMENT_STATUS_OPTIONS,
  statusCodeFromRow,
} from '@/src/ui/shipments/shipmentHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

/** Stitch Sevkiyat v3 — `7e87f202100f4ec3936c28295bd7c12f` */
type Props = {
  visible: boolean;
  data: Record<string, unknown> | null;
  loading?: boolean;
  onClose: () => void;
  onSelect: (statusCode: string) => void;
};

export function ShipmentStatusSheet({ visible, data, loading, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const current = data ? statusCodeFromRow(data) : '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Durum Güncelle</Text>
          <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Sevkiyatın güncel durumunu seçin</Text>

        <View style={styles.options}>
          {SHIPMENT_STATUS_OPTIONS.map((opt) => {
            const selected = opt.code === current;
            return (
              <Pressable
                key={opt.code}
                disabled={loading || selected}
                onPress={() => onSelect(opt.code)}
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  pressFade(pressed),
                  (loading || selected) && { opacity: selected ? 1 : 0.7 },
                ]}
              >
                <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                  <Ionicons
                    name={opt.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={selected ? '#fff' : colors.primary}
                  />
                </View>
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{opt.label}</Text>
                {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Güncelleniyor…</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceContainerHigh,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: { ...typography.headlineMd, color: colors.textPrimary, fontFamily: fonts.bold },
  subtitle: { ...typography.bodySm, color: colors.onSurfaceVariant, marginBottom: spacing.lg },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconSelected: { backgroundColor: colors.primary },
  optionLabel: { flex: 1, ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  optionLabelSelected: { color: colors.primary },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  loadingText: { ...typography.label, color: colors.onSurfaceVariant },
});
