import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import type { NavKey } from '@/src/navigation/modules';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';
import { DivisionChip } from '@/src/ui/DivisionChip';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

export type OpsQuickTile = {
  key: NavKey;
  label: string;
  icon: IonIcon;
  subtitle: string;
  alertDot?: boolean;
};

export type OpsTodayItem = {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: 'success' | 'warning' | 'neutral' | 'plan';
  route: string;
};

export type OpsAlert = {
  id: string;
  message: string;
  highlight?: string;
};

const cardBase: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  ...shadowCard,
};

/** Stitch `59dda0b6` — Operasyon üst bar */
export function OperationsHubHeader({
  onBack,
  onSearch,
  onNotifications,
  notificationCount = 0,
}: {
  onBack?: () => void;
  onSearch?: () => void;
  onNotifications?: () => void;
  notificationCount?: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed, pressFade(pressed)]}
          accessibilityLabel="Menü"
        >
          <Ionicons name="menu-outline" size={24} color={colors.onSecondaryContainer} />
        </Pressable>
        <Text style={styles.headerTitle}>Operasyon</Text>
        <View style={styles.headerActions}>
          <DivisionChip />
          <Pressable
            onPress={onSearch}
            hitSlop={8}
            style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed, pressFade(pressed)]}
            accessibilityLabel="Ara"
          >
            <Ionicons name="search-outline" size={24} color={colors.onSecondaryContainer} />
          </Pressable>
          <Pressable
            onPress={onNotifications}
            hitSlop={8}
            style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed, pressFade(pressed)]}
            accessibilityLabel="Bildirimler"
          >
            <Ionicons name="notifications-outline" size={24} color={colors.onSecondaryContainer} />
            {notificationCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const SUMMARY_METRICS = [
  { key: 'pendingShipments', label: 'Bekleyen Sevkiyat' },
  { key: 'activeInstallations', label: 'Aktif Kurulum' },
  { key: 'stockAlerts', label: 'Stok Uyarısı' },
] as const;

export function OperationsDailySummary({
  dateLabel,
  pendingShipments,
  activeInstallations,
  stockAlerts,
}: {
  dateLabel: string;
  pendingShipments: number;
  activeInstallations: number;
  stockAlerts: number;
}) {
  const values = { pendingShipments, activeInstallations, stockAlerts };

  return (
    <View style={[styles.summaryCard, cardBase]}>
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryTitle} numberOfLines={1}>
          Günlük Özet
        </Text>
        <Text style={styles.summaryDate} numberOfLines={1}>
          {dateLabel}
        </Text>
      </View>
      <View style={styles.summaryGrid}>
        {SUMMARY_METRICS.map((metric, index) => {
          const value = values[metric.key];
          const isStockAlert = metric.key === 'stockAlerts';

          return (
            <View
              key={metric.key}
              style={[styles.summaryCell, index > 0 && styles.summaryCellBorder]}
            >
              <View style={styles.summaryCellLabelWrap}>
                <Text style={styles.summaryCellLabel} numberOfLines={2}>
                  {metric.label}
                </Text>
              </View>
              <Text
                style={[
                  styles.summaryCellValue,
                  isStockAlert && value > 0 && styles.summaryCellValueError,
                ]}
              >
                {value}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function OperationsQuickAccess({
  tiles,
  onTilePress,
}: {
  tiles: OpsQuickTile[];
  onTilePress: (key: NavKey) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Hızlı Erişim</Text>
      <View style={styles.quickGrid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            onPress={() => onTilePress(tile.key)}
            style={({ pressed }) => [styles.quickTile, cardBase, pressFade(pressed)]}
          >
            {tile.alertDot ? <View style={styles.quickAlertDot} /> : null}
            <View style={styles.quickIconWrap}>
              <Ionicons name={tile.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.quickLabel}>{tile.label}</Text>
            <Text style={styles.quickSubtitle}>{tile.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function OperationsTodaySection({
  items,
  onSeeAll,
  onItemPress,
}: {
  items: OpsTodayItem[];
  onSeeAll?: () => void;
  onItemPress?: (item: OpsTodayItem) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Bugünkü İşlemler</Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={styles.seeAll}>Tümünü Gör</Text>
        </Pressable>
      </View>
      <View style={[styles.todayCard, cardBase]}>
        {items.length === 0 ? (
          <Text style={styles.emptyToday}>Bugün planlanmış operasyon kaydı yok</Text>
        ) : (
          items.map((item, index) => (
            <View key={item.id}>
              <Pressable
                onPress={() => onItemPress?.(item)}
                style={({ pressed }) => [styles.todayRow, pressed && styles.todayRowPressed]}
              >
                <Text style={styles.todayTime}>{item.time}</Text>
                <View style={styles.todayBody}>
                  <Text style={styles.todayTitle}>{item.title}</Text>
                  <Text style={styles.todaySubtitle}>{item.subtitle}</Text>
                </View>
                <OpsStatusBadge label={item.statusLabel} tone={item.statusTone} />
              </Pressable>
              {index < items.length - 1 ? <View style={styles.todayDivider} /> : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function OpsStatusBadge({ label, tone }: { label: string; tone: OpsTodayItem['statusTone'] }) {
  const toneStyle =
    tone === 'success'
      ? styles.badgeSuccess
      : tone === 'warning'
        ? styles.badgeWarning
        : tone === 'plan'
          ? styles.badgePlan
          : styles.badgeNeutral;

  return (
    <View style={[styles.badge, toneStyle]}>
      <Text
        style={[
          styles.badgeText,
          tone === 'success' && styles.badgeTextSuccess,
          tone === 'warning' && styles.badgeTextWarning,
          tone === 'plan' && styles.badgeTextPlan,
          tone === 'neutral' && styles.badgeTextNeutral,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function OperationsAlertsSection({ alerts }: { alerts: OpsAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.alertsTitleRow}>
        <Ionicons name="warning-outline" size={20} color={colors.error} />
        <Text style={styles.sectionTitle}>Kritik Uyarılar</Text>
      </View>
      <View style={styles.alertsList}>
        {alerts.map((alert) => (
          <View key={alert.id} style={[styles.alertCard, cardBase]}>
            <Text style={styles.alertText}>
              {alert.highlight ? (
                <>
                  {alert.message.split(alert.highlight)[0]}
                  <Text style={styles.alertHighlight}>{alert.highlight}</Text>
                  {alert.message.split(alert.highlight)[1] ?? ''}
                </>
              ) : (
                alert.message
              )}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function formatOpsDateLabel(date = new Date()): string {
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  headerWrap: {
    backgroundColor: colors.canvas,
    zIndex: 50,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: layout.containerMargin,
  },
  headerTitle: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
    flex: 1,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    position: 'relative',
  },
  headerIconBtnPressed: {
    backgroundColor: colors.surfaceContainerLow,
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fonts.semibold,
    color: '#fff',
  },
  summaryCard: {
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
  },
  summaryTitle: {
    ...typography.headlineMd,
    color: colors.textPrimary,
    flex: 1,
    flexShrink: 1,
  },
  summaryDate: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    flexShrink: 0,
    textAlign: 'right',
  },
  summaryGrid: {
    flexDirection: 'row',
    width: '100%',
  },
  summaryCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  summaryCellBorder: {
    borderLeftWidth: 1,
    borderLeftColor: colors.surfaceVariant,
  },
  summaryCellLabelWrap: {
    width: '100%',
    minHeight: typography.label.lineHeight * 2,
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  summaryCellLabel: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  summaryCellValue: {
    ...typography.headline,
    color: colors.primary,
    textAlign: 'center',
    width: '100%',
  },
  summaryCellValueError: {
    color: colors.error,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.headlineMd,
    color: colors.textPrimary,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: {
    ...typography.label,
    color: colors.primary,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  quickTile: {
    width: '47%',
    padding: spacing.lg,
    position: 'relative',
  },
  quickAlertDot: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.error,
  },
  quickIconWrap: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  quickLabel: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  quickSubtitle: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  todayCard: {
    overflow: 'hidden',
  },
  emptyToday: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    padding: spacing.xxl,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  todayRowPressed: {
    backgroundColor: colors.surfaceContainerLow,
  },
  todayTime: {
    width: 48,
    textAlign: 'right',
    ...typography.caption,
    color: colors.onSurfaceVariant,
    flexShrink: 0,
  },
  todayBody: {
    flex: 1,
    minWidth: 0,
  },
  todayTitle: {
    ...typography.bodySm,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
  todaySubtitle: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  todayDivider: {
    height: 1,
    backgroundColor: colors.surfaceVariant,
    marginLeft: spacing.lg,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
    flexShrink: 0,
  },
  badgeSuccess: { backgroundColor: colors.statusActiveBg },
  badgeWarning: { backgroundColor: colors.statusPotentialBg },
  badgeNeutral: { backgroundColor: colors.surfaceContainer },
  badgePlan: { backgroundColor: colors.surfaceVariant },
  badgeText: { ...typography.caption },
  badgeTextSuccess: { color: colors.statusActiveText },
  badgeTextWarning: { color: colors.statusPotentialText },
  badgeTextNeutral: { color: colors.onSurfaceVariant },
  badgeTextPlan: { color: colors.onSurfaceVariant },
  alertsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  alertsList: {
    gap: spacing.sm,
  },
  alertCard: {
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  alertText: {
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  alertHighlight: {
    fontFamily: fonts.medium,
    color: colors.error,
  },
});
