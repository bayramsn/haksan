import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Card } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import type { Delta } from './reportMath';

/** KPI kartı; `delta` verilirse altında geçen yıl farkı, `onPress` varsa ilgili listeye iner. */
export function Kpi({
  label,
  value,
  tone,
  delta,
  onPress,
}: {
  label: string;
  value: string;
  tone?: Tone;
  delta?: Delta;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const body = (
    <Card className="flex-1 gap-1">
      <Text
        className="font-inter-semibold text-[19px]"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: tone ? toneColor(colors, tone) : colors.foreground }}
      >
        {value}
      </Text>
      <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={2}>
        {label}
      </Text>
      {delta ? (
        <Text
          className="font-inter-medium text-[11px]"
          style={{ color: delta.diff > 0 ? colors.success : delta.diff < 0 ? colors.destructive : colors.mutedForeground }}
        >
          {delta.label}
        </Text>
      ) : null}
    </Card>
  );
  if (!onPress) return <View className="flex-1">{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Kayıtları aç`}
      onPress={onPress}
      className="min-h-[44px] flex-1 active:opacity-70"
    >
      {body}
    </Pressable>
  );
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <View className="flex-row gap-3">{children}</View>;
}

/** Yatay seçim çipleri (yıl, ay, mod); tek seçim, "Tümü" yok. */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerClassName="gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${option.label}`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            className={`min-h-[44px] justify-center rounded-full border px-4 ${active ? 'border-primary bg-primary' : 'border-border bg-card'} active:opacity-70`}
          >
            <Text className={`font-inter-medium text-sm ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** "‹ Mart 2026 ›" — ay ileri/geri. */
export function Stepper({ label, onPrev, onNext, nextDisabled }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between rounded-control border border-border bg-card">
      <Pressable accessibilityRole="button" accessibilityLabel="Önceki dönem" onPress={onPrev} className="h-11 w-11 items-center justify-center active:opacity-60">
        <Ionicons name="chevron-back" size={20} color={colors.foreground} />
      </Pressable>
      <Text className="font-inter-semibold text-sm capitalize text-foreground">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sonraki dönem"
        accessibilityState={{ disabled: Boolean(nextDisabled) }}
        disabled={nextDisabled}
        onPress={onNext}
        className={`h-11 w-11 items-center justify-center active:opacity-60 ${nextDisabled ? 'opacity-30' : ''}`}
      >
        <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="gap-0.5 px-1">
      <Text accessibilityRole="header" className="font-display text-[18px] text-foreground">{title}</Text>
      {hint ? <Text className="font-inter text-xs text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}

/** Basit tablo: sabit sütun başlıkları, satır başı tıklanabilir olabilir. Dar ekranda yatay kayar. */
export function SimpleTable({
  headers,
  rows,
  footer,
  empty = 'Kayıt yok.',
  firstColumnWidth = 120,
  columnWidth = 84,
}: {
  headers: string[];
  rows: { key: string; cells: (string | number)[]; tones?: (Tone | undefined)[]; onPress?: () => void }[];
  footer?: (string | number)[];
  empty?: string;
  firstColumnWidth?: number;
  columnWidth?: number;
}) {
  const { colors } = useTheme();
  if (rows.length === 0) return <Text className="py-3 font-inter text-sm text-muted-foreground">{empty}</Text>;
  const width = (index: number) => (index === 0 ? firstColumnWidth : columnWidth);
  const line = (cells: (string | number)[], bold: boolean, tones?: (Tone | undefined)[]) =>
    cells.map((cell, index) => (
      <Text
        key={index}
        numberOfLines={2}
        style={{ width: width(index), color: tones?.[index] ? toneColor(colors, tones[index]!) : colors.foreground, textAlign: index === 0 ? 'left' : 'right' }}
        className={`px-1 text-[13px] ${bold ? 'font-inter-semibold' : 'font-inter'}`}
      >
        {cell}
      </Text>
    ));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View className="flex-row border-b border-border py-2">
          {headers.map((header, index) => (
            <Text
              key={header}
              style={{ width: width(index), textAlign: index === 0 ? 'left' : 'right' }}
              className="px-1 font-inter-medium text-[11px] uppercase text-muted-foreground"
            >
              {header}
            </Text>
          ))}
        </View>
        {rows.map((row) =>
          row.onPress ? (
            <Pressable
              key={row.key}
              accessibilityRole="button"
              accessibilityLabel={`${row.cells[0]} kayıtlarını aç`}
              onPress={row.onPress}
              className="min-h-[44px] flex-row items-center border-b border-border active:opacity-60"
            >
              {line(row.cells, false, row.tones)}
            </Pressable>
          ) : (
            <View key={row.key} className="min-h-[40px] flex-row items-center border-b border-border">
              {line(row.cells, false, row.tones)}
            </View>
          ),
        )}
        {footer ? <View className="min-h-[40px] flex-row items-center bg-card-subtle">{line(footer, true)}</View> : null}
      </View>
    </ScrollView>
  );
}

export type BarSeries = { key: string; label: string; color: string };

/** Gruplu sütun grafiği: her kova için seri sayısı kadar yan yana sütun + lejant. */
export function GroupedBars({
  title,
  caption,
  buckets,
  series,
  valueOf,
}: {
  title: string;
  caption?: string;
  buckets: { key: string; label: string }[];
  series: BarSeries[];
  valueOf: (bucketKey: string, seriesKey: string) => number;
}) {
  const { colors } = useTheme();
  const barWidth = series.length > 2 ? 8 : series.length === 2 ? 10 : 16;
  const data = buckets.flatMap((bucket) =>
    series.map((s, index) => ({
      value: Math.max(0, valueOf(bucket.key, s.key)),
      frontColor: s.color,
      spacing: index === series.length - 1 ? 14 : 2,
      label: index === 0 ? bucket.label : undefined,
      labelWidth: barWidth * series.length + 12,
    })),
  );
  const hasData = data.some((item) => item.value > 0);
  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-inter-semibold text-base text-foreground">{title}</Text>
        {caption ? <Text className="font-inter text-xs uppercase text-muted-foreground">{caption}</Text> : null}
      </View>
      {hasData ? (
        <BarChart
          data={data}
          barWidth={barWidth}
          initialSpacing={8}
          noOfSections={4}
          yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
          yAxisColor={colors.chartGrid}
          xAxisColor={colors.chartGrid}
          rulesColor={colors.chartGrid}
          isAnimated
        />
      ) : (
        <Text className="py-6 text-center font-inter text-sm text-muted-foreground">Bu dönemde veri yok.</Text>
      )}
      {series.length > 1 ? (
        <View className="flex-row flex-wrap gap-3">
          {series.map((s) => (
            <View key={s.key} className="flex-row items-center gap-1.5">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <Text className="font-inter text-xs text-muted-foreground">{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** Excel/paylaşım butonu: çalışırken kilitlenir, hata toast olarak görünür. */
export function ActionButton({
  icon,
  label,
  run,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  run: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(off), busy }}
      disabled={off}
      onPress={async () => {
        setBusy(true);
        try {
          await run();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'İşlem tamamlanamadı.');
        } finally {
          setBusy(false);
        }
      }}
      className={`min-h-[44px] flex-row items-center gap-1.5 rounded-control border border-border bg-card px-3 active:opacity-70 ${off ? 'opacity-50' : ''}`}
    >
      <Ionicons name={icon} size={16} color={colors.foreground} />
      <Text className="font-inter-medium text-sm text-foreground">{busy ? 'Hazırlanıyor…' : label}</Text>
    </Pressable>
  );
}

export function InfoLine({ label, value, tone }: { label: string; value: string | number; tone?: Tone }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between border-t border-border py-2 first:border-t-0">
      <Text className="flex-1 font-inter text-sm text-muted-foreground">{label}</Text>
      <Text className="font-inter-semibold text-sm" style={{ color: tone ? toneColor(colors, tone) : colors.foreground }}>
        {value}
      </Text>
    </View>
  );
}
