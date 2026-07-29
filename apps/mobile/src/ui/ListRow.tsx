import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, typography } from '@/src/theme/tokens';
import { cardElevated, pressFade } from '@/src/theme/styles';
import { STATUS_TONE_STYLES, type StatusTone } from '@/src/ui/statusTone';

type Props = {
  title: string;
  subtitle?: string;
  /** Nötr bilgi rozeti (geriye dönük) */
  badge?: string;
  /** Sol baştaki ikon kabı — Ionicons adı */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** İkon rengi (varsayılan: primary) */
  iconColor?: string;
  /** Nötr rozet için renk tonu */
  badgeTone?: StatusTone;
  /** Renk kodlu durum rozeti */
  statusLabel?: string;
  statusTone?: StatusTone;
  /** Alt satır meta bilgisi (ör. tarih) */
  meta?: string;
  metaIcon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Sağ kenarda gösterilen tutar / değer */
  value?: string;
  onPress?: () => void;
};

export function ListRow({ title, subtitle, badge, badgeTone, icon, iconColor, statusLabel, statusTone, meta, metaIcon, value, onPress }: Props) {
  const status = statusLabel ? STATUS_TONE_STYLES[statusTone ?? 'neutral'] : null;
  const badgeStyle = badge && badgeTone ? STATUS_TONE_STYLES[badgeTone] : null;
  const hasRightCol = !!status || (!!badge && !status) || !!value;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressFade(pressed)]}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={iconColor ?? colors.primary} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <View style={styles.metaRow}>
            <Ionicons name={metaIcon ?? 'calendar-outline'} size={13} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        ) : null}
      </View>
      {hasRightCol ? (
        <View style={styles.rightCol}>
          {status ? (
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusText, { color: status.fg }]} numberOfLines={1}>
                {statusLabel!.toLocaleUpperCase('tr-TR')}
              </Text>
            </View>
          ) : badge ? (
            <View style={[styles.badge, badgeStyle ? { backgroundColor: badgeStyle.bg } : null]}>
              <Text style={[styles.badgeText, badgeStyle ? { color: badgeStyle.fg } : null]}>{badge}</Text>
            </View>
          ) : null}
          {value ? (
            <Text style={styles.value} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    ...cardElevated,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  title: { ...typography.body, fontFamily: fonts.semibold, color: colors.textPrimary },
  sub: { ...typography.label, color: colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.label, color: colors.textMuted },
  rightCol: { alignItems: 'flex-end', gap: 6, maxWidth: 130 },
  statusBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusText: { fontSize: 10, lineHeight: 12, fontFamily: fonts.semibold, letterSpacing: 0.6 },
  value: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 9999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: { ...typography.caption, color: colors.primary },
});
