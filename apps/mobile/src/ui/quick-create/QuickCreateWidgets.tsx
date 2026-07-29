import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowElevated } from '@/src/theme/styles';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

export type QuickCreateAction = {
  title: string;
  icon: IonIcon;
  accentIcon?: boolean;
  route: string;
};

/** Stitch `2c320b06` — 6 hızlı oluştur aksiyonu */
export const QUICK_CREATE_ACTIONS: QuickCreateAction[] = [
  { title: 'Yeni Firma', icon: 'business-outline', route: '/forms/company' },
  { title: 'Yeni Kontak', icon: 'person-outline', route: '/forms/contact' },
  { title: 'Yeni Satış Kartı', icon: 'trending-up-outline', route: '/forms/opportunity' },
  { title: 'Yeni Teklif', icon: 'document-text-outline', route: '/forms/offer' },
  { title: 'Yeni Ziyaret', icon: 'car-outline', route: '/forms/visit' },
  {
    title: 'Yeni Servis Talebi',
    icon: 'construct',
    accentIcon: true,
    route: '/forms/service-ticket',
  },
];

const stitchServiceRed = '#E31E24';

export function QuickCreateBackdrop({ onPress }: { onPress: () => void }) {
  return <Pressable style={styles.backdrop} onPress={onPress} accessibilityLabel="Kapat" />;
}

export function QuickCreateSheet({
  onClose,
  onCancel,
  onAction,
}: {
  onClose: () => void;
  onCancel: () => void;
  onAction: (route: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.round(height * 0.62);

  return (
    <View style={[styles.sheet, { height: sheetHeight }, shadowElevated]}>
      <View style={styles.handleWrap}>
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Hızlı Oluştur</Text>
          <Text style={styles.subtitle}>Yeni kayıt türünü seçin</Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [styles.closeBtn, pressFade(pressed)]}
          accessibilityLabel="Kapat"
        >
          <Ionicons name="close" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.gridWrap}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.grid}>
          {QUICK_CREATE_ACTIONS.map((action) => (
            <QuickCreateTile key={action.title} action={action} onPress={() => onAction(action.route)} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 34) }]}>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [styles.cancelBtn, pressFade(pressed)]}
          accessibilityRole="button"
          accessibilityLabel="İptal"
        >
          <Text style={styles.cancelText}>İptal</Text>
        </Pressable>
      </View>
    </View>
  );
}

function QuickCreateTile({ action, onPress }: { action: QuickCreateAction; onPress: () => void }) {
  const iconColor = action.accentIcon ? stitchServiceRed : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      accessibilityRole="button"
      accessibilityLabel={action.title}
    >
      <Ionicons name={action.icon} size={32} color={iconColor} />
      <Text style={styles.tileText}>{action.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.headline,
    color: colors.stitchPrimary,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.outline,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  gridWrap: {
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    width: '48%',
    minHeight: 96,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.surfaceVariant,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  tilePressed: {
    backgroundColor: colors.surfaceContainerLow,
  },
  tileText: {
    ...typography.bodySm,
    fontFamily: fonts.semibold,
    color: colors.stitchPrimary,
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    backgroundColor: colors.card,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
  },
  cancelBtn: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  cancelText: {
    ...typography.body,
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
});
