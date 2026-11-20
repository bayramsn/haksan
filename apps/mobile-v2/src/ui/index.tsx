import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { chipClass, chipTextClass, SCREEN_PAD, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Enter } from '@/src/ui/motion';
import { useUnreadCount } from '@/src/api/notifications.hooks';

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

/** Mockup başlıkları: geniş, kalın, koyu — sıkıştırılmış değil. */
export function H1({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text accessibilityRole="header" className={`font-inter-bold text-[28px] leading-[1.12] text-foreground ${className}`}>
      {children}
    </Text>
  );
}

/** Mockup bölüm başlıkları: Inter Bold 22. */
export function H2({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text accessibilityRole="header" className={`font-inter-bold text-[22px] leading-[1.2] text-foreground ${className}`}>{children}</Text>
  );
}

/** Bölüm etiketi: sakin, okunabilir ve diğer içerikle aynı yazı ailesinde. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-sm font-inter-semibold text-muted-foreground">{children}</Text>
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
      <Text className={`font-inter-semibold text-base ${text}`}>{label}</Text>
      {trailingIcon ? (
        // Mutlak konum: etiket buton ortasında kalsın, ok kenara yaslansın.
        <View className="absolute right-5">
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

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, error, ...rest }, ref) {
  const { colors } = useTheme();
  const errorId = error ? `field-error-${label.toLocaleLowerCase('tr').replace(/[^a-z0-9]+/g, '-')}` : undefined;
  return (
    <View className="gap-1.5">
      <Text className="font-inter-medium text-sm text-foreground">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error}
        aria-describedby={errorId}
        placeholderTextColor={colors.mutedForeground}
        className={`min-h-[48px] rounded-control border bg-input-background px-4 py-3 font-inter text-base text-foreground ${error ? 'border-destructive' : 'border-transparent'}`}
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
  /** Alan doldurulduğunda da görünen kalıcı etiket. */
  label: string;
  error?: string;
  secure?: boolean;
};

/**
 * Mockup'ların giriş/kayıt alanı: beyaz zemin, ince kenarlık, solda ikon,
 * kalıcı etiket. Parolada sağda göz düğmesi.
 */
