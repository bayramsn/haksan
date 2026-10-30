import { ProfileButton } from './ProfileButton';
import { GlassNavigationControl } from './NavigationGlass';
import { useNavigationBottomInset } from './LiquidGlassTabBarBackground';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { SheetMenu } from './crm/SheetMenu';
import { forwardRef, useId, useRef, useState } from 'react';
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
import { useRouter, type Href } from 'expo-router';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { chipClass, chipTextClass, SCREEN_PAD, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Enter } from '@/src/ui/motion';
import { Logo } from '@/src/ui/Logo';
import { useUnreadCount } from '@/src/api/notifications.hooks';
import { useHierarchyBack } from '@/src/modules/useHierarchyBack';

// Yerleşim sabiti tema modülünde yaşıyor; ekranlar alışkanlıkla buradan da
// alabilsin diye yeniden dışa veriliyor.
export { SCREEN_PAD } from '@/src/theme/theme';

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
/**
 * `shrink`: dar satırlarda kısalabilecek çip (uzun sektör adı gibi). Varsayılan
 * kapalı — açık bırakılınca "Tedarikçi" gibi kısa durum çipleri de "Te…" diye
 * kırpılıyordu. Metin her hâlükârda tek satır: sarma, kart yüksekliğini bozar.
 */
