import type { ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';
import type { HomeSection } from './home-policy';

export function HomeSectionTabs({ value, onChange, charts }: { value: HomeSection; onChange: (value: HomeSection) => void; charts: boolean }) {
  const { fontScale, width } = useWindowDimensions();
  const entries: Array<[HomeSection, string]> = [['overview', 'Özet'], ['operations', 'Operasyon'], ...(charts ? [['charts', 'Grafikler'] as [HomeSection, string]] : []), ['targets', 'Hedefler']];
  return <View accessibilityRole="tablist" className="flex-row flex-wrap gap-1 rounded-2xl bg-muted p-1">
    {entries.map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: key === value }} onPress={() => onChange(key)}
      style={{ flexGrow: 1, flexBasis: fontScale > 1.3 || width < 360 ? '45%' : '20%' }}
      className={`min-h-11 items-center justify-center rounded-xl px-2 py-3 ${value === key ? 'bg-card' : ''}`}>
      <Text className={`font-inter-semibold text-[13px] ${value === key ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</Text>
    </Pressable>)}
  </View>;
}

export function HomePanelTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View className="min-h-11 flex-row items-center justify-between gap-3">
    <Text accessibilityRole="header" className="flex-1 font-inter-semibold text-[18px] text-foreground">{title}</Text>
    {action && onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${action}`} onPress={onPress} className="min-h-11 justify-center px-1">
      <Text className="font-inter-medium text-sm text-primary">{action}</Text>
    </Pressable> : null}
  </View>;
}

export function HomeMetric({ label, value, detail, icon, alarm, onPress, compact = false }: {
  label: string; value: string; detail: string; icon: keyof typeof Ionicons.glyphMap; alarm?: boolean; onPress: () => void; compact?: boolean;
}) {
  const { colors } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  if (compact) return <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}, ${detail}`} onPress={onPress}
    className="min-h-11 gap-2 border-b border-border py-4 active:opacity-70">
    <View className="flex-row flex-wrap items-baseline justify-between gap-2">
      <Text className="font-inter-medium text-base text-foreground">{label}</Text>
      <Text className="font-inter-semibold text-[24px]" style={{ fontVariant: ['tabular-nums'], color: alarm ? colors.destructive : colors.foreground }}>{value}</Text>
    </View>
    <Text className="font-inter text-sm text-muted-foreground">{detail}</Text>
  </Pressable>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}, ${detail}`} onPress={onPress}
    style={{ width: fontScale > 1.5 || width < 340 ? '100%' : '48%', flexGrow: 1, borderCurve: 'continuous' }} className="min-h-[116px] gap-2 rounded-2xl border border-border bg-card p-4 active:opacity-70">
    <View className="flex-row items-start justify-between gap-2">
      <Text className="flex-1 font-inter-medium text-[13px] text-muted-foreground">{label}</Text>
      <Ionicons name={icon} size={18} color={alarm ? colors.destructive : colors.mutedForeground} />
    </View>
    <Text className="font-inter-semibold text-[24px] text-foreground" style={{ fontVariant: ['tabular-nums'], color: alarm ? colors.destructive : colors.foreground }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text className="font-inter text-xs text-muted-foreground">{detail}</Text>
  </Pressable>;
}

/** Web DashboardBriefing'in mobil karşılığı: "Bugün" operasyonu, "Gecikenler" geciken alacakları açar. */
export function HomeBriefing({ name, date, summary, onToday, onOverdue }: { name: string; date: string; summary: string; onToday: () => void; onOverdue?: () => void }) {
  return <View className="gap-3">
    <View className="gap-1">
      <Text className="font-inter text-sm text-muted-foreground">{date}</Text>
      <Text accessibilityRole="header" className="font-inter-semibold text-[24px] text-foreground">{name ? `Merhaba ${name}` : 'Merhaba'}</Text>
      <Text className="font-inter text-sm leading-5 text-muted-foreground">{summary}</Text>
    </View>
    <View className="flex-row flex-wrap gap-2">
      <Pressable accessibilityRole="button" onPress={onToday} className="min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-3">
        <Text className="font-inter-medium text-sm text-primary-foreground">Bugünün işleri</Text>
      </Pressable>
      {onOverdue ? <Pressable accessibilityRole="button" onPress={onOverdue} className="min-h-11 items-center justify-center rounded-xl border border-border px-4 py-3">
        <Text className="font-inter-medium text-sm text-foreground">Geciken alacaklar</Text>
      </Pressable> : null}
    </View>
  </View>;
}

/** Görev takibi panelindeki dokunulabilir sayaç (web: Bana atanan açık / Bugün / Geciken). */
export function HomeCountTile({ label, value, alarm, onPress }: { label: string; value?: number; alarm?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? 'yükleniyor'}${alarm ? ', dikkat gerektiriyor' : ''}`} onPress={onPress}
    style={{ borderCurve: 'continuous' }} className="min-h-[64px] flex-1 justify-center gap-1 rounded-xl bg-muted px-3 py-2 active:opacity-70">
    <Text className="font-inter-semibold text-[22px]" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'], color: alarm ? colors.destructive : colors.foreground }}>{value ?? '—'}</Text>
    <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{label}</Text>
  </Pressable>;
}

export function HomeNote({ children }: { children: ReactNode }) {
  return <Text className="font-inter text-sm leading-5 text-muted-foreground">{children}</Text>;
}