export const IconField = forwardRef<TextInput, IconFieldProps>(function IconField(
  { icon, label, error, secure, ...rest },
  ref
) {
  const { colors } = useTheme();
  const [reveal, setReveal] = useState(false);
  const errorId = error ? `field-error-${label.toLocaleLowerCase('tr').replace(/[^a-z0-9]+/g, '-')}` : undefined;

  return (
    <View className="gap-2">
      <Text className="font-inter-medium text-sm text-foreground">{label}</Text>
      <View
        className={`min-h-[52px] flex-row items-center gap-3 rounded-[14px] border bg-card px-4 ${error ? 'border-destructive' : 'border-border'}`}
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
            className="h-11 w-11 items-center justify-center active:opacity-60"
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
 * Mockup'ların ekran başlığı: kırmızı ilk satır, koyu ikinci satır. Tek satırlı
 * ekranlarda (Giriş Yap, Hazırsınız) yalnız kırmızı satır çizilir.
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
      <Text accessibilityRole="header" className="font-inter-bold" style={{ ...line, color: colors.primary }}>
        {lead}
      </Text>
      {tail ? (
        <Text className="font-inter-bold" style={{ ...line, color: colors.foreground }}>
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

/** Mockup'ta üst eylemler çerçevesiz düz ikon; yalnız bildirimde kırmızı nokta var. */
function ActionButton({ action }: { action: HeaderAction }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center active:opacity-60"
    >
      <Ionicons name={action.icon} size={23} color={colors.foreground} />
      {action.dot ? (
        <View className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
      ) : null}
    </Pressable>
  );
}

/** Native başlığın sağ tarafı: iOS 26'da sistem bunu tek bir glass kapsül içine alır. */
function HeaderActions({ actions }: { actions: HeaderAction[] }) {
  return (
    <View className="flex-row items-center">
      {actions.map((action) => <ActionButton key={action.label} action={action} />)}
    </View>
  );
}

/**
 * Liste/modül ekranı başlığı. Başlık native yığın çubuğunda (iOS 26'da liquid
 * glass düğmeler, geri tuşu sistemden); kökteki ekranda sol tarafa logo
 * yığın düzeninden gelir. Açıklama satırı içerikte, çubuğun hemen altında.
 */
export function ScreenHeader({
  title,
  subtitle,
  actions = [],
  hideBell,
  count,
}: {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
  /** Bildirim ekranının kendisi gibi zilin anlamsız kaldığı yerlerde. */
  hideBell?: boolean;
  /** Listelerde toplam kayıt; her listede aynı yerde görünür. */
  count?: number;
}) {
  const router = useRouter();
  const unread = useUnreadCount();
  const all = hideBell ? actions : [...actions, {
    icon: 'notifications-outline' as const,
    label: 'Bildirimler',
    dot: unread > 0,
    onPress: () => router.push('/notifications'),
  }];
  return (
    <>
      <Stack.Screen options={{
        headerShown: true,
        title,
        headerRight: all.length ? () => <HeaderActions actions={all} /> : undefined,
      }} />
      {subtitle || count !== undefined ? (
        <Text
          className="font-inter text-[13px] leading-[18px] text-muted-foreground"
          style={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 6 }}
          numberOfLines={2}
        >
          {[subtitle, count !== undefined ? `${count.toLocaleString('tr-TR')} kayıt` : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </>
  );
}

/** Detay ekranı başlığı: native geri tuşu + ortada başlık/alt başlık + sağda tüm eylemler. */
export function DetailHeader({
  title,
  subtitle,
  actions = [],
}: {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
}) {
  return (
    <Stack.Screen options={{
      headerShown: true,
      title,
      headerTitle: subtitle ? () => (
        <View className="items-center" style={{ maxWidth: 240 }}>
          <Text className="font-inter-semibold text-[17px] text-foreground" numberOfLines={1}>{title}</Text>
          <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{subtitle}</Text>
        </View>
      ) : undefined,
      headerRight: actions.length ? () => <HeaderActions actions={actions} /> : undefined,
    }} />
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
    <View style={{ paddingHorizontal: SCREEN_PAD }} className="flex-row items-center gap-2.5">
      <View
        className="h-[52px] flex-1 flex-row items-center gap-2.5 rounded-[14px] border border-border bg-card px-4"
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
          accessibilityLabel={filterActive ? 'Filtreler etkin. Filtreleri düzenle' : 'Filtrele'}
          onPress={onFilterPress}
          className="h-[52px] w-[52px] items-center justify-center rounded-[14px] border border-border bg-card active:opacity-70"
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
}: {
  options: FilterOption<T>[];
  value: T | null;
  onChange: (next: T | null) => void;
  allLabel?: string;
}) {
  const { fontScale } = useWindowDimensions();
  const chipHeight = Math.max(46, Math.ceil(28 + 18 * fontScale));
  // allLabel="" ile çağıran formlar tekli seçim ister: boş "Tümü" pili çizilmez.
  const rows: { key: string; label: string; count?: number; active: boolean; press: () => void }[] = [
    ...(allLabel ? [{ key: '__all', label: allLabel, active: value === null, press: () => onChange(null) }] : []),
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
      style={{ height: chipHeight, flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ paddingHorizontal: allLabel ? SCREEN_PAD : 0, gap: 10 }}
      keyboardShouldPersistTaps="handled"
    >
      {rows.map((row) => (
        <Pressable
          key={row.key}
          accessibilityRole="button"
          accessibilityState={{ selected: row.active }}
          onPress={row.press}
          style={{ minHeight: chipHeight }}
          className={`flex-row items-center gap-1.5 rounded-full border px-5 ${
            row.active ? 'border-primary bg-primary' : 'border-border bg-card'
          }`}
        >
          <Text
            className={`text-[15px] font-inter-medium ${row.active ? 'text-primary-foreground' : 'text-foreground'}`}
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
}: {
  items: { label: string; value: string; tone?: Tone; icon?: keyof typeof Ionicons.glyphMap }[];
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{ marginHorizontal: SCREEN_PAD, borderCurve: 'continuous' }}
      className="flex-row rounded-[16px] border border-border bg-card py-1"
    >
      {items.map((item, index) => (
        <View
          key={item.label}
          className={`flex-1 items-center gap-1 px-1 py-3.5 ${index > 0 ? 'border-l border-border' : ''}`}
        >
          {item.icon ? <Ionicons name={item.icon} size={22} color={colors.primary} /> : null}
          <Text
            className="font-inter-bold text-[22px] leading-[26px]"
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
    <View className="flex-row items-center justify-between gap-3 px-4 pb-2 pt-6">
      <Text accessibilityRole="header" className="flex-1 font-inter-semibold text-base text-foreground">{title}</Text>
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
  trailingTone = 'destructive',
  onPress,
}: ListRowProps) {
  const { colors } = useTheme();
  const allChips = chips ?? (chip ? [chip] : []);
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 390 || fontScale > 1.2;
  const visibleLines = lines.filter((line): line is string => Boolean(line));
  const body = (
    <View
      className="my-1 flex-row flex-wrap items-center gap-3 rounded-surface border border-border bg-card p-4"
      style={{ borderCurve: 'continuous' }}
    >
      {icon ? (
        <View className={`h-[46px] w-[46px] items-center justify-center rounded-[12px] border ${chipClass[iconTone]}`}>
          <Ionicons name={icon} size={22} color={toneColor(colors, iconTone)} />
        </View>
      ) : null}

      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base font-inter-semibold leading-[22px] text-foreground" numberOfLines={2}>
          {title}
        </Text>
        {visibleLines
          .slice(0, onPress ? 2 : undefined)
          .map((line) => (
            <Text key={line} className="font-inter text-[13px] leading-[17px] text-muted-foreground" numberOfLines={1}>
              {line}
            </Text>
          ))}
        {allChips.length > 0 ? (
          <View className="mt-1 flex-row flex-wrap gap-1.5">
            {allChips.map((c) => (
              <Chip key={c.label} tone={c.tone} label={c.label} />
            ))}
          </View>
        ) : null}
      </View>

      {trailing ? (
        <View className="flex-row items-center gap-3" style={compact ? { width: '100%', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
          {!compact ? <View className="h-8 w-px" style={{ backgroundColor: colors.border }} /> : null}
          <View className="items-start gap-1" style={{ maxWidth: compact ? undefined : 112 }}>
            {metaLabel ? (
              <View className="flex-row items-center gap-1">
                {metaIcon ? <Ionicons name={metaIcon} size={13} color={colors.mutedForeground} /> : null}
                <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
                  {metaLabel}
                </Text>
              </View>
            ) : null}
            <Text
              className="font-inter-semibold text-[15px]"
              numberOfLines={1}
              style={{ color: toneColor(colors, trailingTone), fontVariant: ['tabular-nums'] }}
            >
              {trailing}
            </Text>
          </View>
        </View>
      ) : null}

      {onPress && !compact ? <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, ...visibleLines, ...allChips.map(item => item.label), metaLabel, trailing].filter(Boolean).join(', ')} onPress={onPress} className="active:opacity-70">
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
  const insets = useSafeAreaInsets();
  // iOS'ta yerel sekme çubuğu içeriğin üstünde yüzer ve güvenli alan değerine
  // dahil değildir; buton çubuğun (49 pt) üstüne alınır. Android'de sahne zaten
  // çubuk kadar kısaltılmış durumda.
  const bottom = Platform.OS === 'ios' ? insets.bottom + IOS_TAB_BAR_HEIGHT + 12 : 20;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="box-none" className="flex-1 items-end justify-end px-5" style={{ paddingBottom: bottom }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress();
          }}
          style={{ boxShadow: `0 6px 16px ${colors.primary}52` }}
          className={`h-14 flex-row items-center justify-center gap-2 bg-primary active:opacity-80 ${
            extended ? 'rounded-full px-5' : 'w-14 rounded-full'
          }`}
        >
          <Ionicons name={icon} size={24} color={colors.primaryForeground} />
          {extended ? <Text className="font-inter-semibold text-base text-primary-foreground">{label}</Text> : null}
        </Pressable>
      </View>
    </View>
  );
}

const IOS_TAB_BAR_HEIGHT = 49;
