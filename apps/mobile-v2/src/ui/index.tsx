import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Enter } from '@/src/ui/motion';

// Hareket/iskelet bileşenleri aynı yüzeyden alınabilsin diye.
export { Enter, Stagger, Skeleton, ListSkeleton, DetailSkeleton, TextSkeleton, tabularNums } from '@/src/ui/motion';

/* ------------------------------------------------------------- yüzeyler ---- */

/** Web'deki .ui-data-frame / [data-slot=card]: border + surface-radius + shadow-sm. */
export function Card({ className = '', ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-surface border border-border bg-card p-4 ${className}`}
      style={{
        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)',
        borderCurve: 'continuous',
      }}
      {...rest}
    />
  );
}

/** Web'deki .crm-filter-surface: aynı kart, daha az gölge. */
export function SubtleCard({ className = '', ...rest }: ViewProps & { className?: string }) {
  return <View className={`rounded-surface border border-border bg-card-subtle p-3 ${className}`} {...rest} />;
}

/* --------------------------------------------------------------- çipler ---- */

/** Web'deki .chip + .chip-{tone}: soft zemin, %28 alfa kenarlık, renkli metin. */
export function Chip({ tone = 'neutral', label }: { tone?: Tone; label: string }) {
  return (
    <View className={`self-start rounded-full border px-2 py-0.5 ${chipClass[tone]}`}>
      <Text className={`font-inter-medium text-xs leading-[1.35] ${chipTextClass[tone]}`}>{label}</Text>
    </View>
  );
}

/* --------------------------------------------------------------- başlık ---- */

/** Web h1: Barlow Condensed 700, 1.75rem, tracking -0.015em. */
export function H1({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text accessibilityRole="header" className={`font-display text-[28px] leading-[1.05] tracking-display text-foreground ${className}`}>
      {children}
    </Text>
  );
}

/** Web h2: Barlow Condensed 600, 1.375rem. */
export function H2({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text accessibilityRole="header" className={`font-display-semibold text-[22px] leading-[1.15] text-foreground ${className}`}>{children}</Text>
  );
}

/** Web .ui-eyebrow: mono, uppercase, geniş harf aralığı, operation-blue. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[11px] font-inter-semibold uppercase tracking-[1.2px] text-operation-blue">{children}</Text>
  );
}

/* --------------------------------------------------------------- butonlar ---- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'ghost' | 'destructive';
  loading?: boolean;
  className?: string;
};

/** Basılınca scale 0.97 + hafif titreşim. Yükseklik 44pt (web'in mobil kuralı). */
export function Button({ label, variant = 'primary', loading, disabled, className = '', ...rest }: ButtonProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isOff = disabled || loading;

  const surface =
    variant === 'primary'
      ? 'bg-primary'
      : variant === 'destructive'
        ? 'bg-destructive'
        : 'border border-border bg-card';
  const text =
    variant === 'ghost' ? 'text-foreground' : variant === 'primary' ? 'text-primary-foreground' : 'text-white';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isOff), busy: Boolean(loading) }}
      disabled={isOff}
      onPressIn={() => {
        scale.value = withTiming(reduceMotion ? 1 : 0.97, { duration: reduceMotion ? 0 : 90 });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: reduceMotion ? 0 : 120 });
      }}
      style={style}
      className={`min-h-[44px] flex-row items-center justify-center gap-2 rounded-control px-5 ${surface} ${isOff ? 'opacity-50' : ''} ${className}`}
      {...rest}
    >
      {loading ? <ActivityIndicator size="small" /> : null}
      <Text className={`font-inter-semibold text-base ${text}`}>{label}</Text>
    </AnimatedPressable>
  );
}

/* ----------------------------------------------------------------- form ---- */

type FieldProps = TextInputProps & { label: string; error?: string };

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, error, ...rest }, ref) {
  const errorId = error ? `field-error-${label.toLocaleLowerCase('tr').replace(/[^a-z0-9]+/g, '-')}` : undefined;
  return (
    <View className="gap-1.5">
      <Text className="font-inter-medium text-[13px] text-muted-foreground">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error}
        aria-describedby={errorId}
        placeholderTextColor="#5f697a"
        className={`min-h-[44px] rounded-control border bg-input-background px-3 font-inter text-base text-foreground ${error ? 'border-destructive' : 'border-border'}`}
        {...rest}
      />
      {error ? (
        <Text
          nativeID={errorId}
          selectable
          accessibilityLiveRegion="polite"
          className="font-inter text-xs text-destructive"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});

/* --------------------------------------------------------------- durumlar ---- */

export function EmptyState({
  title,
  hint,
  icon = 'folder-open-outline',
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Verilirse altta yönlendirici buton çizilir — ölü uç yerine eylem. */
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="items-center gap-3 px-8 py-14">
      <Enter>
        <View className="h-16 w-16 items-center justify-center rounded-full border border-border bg-card-subtle">
          <Ionicons name={icon} size={30} color={colors.mutedForeground} />
        </View>
      </Enter>
      <Text className="text-center font-inter-semibold text-base text-foreground">{title}</Text>
      {hint ? <Text className="text-center font-inter text-sm leading-[1.45] text-muted-foreground">{hint}</Text> : null}
      {actionLabel && onAction ? (
        <Enter delay={120} className="pt-2">
          <Button label={actionLabel} variant="ghost" onPress={onAction} />
        </Enter>
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityLiveRegion="assertive" className="items-center gap-3 px-8 py-16">
      <Text selectable className="text-center font-inter-semibold text-base text-destructive">{message}</Text>
      {onRetry ? <Button label="Tekrar dene" variant="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Yükleniyor" className="flex-1 items-center justify-center py-16">
      <ActivityIndicator accessibilityLabel="Yükleniyor" />
    </View>
  );
}

/* ------------------------------------------------------- ekran başlıkları ---- */

export type HeaderAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Sağ üstte kırmızı nokta (okunmamış/aktif filtre). */
  dot?: boolean;
};

function ActionButton({ action }: { action: HeaderAction }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      className="h-11 w-11 items-center justify-center rounded-full border border-border bg-card active:opacity-70"
    >
      <Ionicons name={action.icon} size={19} color={colors.foreground} />
      {action.dot ? (
        <View className="absolute right-2 top-2 h-2 w-2 rounded-full border border-card bg-destructive" />
      ) : null}
    </Pressable>
  );
}

/**
 * Liste ekranlarının büyük başlığı: başlık + açıklama solda, eylem düğmeleri
 * sağda. Tasarımdaki tüm modül listelerinde aynı kalıp.
 */
export function ScreenHeader({
  title,
  subtitle,
  actions = [],
}: {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
}) {
  return (
    <View className="flex-row items-start gap-3 px-4 pb-2 pt-2">
      <View className="flex-1 gap-0.5">
        <H1>{title}</H1>
        {subtitle ? (
          <Text className="font-inter text-sm text-muted-foreground" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions.length > 0 ? (
        <View className="flex-row gap-2 pt-1">
          {actions.map((action) => (
            <ActionButton key={action.label} action={action} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Detay ekranı üst çubuğu: geri oku + ortada başlık + isteğe bağlı sağ eylem. */
export function DetailHeader({
  title,
  subtitle,
  actions = [],
}: {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
}) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-card px-2 py-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Geri"
        onPress={() => router.back()}
        className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
      >
        <Ionicons name="arrow-back" size={22} color={colors.foreground} />
      </Pressable>
      <View className="flex-1">
        <Text className="text-center font-inter-semibold text-[17px] text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-center font-inter text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="w-10 flex-row justify-end">
        {actions[0] ? <ActionButton action={actions[0]} /> : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ arama/filtre ---- */

export function SearchBar({
  value,
  onChange,
  placeholder = 'Ara...',
  onFilterPress,
  filterActive,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onFilterPress?: () => void;
  filterActive?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-2 px-4">
      <View className="min-h-[44px] flex-1 flex-row items-center gap-2 rounded-control border border-border bg-input-background px-3">
        <Ionicons name="search" size={17} color={colors.mutedForeground} />
        <TextInput
          accessibilityLabel={placeholder}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          className="flex-1 font-inter text-base text-foreground"
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aramayı temizle"
            onPress={() => onChange('')}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {onFilterPress ? (
        <ActionButton
          action={{ icon: 'options-outline', label: 'Filtrele', onPress: onFilterPress, dot: filterActive }}
        />
      ) : null}
    </View>
  );
}

export type FilterOption<T extends string> = { value: T; label: string; count?: number };

/**
 * Tasarımdaki yatay segment pilleri ("Tümü / Açık / Devam Eden / Tamamlandı").
 * `null` değeri "Tümü" demek; seçili pile tekrar basınca filtre kalkar.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  allLabel = 'Tümü',
}: {
  options: FilterOption<T>[];
  value: T | null;
  onChange: (next: T | null) => void;
  allLabel?: string;
}) {
  const rows: { key: string; label: string; count?: number; active: boolean; press: () => void }[] = [
    { key: '__all', label: allLabel, active: value === null, press: () => onChange(null) },
    ...options.map((o) => ({
      key: o.value,
      label: o.label,
      count: o.count,
      active: value === o.value,
      press: () => onChange(value === o.value ? null : o.value),
    })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4"
      keyboardShouldPersistTaps="handled"
    >
      {rows.map((row) => (
        <Pressable
          key={row.key}
          accessibilityRole="button"
          accessibilityState={{ selected: row.active }}
          onPress={row.press}
          className={`min-h-[44px] flex-row items-center gap-1.5 rounded-full border px-3.5 ${
            row.active ? 'border-primary bg-primary' : 'border-border bg-card'
          }`}
        >
          <Text
            className={`text-[13px] font-inter-semibold ${row.active ? 'text-primary-foreground' : 'text-muted-foreground'}`}
          >
            {row.label}
          </Text>
          {row.count !== undefined ? (
            <Text className={`text-[11px] font-inter ${row.active ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
              {row.count}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

/* ----------------------------------------------------------------- şerit ---- */

/** Liste üstündeki sayı şeridi (Toplam / Müşteri / Tedarikçi ...). */
export function StatStrip({ items }: { items: { label: string; value: string; tone?: Tone }[] }) {
  const { colors } = useTheme();
  return (
    <View className="mx-4 flex-row rounded-surface border border-border bg-card">
      {items.map((item, index) => (
        <View
          key={item.label}
          className={`flex-1 items-center gap-0.5 py-3 ${index > 0 ? 'border-l border-border' : ''}`}
        >
          <Text
            className="font-inter-bold text-lg"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: item.tone ? toneColor(colors, item.tone) : colors.foreground }}
          >
            {item.value}
          </Text>
          <Text className="text-center font-inter text-[11px] text-muted-foreground" numberOfLines={2}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Bölüm başlığı: "Vadesi Geçen (3)" + sağda "Tümünü Gör". */
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between px-4 pb-1 pt-4">
      <Text className="font-inter-semibold text-[15px] text-foreground">{title}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          className="min-h-[44px] flex-row items-center gap-1 active:opacity-60"
        >
          <Text className="font-inter-medium text-[13px] text-primary">{action.label}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ liste satırı ---- */

export type ListRowProps = {
  title: string;
  /** Başlığın altındaki satırlar; boş olanlar atılır. */
  lines?: (string | null | undefined)[];
  icon?: keyof typeof Ionicons.glyphMap;
  iconTone?: Tone;
  /** Sağ üstte rozet. */
  chip?: { label: string; tone: Tone };
  /** Rozetin altındaki ikinci satır (tutar, tarih). */
  trailing?: string;
  trailingTone?: Tone;
  onPress?: () => void;
};

/** Tasarımdaki tek tip liste kartı — 20'den fazla ekranda aynı iskelet. */
export function ListRow({
  title,
  lines = [],
  icon,
  iconTone = 'neutral',
  chip,
  trailing,
  trailingTone,
  onPress,
}: ListRowProps) {
  const { colors } = useTheme();
  const body = (
    <View className="my-1 flex-row items-center gap-3 rounded-overlay border border-border bg-card px-3.5 py-3">
      {icon ? (
        <View className={`h-10 w-10 items-center justify-center rounded-control border ${chipClass[iconTone]}`}>
          <Ionicons name={icon} size={19} color={toneColor(colors, iconTone)} />
        </View>
      ) : null}

      <View className="flex-1 gap-0.5">
        <Text className="text-[15px] font-inter-semibold text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {lines
          .filter((l): l is string => Boolean(l))
          .map((line) => (
            <Text key={line} className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
              {line}
            </Text>
          ))}
      </View>

      <View className="items-end gap-1">
        {chip ? <Chip tone={chip.tone} label={chip.label} /> : null}
        {trailing ? (
          <Text
            className="font-inter-semibold text-[13px]"
            numberOfLines={1}
            style={{ color: trailingTone ? toneColor(colors, trailingTone) : colors.foreground, fontVariant: ['tabular-nums'] }}
          >
            {trailing}
          </Text>
        ) : null}
      </View>

      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} className="active:opacity-70">
      {body}
    </Pressable>
  );
}

/* -------------------------------------------------------------------- FAB ---- */

/** §6.1 thumb zone: ana eylem alt sağda, 56pt. */
export function Fab({
  icon = 'add',
  label,
  onPress,
  extended,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** true ise metinli geniş buton (tasarımda "+ Yeni Teklif"). */
  extended?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.24,
        shadowRadius: 12,
        elevation: 6,
      }}
      className={`absolute bottom-5 right-5 h-14 flex-row items-center justify-center gap-2 bg-primary active:opacity-80 ${
        extended ? 'rounded-full px-5' : 'w-14 rounded-full'
      }`}
    >
      <Ionicons name={icon} size={24} color={colors.primaryForeground} />
      {extended ? <Text className="font-inter-semibold text-base text-primary-foreground">{label}</Text> : null}
    </Pressable>
  );
}
