import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chipClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';

/* --------------------------------------------------------------- KPI ---- */

export type Trend = { value: string; direction: 'up' | 'down' | 'flat'; caption?: string };

/**
 * Tasarımdaki KPI kutusu: yuvarlak ikon rozeti, büyük değer, etiket ve altta
 * değişim oku. Yükseliş her zaman yeşil DEĞİL — geciken tahsilatta artış kötüdür;
 * bu yüzden yön ile renk ayrı: `goodWhenUp` false verilirse renkler ters çevrilir.
 */
export function StatCard({
  icon,
  tone = 'neutral',
  label,
  value,
  trend,
  goodWhenUp = true,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  label: string;
  value: string;
  trend?: Trend;
  goodWhenUp?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const trendTone: Tone =
    !trend || trend.direction === 'flat'
      ? 'neutral'
      : (trend.direction === 'up') === goodWhenUp
        ? 'success'
        : 'destructive';

  const body = (
    <View
      className="flex-1 gap-2 rounded-surface border border-border bg-card p-3.5"
      style={{
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-full border ${chipClass[tone]}`}>
        <Ionicons name={icon} size={17} color={toneColor(colors, tone)} />
      </View>

      <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={2}>
        {label}
      </Text>

      <Text
        className="text-[22px] font-inter-bold text-foreground"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>

      {trend ? (
        <View className="flex-row items-center gap-1">
          <Ionicons
            name={trend.direction === 'down' ? 'arrow-down' : trend.direction === 'up' ? 'arrow-up' : 'remove'}
            size={12}
            color={toneColor(colors, trendTone)}
          />
          <Text className="font-inter-semibold text-[12px]" style={{ color: toneColor(colors, trendTone) }}>
            {trend.value}
          </Text>
          {trend.caption ? (
            <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
              {trend.caption}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} className="flex-1 active:opacity-70">
      {body}
    </Pressable>
  );
}

/** KPI ızgarası: tasarımdaki 2'li/4'lü satırlar. */
export function StatGrid({ children, columns = 2 }: { children: React.ReactNode[]; columns?: number }) {
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < children.length; i += columns) rows.push(children.slice(i, i + columns));
  return (
    <View className="gap-3">
      {rows.map((row, index) => (
        <View key={index} className="flex-row gap-3">
          {row}
          {/* Son satır eksikse boşluk bırak ki kartlar tam genişliğe yayılmasın. */}
          {row.length < columns
            ? Array.from({ length: columns - row.length }, (_, i) => <View key={`pad-${i}`} className="flex-1" />)
            : null}
        </View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------- tablar ---- */

/** Detay ekranlarındaki yatay sekmeler (Genel / İletişim / Finans / Notlar). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap; badge?: number }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-1 px-4"
      className="border-b border-border"
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.value)}
            className={`min-h-[42px] flex-row items-center gap-1.5 border-b-2 px-3 ${
              selected ? 'border-primary' : 'border-transparent'
            }`}
          >
            {tab.icon ? (
              <Ionicons
                name={tab.icon}
                size={15}
                color={selected ? colors.primary : colors.mutedForeground}
              />
            ) : null}
            <Text
              className={`text-[14px] ${selected ? 'font-inter-semibold text-primary' : 'font-inter-medium text-muted-foreground'}`}
            >
              {tab.label}
            </Text>
            {tab.badge !== undefined && tab.badge > 0 ? (
              <View className="min-w-[18px] items-center rounded-full bg-primary px-1">
                <Text className="font-inter-semibold text-[10px] text-primary-foreground">{tab.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------ ilerleme ---- */

/** Kontrol listesi / kurulum ilerlemesi: "3 / 6 Tamamlandı" + çubuk. */
export function ProgressBar({
  done,
  total,
  label,
  tone = 'success',
}: {
  done: number;
  total: number;
  label?: string;
  tone?: Tone;
}) {
  const { colors } = useTheme();
  // total 0 iken bölme yok; çubuk boş kalır.
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return (
    <View className="gap-1.5">
      {label ? (
        <View className="flex-row items-center justify-between">
          <Text className="font-inter-semibold text-[13px] text-foreground">{label}</Text>
          <Text className="font-inter-semibold text-[12px]" style={{ color: toneColor(colors, tone) }}>
            {done} / {total}
          </Text>
        </View>
      ) : null}
      <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.muted }}>
        <View
          className="h-full rounded-full"
          style={{ width: `${ratio * 100}%`, backgroundColor: toneColor(colors, tone) }}
        />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- adımlar ---- */

export type Step = { label: string; at?: string | null; done: boolean; current?: boolean };

/** Yatay adım rayı (Talep Alındı → Planlandı → Yolda → Yerinde → Tamamlandı). */
export function StepTrack({ steps }: { steps: Step[] }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const active = step.done || step.current;
        return (
          <View key={step.label} className="flex-1 items-center">
            <View className="w-full flex-row items-center">
              {/* Soldaki bağlantı çizgisi; ilk adımda gizli. */}
              <View
                className="h-0.5 flex-1"
                style={{ backgroundColor: index === 0 ? 'transparent' : active ? colors.primary : colors.lineStrong }}
              />
              <View
                className="h-5 w-5 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: active ? colors.primary : colors.lineStrong,
                  backgroundColor: step.done ? colors.primary : colors.card,
                }}
              >
                {step.done ? <Ionicons name="checkmark" size={11} color={colors.primaryForeground} /> : null}
                {step.current && !step.done ? (
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.primary }} />
                ) : null}
              </View>
              <View
                className="h-0.5 flex-1"
                style={{ backgroundColor: last ? 'transparent' : step.done ? colors.primary : colors.lineStrong }}
              />
            </View>
            <Text
              className={`pt-1.5 text-center text-[10px] ${active ? 'font-inter-medium text-foreground' : 'font-inter text-muted-foreground'}`}
              numberOfLines={2}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ----------------------------------------------------------- alan/değer ---- */

export type InfoItem = { label: string; value: string | null | undefined; tone?: Tone };

/**
 * Detay ekranlarındaki alan/değer listesi. Bu satır on ayrı ekranda tek tek
 * kopyalanmıştı; tek yerde toplandı. Boş değerli satırlar `showEmpty` verilmedikçe
 * atılır — tasarımda dolu olmayan alan gösterilmiyor.
 */
export function InfoRows({ items, showEmpty = false }: { items: InfoItem[]; showEmpty?: boolean }) {
  const { colors } = useTheme();
  const rows = showEmpty ? items : items.filter((item) => Boolean(item.value));
  if (rows.length === 0) return null;

  return (
    <View>
      {rows.map((item, index) => (
        <View
          key={item.label}
          className={`flex-row justify-between gap-4 py-2.5 ${index > 0 ? 'border-t border-border' : ''}`}
        >
          <Text className="font-inter text-sm text-muted-foreground">{item.label}</Text>
          <Text
            className="flex-1 text-right font-inter text-sm"
            numberOfLines={3}
            style={{ color: item.tone ? toneColor(colors, item.tone) : colors.foreground }}
          >
            {item.value || '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}
