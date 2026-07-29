import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, layout, spacing } from '@/src/theme/tokens';

type Tab<T extends string> = { key: T; label: string };

type Props<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (key: T) => void;
  variant?: 'underline' | 'pill' | 'dashboard';
  /** Stitch detay ekranları — yatay kaydırmalı alt çizgi sekmeler */
  scrollable?: boolean;
};

/** Stitch segmented / detay sekmeleri */
export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
  variant = 'underline',
  scrollable = false,
}: Props<T>) {
  if (variant === 'dashboard' || variant === 'pill') {
    const isDashboard = variant === 'dashboard';
    return (
      <View style={isDashboard ? styles.dashboardWrap : styles.pillWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {tabs.map((t) => {
            const active = t.key === value;
            return (
              <Pressable
                key={t.key}
                onPress={() => onChange(t.key)}
                style={[
                  styles.pill,
                  isDashboard && styles.dashboardPill,
                  active && (isDashboard ? styles.dashboardPillActive : styles.pillActive),
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    isDashboard && styles.dashboardPillText,
                    active && (isDashboard ? styles.dashboardPillTextActive : styles.pillTextActive),
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.underlineWrap}>
      {scrollable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.underlineScrollRow}>
          {tabs.map((t) => {
            const active = t.key === value;
            return (
              <Pressable
                key={t.key}
                onPress={() => onChange(t.key)}
                style={[styles.underlineTabScroll, active && styles.underlineTabActive]}
              >
                <Text style={[styles.underlineText, active && styles.underlineTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.underlineRow}>
          {tabs.map((t) => {
            const active = t.key === value;
            return (
              <Pressable
                key={t.key}
                onPress={() => onChange(t.key)}
                style={[styles.underlineTab, active && styles.underlineTabActive]}
              >
                <Text style={[styles.underlineText, active && styles.underlineTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  underlineWrap: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  underlineRow: { flexDirection: 'row' },
  underlineScrollRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.xs,
  },
  underlineTab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  underlineTabScroll: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  underlineTabActive: { borderBottomColor: colors.primary },
  underlineText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  underlineTextActive: {
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  pillWrap: {
    backgroundColor: colors.canvas,
    paddingVertical: spacing.sm,
    paddingHorizontal: layout.screenPadding,
  },
  dashboardWrap: {
    backgroundColor: 'transparent',
    paddingBottom: spacing.sm,
  },
  dashboardPill: {
    minHeight: 32,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
  },
  dashboardPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dashboardPillText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.onSurfaceVariant,
    letterSpacing: 0.24,
  },
  dashboardPillTextActive: {
    fontFamily: fonts.medium,
    color: '#fff',
  },
  pillRow: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: 9999,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  pillTextActive: {
    fontFamily: fonts.semibold,
    color: '#fff',
  },
});
