import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon } from 'react-native-svg';
import { useTheme } from '@/src/theme/theme';

/**
 * Gösterge panelinin mockup'a (s14) özgü parçaları. Yalnız bu ekran kullandığı
 * için genel `ui/index` yüzeyine konmadı.
 */

/** Üstteki dörtlü KPI kartı: gri daire içinde kırmızı ikon, etiket, değer. */
export function KpiCard({
  icon,
  label,
  value,
  delta,
  deltaNote,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  /** Yalnız gerçek bir önceki dönem verisi varsa verilir; yoksa satır çizilmez. */
  delta?: { percent: number };
  deltaNote?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const up = (delta?.percent ?? 0) >= 0;
  const body = (
    <View
      className="flex-1 items-center gap-1.5 rounded-[14px] border border-border bg-card px-1.5 py-3.5"
      style={{ borderCurve: 'continuous', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.05)' }}
    >
      <View className="h-[42px] w-[42px] items-center justify-center rounded-full" style={{ backgroundColor: colors.muted }}>
        <Ionicons name={icon} size={21} color={colors.primary} />
      </View>
      {/* Etiket iki satıra sarabilir; yükseklik sabit tutulmazsa dört kartın
          rakamları farklı hizalara düşüyor. */}
      <Text
        className="text-center font-inter text-[11px] leading-[14px] text-foreground"
        numberOfLines={2}
        style={{ height: 28 }}
      >
        {label}
      </Text>
      <Text
        className="font-inter-bold text-[21px] leading-[25px] text-foreground"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
      {delta ? (
        <>
          <View className="flex-row items-center gap-0.5">
            <Ionicons name={up ? 'caret-up' : 'caret-down'} size={10} color={up ? colors.success : colors.destructive} />
            <Text
              className="font-inter-medium text-[11px]"
              style={{ color: up ? colors.success : colors.destructive }}
            >
              %{Math.abs(delta.percent)}
            </Text>
          </View>
          {deltaNote ? (
            <Text className="text-center font-inter text-[9px] leading-[11px] text-muted-foreground" numberOfLines={1}>
              {deltaNote}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="flex-1 active:opacity-70">
      {body}
    </Pressable>
  );
}

/** Panel kartı: başlık solda, sağda isteğe bağlı "..." kısayolu. */
export function PanelCard({
  title,
  hint,
  onMore,
  children,
  className = '',
}: {
  title: string;
  hint?: string;
  onMore?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      className={`flex-1 rounded-[16px] border border-border bg-card p-3.5 ${className}`}
      style={{ borderCurve: 'continuous', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.05)' }}
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 font-inter-semibold text-[15px] leading-[19px] text-foreground">
          {title}
          {hint ? <Text className="font-inter text-[13px] text-muted-foreground"> {hint}</Text> : null}
        </Text>
        {onMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title} — tümü`}
            onPress={onMore}
            className="-mr-2 -mt-3 h-11 w-11 items-center justify-center active:opacity-60"
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <View className="mt-2.5">{children}</View>
    </View>
  );
}

/**
 * Fırsat hunisi: her aşama bir yamuk, genişlik sıradaki aşamaya doğru daralır.
 * Mockup'taki gibi üstte açık, altta koyu kırmızı.
 */
export function Funnel({ steps, width = 60, height = 130 }: { steps: number[]; width?: number; height?: number }) {
  const { colors } = useTheme();
  const n = Math.max(steps.length, 1);
  const band = height / n;
  // Genişlik aşama sayısına göre eşit daralır; veri 0 olsa bile huni şekli korunur.
  const at = (i: number) => width * (1 - (i / n) * 0.62);
  return (
    <Svg width={width} height={height} accessibilityLabel="Fırsat hunisi">
      {steps.map((_, i) => {
        const top = at(i);
        const bottom = at(i + 1);
        const y = i * band;
        const x1 = (width - top) / 2;
        const x2 = (width - bottom) / 2;
        return (
          <Polygon
            key={i}
            points={`${x1},${y} ${x1 + top},${y} ${x2 + bottom},${y + band - 2} ${x2},${y + band - 2}`}
            fill={colors.primary}
            opacity={0.18 + (i / n) * 0.82}
          />
        );
      })}
    </Svg>
  );
}

/** Panel içi satır: kırmızı ikon + etiket + değer (+ chevron). */
export function PanelRow({
  icon,
  label,
  value,
  valueTone,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  valueTone?: 'primary' | 'muted';
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const body = (
    <View className="flex-row items-center gap-2.5 py-2">
      {icon ? <Ionicons name={icon} size={17} color={colors.primary} /> : null}
      <Text className="flex-1 font-inter text-[13px] leading-[17px] text-foreground" numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text
          className="font-inter-semibold text-[13px]"
          numberOfLines={1}
          style={{
            color: valueTone === 'primary' ? colors.primary : colors.foreground,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="active:opacity-70">
      {body}
    </Pressable>
  );
}