export function Chip({ tone = 'neutral', label, shrink }: { tone?: Tone; label: string; shrink?: boolean }) {
  return (
    <View className={`self-start rounded-full border px-2 py-0.5 ${shrink ? 'shrink' : ''} ${chipClass[tone]}`}>
      <Text numberOfLines={1} className={`font-inter-medium text-xs leading-[1.35] ${chipTextClass[tone]}`}>
        {label}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------- başlık ---- */

/** Web h1 gibi Barlow Condensed; dar aile olduğu için punto Inter karşılığından bir kademe büyük. */
export function H1({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text accessibilityRole="header" className={`font-display text-[32px] leading-[1.1] text-foreground ${className}`}>
      {children}
    </Text>
  );
}

/** Web h2 gibi Barlow Condensed. */
export function H2({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text accessibilityRole="header" className={`font-display text-[24px] leading-[1.2] text-foreground ${className}`}>{children}</Text>
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
  /** Mockup'ların birincil butonunda etiket ortada, ok sağ kenarda durur. */
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  /** Mockup ölçüsü 52pt; dar yerlerde varsayılan 48pt kalır. */
  height?: number;
};

/** Basılınca scale 0.97 + hafif titreşim. Yükseklik 44pt (web'in mobil kuralı). */
export function Button({
  label,
  variant = 'primary',
  loading,
  disabled,
  className = '',
  trailingIcon,
  height,
  ...rest
}: ButtonProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const { colors } = useTheme();
  const isOff = disabled || loading;

  const surface =
    variant === 'primary'
      ? 'bg-primary'
      : variant === 'destructive'
        ? 'bg-destructive'
        : 'border border-border bg-card';
  const text =
    variant === 'ghost' ? 'text-foreground' : variant === 'primary' ? 'text-primary-foreground' : 'text-white';
  // NativeWind className, Reanimated ile sarılmış Pressable'da özellikle web
  // hedefinde style'a çevrilmeyebiliyor. Birincil eylemin görünürlüğü yalnız
  // utility dönüşümüne bağlı kalmasın; referansın 48pt kırmızı CTA yüzeyini
  // ortak bileşende platformdan bağımsız olarak garanti et.
  const surfaceStyle =
    variant === 'ghost'
      ? { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
      : {
          backgroundColor: variant === 'primary' ? colors.primary : colors.destructive,
          borderColor: 'transparent',
          borderWidth: 0,
        };

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
      style={[
        style,
        {
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          columnGap: 8,
          borderRadius: 12,
          paddingHorizontal: 20,
          opacity: isOff ? 0.5 : 1,
          ...surfaceStyle,
        },
        height ? { height } : null,
        className.includes('flex-1') ? { flex: 1 } : null,
      ]}
      className={`min-h-[48px] flex-row items-center justify-center gap-2 rounded-control px-5 ${surface} ${isOff ? 'opacity-50' : ''} ${className}`}
      {...rest}
    >
      {loading ? <ActivityIndicator size="small" /> : null}
      <Text className={`shrink text-center font-inter-semibold text-base ${text}`}>{label}</Text>
      {trailingIcon ? (
        // Etiket uzadığında sarılır; ikon metnin üzerine binmez.
        <View>
          <Ionicons
            name={trailingIcon}
            size={18}
            color={variant === 'ghost' ? colors.foreground : colors.primaryForeground}
          />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

/* ----------------------------------------------------------------- form ---- */

type FieldProps = TextInputProps & { label: string; error?: string };

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, error, className, style, multiline, editable, onFocus, onBlur, ...rest }, ref) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const id = useId();
  const errorId = error ? `field-error-${id}` : undefined;
  return (
    <View className="gap-1.5">
      <Text className="font-inter-medium text-[13px] text-muted-foreground">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error}
        aria-describedby={errorId}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        editable={editable}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[{ borderColor: error ? colors.destructive : focused ? colors.primary : colors.border, opacity: editable === false ? 0.6 : 1, textAlignVertical: multiline ? 'top' : 'center' }, style]}
        className={`${multiline ? 'min-h-28 py-3' : 'min-h-14'} rounded-control border bg-input-background px-3 font-inter text-base text-foreground ${className ?? ''}`}
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

type IconFieldProps = Omit<TextInputProps, 'secureTextEntry'> & {
  icon: keyof typeof Ionicons.glyphMap;
  /** Etiket görünmez; mockup'ta alanların üstünde yazı yok, yer tutucu var. */
  label: string;
  error?: string;
  secure?: boolean;
};

/**
 * Mockup'ların giriş/kayıt alanı: beyaz zemin, ince kenarlık, solda ikon,
 * üstte etiket yok. Parolada sağda göz düğmesi.
 */
export const IconField = forwardRef<TextInput, IconFieldProps>(function IconField(
  { icon, label, error, secure, ...rest },
  ref
) {
  const { colors } = useTheme();
  const [reveal, setReveal] = useState(false);
  const errorId = error ? `field-error-${label.toLocaleLowerCase('tr').replace(/[^a-z0-9]+/g, '-')}` : undefined;

  return (
    <View className="gap-1.5">
      <View
        className={`h-[52px] flex-row items-center gap-3 rounded-[14px] border bg-card px-4 ${error ? 'border-destructive' : 'border-border'}`}
        style={{ borderCurve: 'continuous' }}
      >
        <Ionicons name={icon} size={20} color={colors.mutedForeground} />
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error}
          aria-describedby={errorId}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={secure && !reveal}
          className="flex-1 font-inter text-base text-foreground"
          {...rest}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Parolayı gizle' : 'Parolayı göster'}
            hitSlop={10}
            onPress={() => setReveal((v) => !v)}
            className="active:opacity-60"
          >
            <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text nativeID={errorId} selectable accessibilityLiveRegion="polite" className="font-inter text-xs text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

/* ----------------------------------------------------------- hero başlık ---- */

/**
 * Ekran başlığı: marka renkli ilk satır, koyu ikinci satır. Tek satırlı
 * ekranlarda (Giriş Yap, Hazırsınız) yalnız ilk satır çizilir.
 */
export function HeroTitle({
  lead,
  tail,
  subtitle,
  size = 48,
}: {
  lead: string;
  tail?: string;
  subtitle?: string;
  size?: number;
}) {
  const { colors } = useTheme();
  const line = { fontSize: size, lineHeight: Math.round(size * 1.14), letterSpacing: 0 };
  return (
    <View>
      <Text accessibilityRole="header" className="font-display" style={{ ...line, color: colors.primary }}>
        {lead}
      </Text>
      {tail ? (
        <Text className="font-display" style={{ ...line, color: colors.foreground }}>
          {tail}
        </Text>
      ) : null}
      {subtitle ? (
        <Text className="font-inter" style={{ fontSize: 16, lineHeight: 22, marginTop: 8, color: colors.mutedForeground }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

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
    <View className="items-center gap-2.5 px-6 py-8">
      <Enter>
        <View className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card-subtle">
          <Ionicons name={icon} size={20} color={colors.mutedForeground} />
        </View>
      </Enter>
      <Text className="text-center font-inter-semibold text-[15px] text-foreground">{title}</Text>
      {hint ? <Text className="text-center font-inter text-[13px] leading-[1.4] text-muted-foreground">{hint}</Text> : null}
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

/** Desktop glass kontrol yüzeyleri; eylemler ve bildirim noktası korunur. */
function ActionButton({ action }: { action: HeaderAction }) {
  const { colors } = useTheme();
  return (
    <GlassNavigationControl>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center active:opacity-60"
    >
      <Ionicons name={action.icon} size={20} color={colors.foreground} />
      {action.dot ? (
        <View className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
      ) : null}
    </Pressable>
    </GlassNavigationControl>
  );
}

/** Keep named actions reachable without squeezing the title on small screens. */
function HeaderActions({ actions, limit = 2 }: { actions: HeaderAction[]; limit?: number }) {
  const menu = useRef<BottomSheetModal>(null);
  const overflow = actions.length > limit;
  const visible = overflow ? actions.slice(0, limit - 1) : actions;
  return <>
    {visible.map((action, index) => <ActionButton key={`${action.label}-${index}`} action={action} />)}
    {overflow ? <>
      <ActionButton action={{ icon: 'ellipsis-horizontal', label: 'Diğer işlemler', onPress: () => menu.current?.present() }} />
      <SheetMenu ref={menu} title="İşlemler" items={actions.slice(limit - 1).map((action, index) => ({ ...action, key: `${action.label}-${index}` }))} />
    </> : null}
  </>;
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <GlassNavigationControl>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Geri"
      onPress={onPress}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
    >
      <Ionicons name="arrow-back" size={20} color={colors.foreground} />
    </Pressable>
    </GlassNavigationControl>
  );
}

/**
 * Mockup'ların modül başlığı: üstte marka kilidi + eylem ikonları, altında
 * büyük başlık ve gri açıklama. Sekme kökünde marka, alt seviyelerde geri oku.
 */
export function ScreenHeader({
  title,
  subtitle,
  actions = [],
  hideBell,
  hideProfile,
  compact,
}: {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
  /** Bildirim ekranının kendisi gibi zilin anlamsız kaldığı yerlerde. */
  hideBell?: boolean;
  hideProfile?: boolean;
  /** Liste ekranlarında başlığı kısaltır; kaydırınca arama çubuğu öne çıkar. */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const unread = useUnreadCount();
  const nav = useHierarchyBack();
  return (
    <View style={{ paddingHorizontal: SCREEN_PAD }} className={compact ? 'pb-0.5 pt-0' : 'pb-1 pt-1'}>
      <View className="h-11 flex-row items-center justify-between">
        {nav.isTabRoot ? (
          <Logo width={118} />
        ) : (
          <View className="-ml-3">
            <BackButton onPress={nav.goBack} />
          </View>
        )}
        <View className="flex-row items-center gap-2">
          <HeaderActions actions={actions} limit={hideProfile ? 2 : 1} />
          {/* Mockup'ların tüm modül başlıklarında sağ üstte zil var. */}
          {hideBell ? null : (
            <ActionButton
              action={{
                icon: 'notifications-outline',
                label: 'Bildirimler',
                dot: unread > 0,
                onPress: () => router.push('/notifications'),
              }}
            />
          )}
          {hideProfile ? null : <ProfileButton />}
        </View>
      </View>
      <Text
        accessibilityRole="header"
        className="font-display"
        style={
          compact
            ? { fontSize: 22, lineHeight: 26, letterSpacing: 0, color: colors.primary, marginTop: 2 }
            : { fontSize: 30, lineHeight: 36, letterSpacing: 0, color: colors.foreground, marginTop: 12 }
        }
      >
        {title}
      </Text>
      {subtitle && !compact ? (
        <Text
          className="font-inter"
          style={{ fontSize: 14, lineHeight: 20, marginTop: 4, color: colors.mutedForeground }}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
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
  const nav = useHierarchyBack();
  return (
    <View className="min-h-16 flex-row items-center gap-3 border-b border-border bg-card px-3 py-3">
      <BackButton onPress={nav.goBack} />
      <View className="min-w-0 flex-1">
        <Text accessibilityRole="header" className="font-display-semibold text-[22px] text-foreground" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-1 font-inter text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="min-w-11 flex-row justify-end gap-2">
        <HeaderActions actions={actions} />
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
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onFilterPress?: () => void;
  filterActive?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const box = compact ? 'h-11' : 'h-[52px]';
  return (
    <View style={{ paddingHorizontal: SCREEN_PAD }} className="flex-row items-center gap-2">
      <View
        className={`${box} flex-1 flex-row items-center gap-2 rounded-[14px] border border-border bg-card px-3.5`}
        style={{ borderCurve: 'continuous' }}
      >
        <Ionicons name="search" size={19} color={colors.mutedForeground} />
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
        // Mockup'ta filtre, arama alanının yanında ayrı kare beyaz düğme.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filtrele"
          onPress={onFilterPress}
          className={`${box} ${compact ? 'w-11' : 'w-[52px]'} items-center justify-center rounded-[14px] border border-border bg-card active:opacity-70`}
          style={{ borderCurve: 'continuous' }}
        >
          <Ionicons name="options-outline" size={20} color={colors.foreground} />
          {filterActive ? (
            <View className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary" />
          ) : null}
        </Pressable>
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
  dense,
}: {
  options: FilterOption<T>[];
  value: T | null;
  onChange: (next: T | null) => void;
  allLabel?: string;
  dense?: boolean;
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
      // Yatay ScrollView dikey sütun içinde büyüyüp altındaki listeyi aşağı
      // itiyordu; yüksekliği pil boyuna sabitlenmeli.
      style={{ height: 46, flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: dense ? 8 : 10 }}
      keyboardShouldPersistTaps="handled"
    >
      {rows.map((row) => (
        <Pressable
          key={row.key}
          accessibilityRole="button"
          accessibilityState={{ selected: row.active }}
          onPress={row.press}
          className={`${dense ? 'h-[44px] px-3.5' : 'h-[46px] px-5'} flex-row items-center gap-1.5 rounded-full border ${
            row.active ? 'border-primary bg-primary' : 'border-border bg-card'
          }`}
        >
          <Text
            className={`${dense ? 'text-[13px]' : 'text-[15px]'} font-inter-medium ${row.active ? 'text-primary-foreground' : 'text-foreground'}`}
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
export function StatStrip({
  items,
  dense,
}: {
  items: { label: string; value: string; tone?: Tone; icon?: keyof typeof Ionicons.glyphMap }[];
  dense?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{ marginHorizontal: SCREEN_PAD, borderCurve: 'continuous' }}
      className={`flex-row rounded-[16px] border border-border bg-card ${dense ? 'py-0.5' : 'py-1'}`}
    >
      {items.map((item, index) => (
        <View
          key={item.label}
          className={`flex-1 items-center px-1 ${dense ? 'gap-0.5 py-2' : 'gap-1 py-3.5'} ${index > 0 ? 'border-l border-border' : ''}`}
        >
          {!dense && item.icon ? <Ionicons name={item.icon} size={16} color={colors.primary} /> : null}
          <Text
            className={`font-inter-bold ${dense ? 'text-[16px] leading-[20px]' : 'text-[18px] leading-[22px]'}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: item.tone ? toneColor(colors, item.tone) : colors.foreground }}
          >
            {item.value}
          </Text>
          <Text className="text-center font-inter text-[12px] leading-[15px] text-muted-foreground" numberOfLines={2}>
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
      <Text className="font-display-semibold text-[18px] text-foreground">{title}</Text>
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
  /** Alt satırdaki rozet(ler) — mockup'ta başlığın altında, sağda değil. */
  chip?: { label: string; tone: Tone };
  chips?: { label: string; tone: Tone }[];
  /** Sağ bloğun gri üst etiketi ("Açık Fırsat", "Cari Bakiye"). */
  metaLabel?: string;
  metaIcon?: keyof typeof Ionicons.glyphMap;
  /** Sağ bloğun vurgulu değeri (adet, tutar, tarih). */
  trailing?: string;
  trailingTone?: Tone;
  onPress?: () => void;
};

/**
 * Mockup'ların tek tip liste kartı: solda kare ikon, ortada başlık + konum +
 * çipler, sağda ince ayraçla ayrılmış etiketli metrik ve chevron.
 * 20'den fazla modül listesinde aynı iskelet.
 */
export function ListRow({
  title,
  lines = [],
  icon,
  iconTone = 'neutral',
  chip,
  chips,
  metaLabel,
  metaIcon,
  trailing,
  trailingTone = 'neutral',
  onPress,
}: ListRowProps) {
  const { colors } = useTheme();
  const allChips = chips ?? (chip ? [chip] : []);
  const body = (
    <View className="my-1.5 gap-3 rounded-surface border border-border bg-card p-4"
      style={{ borderCurve: 'continuous', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.05)' }}>
      <View className="flex-row items-start gap-3">
        {icon ? <View className={`h-10 w-10 items-center justify-center rounded-control border ${chipClass[iconTone]}`}>
          <Ionicons name={icon} size={19} color={toneColor(colors, iconTone)} />
        </View> : null}
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-inter-semibold text-[16px] leading-[22px] text-foreground" numberOfLines={2}>{title}</Text>
          {lines.filter((line): line is string => Boolean(line)).map((line, index) => (
            <Text key={`${index}-${line}`} className="font-inter text-[13px] leading-[19px] text-muted-foreground" numberOfLines={2}>{line}</Text>
          ))}
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} style={{ marginTop: 2 }} /> : null}
      </View>
      {allChips.length ? <View className="flex-row flex-wrap gap-2">
        {allChips.map((item, index) => <Chip key={`${index}-${item.label}`} tone={item.tone} label={item.label} shrink />)}
      </View> : null}
      {trailing ? <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-3">
        {metaLabel ? <View className="flex-row items-center gap-1">
          {metaIcon ? <Ionicons name={metaIcon} size={14} color={colors.mutedForeground} /> : null}
          <Text className="font-inter text-[13px] text-muted-foreground">{metaLabel}</Text>
        </View> : null}
        <Text className="shrink font-inter-semibold text-[16px] leading-[22px]" style={{ color: toneColor(colors, trailingTone), fontVariant: ['tabular-nums'] }}>{trailing}</Text>
      </View> : null}
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
  bottomOffset,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** true ise metinli geniş buton (tasarımda "+ Yeni Teklif"). */
  extended?: boolean;
  /** Override only when positioned inside an already inset wrapper. */
  bottomOffset?: number;
}) {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
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
        bottom: bottomOffset ?? GLASS_TAB_BAR_HEIGHT + 12,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.32,
        shadowRadius: 12,
        elevation: 6,
      }}
      className={`absolute right-5 h-12 flex-row items-center justify-center gap-2 bg-primary active:opacity-80 ${
        extended ? 'rounded-full px-4' : 'w-12 rounded-full'
      }`}
    >
      <Ionicons name={icon} size={22} color={colors.primaryForeground} />
      {extended ? <Text className="font-inter-semibold text-base text-primary-foreground">{label}</Text> : null}
    </Pressable>
  );
}
