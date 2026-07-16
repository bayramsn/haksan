import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors, fonts, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

export type SalesShortcut = {
  key: string;
  label: string;
  icon: IonIcon;
  route: string;
};

/** Satış sekmesi — hızlı modül erişimi (Stitch Satış Kartları üst şerit) */
export const SALES_SHORTCUTS: SalesShortcut[] = [
  { key: 'sales-cases', label: 'Kartlar', icon: 'briefcase-outline', route: '/(tabs)/sales' },
  { key: 'offers', label: 'Teklifler', icon: 'document-text-outline', route: '/modules/offers' },
  { key: 'proformas', label: 'Proformalar', icon: 'document-outline', route: '/modules/proformas' },
  { key: 'contracts', label: 'Sözleşmeler', icon: 'reader-outline', route: '/modules/contracts' },
];

export function SalesModuleShortcuts({
  activeKey,
  onNavigate,
}: {
  activeKey?: string;
  onNavigate: (route: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {SALES_SHORTCUTS.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            onPress={() => onNavigate(item.route)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressFade(pressed),
            ]}
          >
            <Ionicons
              name={item.icon}
              size={16}
              color={active ? '#fff' : colors.primary}
            />
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipLabel: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  chipLabelActive: {
    color: '#fff',
  },
});
