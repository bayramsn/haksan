import { useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NotificationDTO } from '@/src/api/services';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export const NOTIFICATION_FILTERS = ['Tümü', 'Okunmamış', 'Sistem'] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export type NotificationTheme = {
  accent: string;
  iconBg: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled?: boolean;
};

/** Stitch `176b14a5` — geri | başlık | tümünü okundu işaretle */
export function NotificationsHeader({
  onMarkAllRead,
  markingAll,
}: {
  onMarkAllRead?: () => void;
  markingAll?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.headerSide, pressFade(pressed)]}
          accessibilityLabel="Geri"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Bildirimler</Text>
        <Pressable
          onPress={onMarkAllRead}
          disabled={markingAll}
          hitSlop={4}
          style={({ pressed }) => [styles.markAllBtn, pressFade(pressed)]}
        >
          <Text style={styles.markAllText} numberOfLines={2}>
            {markingAll ? '…' : 'Tümünü okundu işaretle'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function NotificationSegmentControl({
  value,
  onChange,
  unreadCount,
}: {
  value: NotificationFilter;
  onChange: (v: NotificationFilter) => void;
  unreadCount: number;
}) {
  const labels: Record<NotificationFilter, string> = {
    Tümü: 'Tümü',
    Okunmamış: unreadCount > 0 ? `Okunmamış (${unreadCount})` : 'Okunmamış',
    Sistem: 'Sistem',
  };

  return (
    <View style={styles.segmentOuter}>
      <View style={styles.segmentWrap}>
        {NOTIFICATION_FILTERS.map((f) => {
          const active = f === value;
          return (
            <Pressable
              key={f}
              onPress={() => onChange(f)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                {labels[f]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function NotificationSectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>;
}

export function NotificationCard({
  title,
  subtitle,
  timeLabel,
  theme,
  unread,
  onPress,
}: {
  title: string;
  subtitle: string;
  timeLabel: string;
  theme: NotificationTheme;
  unread: boolean;
  onPress?: () => void;
}) {
  const readOpacity = unread ? 1 : 0.7;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, shadowCard, pressFade(pressed)]}
    >
      <View style={[styles.cardStripe, { backgroundColor: theme.accent }]} />
      <View style={[styles.iconCircle, { backgroundColor: theme.iconBg }]}>
        <Ionicons name={theme.icon} size={20} color={theme.accent} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { opacity: readOpacity }]} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardTime}>{timeLabel}</Text>
            {unread ? <View style={styles.unreadDot} /> : null}
          </View>
        </View>
        <Text style={[styles.cardSubtitle, { opacity: readOpacity }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

/** Stitch swipe — okundu (sağa) / sil (sola) */
export function NotificationSwipeRow({
  children,
  onMarkRead,
  onDelete,
}: {
  children: React.ReactNode;
  onMarkRead?: () => void;
  onDelete?: () => void;
}) {
  const x = useRef(new Animated.Value(0)).current;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dy) < 12,
      onPanResponderMove: (_, g) => {
        x.setValue(Math.max(-100, Math.min(100, g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -72) {
          Animated.spring(x, { toValue: -88, useNativeDriver: true, bounciness: 0 }).start();
        } else if (g.dx >= 72) {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          onMarkRead?.();
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.swipeActions}>
        <Pressable
          onPress={() => {
            Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
            onMarkRead?.();
          }}
          style={styles.swipeRead}
        >
          <Ionicons name="checkmark-done" size={20} color="#fff" />
          <Text style={styles.swipeActionLabel}>Okundu</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
            onDelete?.();
          }}
          style={styles.swipeDelete}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.swipeActionLabel}>Sil</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

export function themeFromNotification(n: NotificationDTO): NotificationTheme {
  const type = n.type.toLowerCase();
  const entity = (n.entityType ?? '').toLowerCase();

  if (type.includes('service') || entity.includes('service')) {
    return { accent: '#E31E24', iconBg: 'rgba(227, 30, 36, 0.1)', icon: 'construct', iconFilled: true };
  }
  if (
    type.includes('opportunity') ||
    entity === 'opportunity' ||
    type.includes('quote') ||
    type.includes('sales') ||
    type.includes('approval')
  ) {
    return { accent: '#000c69', iconBg: 'rgba(0, 12, 105, 0.1)', icon: 'trending-up-outline' };
  }
  if (type.includes('calendar') || type.includes('visit') || type.includes('meeting') || type.includes('event')) {
    return { accent: '#2196F3', iconBg: 'rgba(33, 150, 243, 0.1)', icon: 'calendar-outline' };
  }
  if (type.includes('payment') || type.includes('invoice') || type.includes('finance') || type.includes('fatura')) {
    return { accent: '#FB8C00', iconBg: 'rgba(251, 140, 0, 0.1)', icon: 'card-outline' };
  }
  if (type.includes('chat') || type.includes('mention')) {
    return { accent: '#8E24AA', iconBg: 'rgba(142, 36, 170, 0.1)', icon: 'chatbubble-outline' };
  }
  if (type.includes('system') || type.includes('app') || type.includes('version') || type.includes('sürüm')) {
    return { accent: '#757575', iconBg: 'rgba(117, 117, 117, 0.1)', icon: 'information-circle-outline' };
  }
  return { accent: '#000c69', iconBg: 'rgba(0, 12, 105, 0.1)', icon: 'notifications-outline' };
}

export function isSystemNotification(n: NotificationDTO): boolean {
  const type = n.type.toLowerCase();
  if (type.includes('system') || type.includes('app') || type.includes('version') || type.includes('sürüm')) {
    return true;
  }
  if (type.includes('company_access') || type.includes('maintenance')) return true;
  return !n.entityType && !type.includes('service') && !type.includes('quote');
}

export function matchesNotificationFilter(n: NotificationDTO, filter: NotificationFilter): boolean {
  if (filter === 'Tümü') return true;
  if (filter === 'Okunmamış') return !n.readAt;
  if (filter === 'Sistem') return isSystemNotification(n);
  return true;
}

export function formatNotificationTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Az önce';
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} saat önce`;
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffDay === 1) return 'Dün';
    if (diffDay < 7) return `${diffDay} gün önce`;
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
}

export type NotificationSection = { title: string; data: NotificationDTO[] };

export function groupNotificationsByDate(items: NotificationDTO[]): NotificationSection[] {
  const order = ['Bugün', 'Dün', 'Bu Hafta', 'Daha Eski'] as const;
  const buckets = new Map<string, NotificationDTO[]>();
  for (const label of order) buckets.set(label, []);

  const now = new Date();
  for (const item of items) {
    const d = new Date(item.createdAt);
    let label: (typeof order)[number] = 'Daha Eski';
    if (d.toDateString() === now.toDateString()) label = 'Bugün';
    else {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) label = 'Dün';
      else if (now.getTime() - d.getTime() < 7 * 86400000) label = 'Bu Hafta';
    }
    buckets.get(label)!.push(item);
  }

  return order
    .map((title) => ({ title, data: buckets.get(title) ?? [] }))
    .filter((s) => s.data.length > 0);
}

export function notificationSubtitle(n: NotificationDTO): string {
  return String(n.body ?? '').trim() || '—';
}

const cardStripe: ViewStyle = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: 4,
  borderTopLeftRadius: radius.lg,
  borderBottomLeftRadius: radius.lg,
};

const styles = StyleSheet.create({
  headerWrap: { backgroundColor: colors.canvas },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
  },
  headerSide: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
    flex: 1,
    textAlign: 'center',
  },
  markAllBtn: {
    width: 88,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  markAllText: {
    ...typography.label,
    color: colors.primary,
    textAlign: 'right',
  },
  segmentOuter: {
    backgroundColor: colors.canvas,
    paddingHorizontal: layout.containerMargin,
    paddingVertical: spacing.sm,
    ...shadowCard,
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.md,
    padding: 2,
    height: 36,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingHorizontal: spacing.xs,
  },
  segmentBtnActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  segmentText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    color: colors.onPrimaryContainer,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.outline,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    paddingLeft: spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  cardStripe: cardStripe,
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.bodySm,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
    marginTop: 2,
  },
  cardTime: {
    ...typography.caption,
    color: colors.outline,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2196F3',
  },
  cardSubtitle: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    marginTop: spacing.xs,
  },
  swipeWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  swipeActions: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 0,
  },
  swipeRead: {
    flex: 1,
    backgroundColor: '#4CAF50',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: spacing.lg,
    gap: spacing.xs,
  },
  swipeDelete: {
    flex: 1,
    backgroundColor: '#E31E24',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: spacing.lg,
    gap: spacing.xs,
  },
  swipeActionLabel: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: '#fff',
  },
});
