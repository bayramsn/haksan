import { useEffect } from 'react';
import { View, type ViewProps, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/src/theme/theme';

/**
 * Hareket sözleşmesi (bkz. DESIGN.md): yalnızca opacity/transform; standart
 * geçiş ~150 ms, büyük yüzey girişi en fazla ~220 ms. Tüm girişler
 * useReducedMotion açıkken anında tam durur — erişilebilirlik şartı.
 */

const ENTER_MS = 200;
const STAGGER_STEP = 45;

/** Tek seferlik giriş: hafif yükselme + belirginleşme. */
export function Enter({
  children,
  delay = 0,
  distance = 12,
  className,
  style,
  ...rest
}: ViewProps & { children?: React.ReactNode; delay?: number; distance?: number; style?: StyleProp<ViewProps['style']> }) {
  const reduce = useReducedMotion();
  const progress = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) })
    );
  }, [delay, reduce, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return (
    <Animated.View className={className} style={[animated, style]} {...rest}>
      {children}
    </Animated.View>
  );
}

/** Liste/kart gruplarını kademeli açar; eleman sayısı arttıkça gecikme sınırlanır. */
export function Stagger({
  children,
  index = 0,
  step = STAGGER_STEP,
  maxDelay = 360,
}: {
  children?: React.ReactNode;
  index?: number;
  step?: number;
  maxDelay?: number;
}) {
  return <Enter delay={Math.min(index * step, maxDelay)}>{children}</Enter>;
}

/* --------------------------------------------------------------- iskelet ---- */

/** Yükleme iskeleti: nazik nabız; çark yerine içerik şeklini gösterir. */
export function Skeleton({
  width,
  height = 14,
  rounded = 8,
  className,
}: {
  width?: number | `${number}%`;
  height?: number;
  rounded?: number;
  className?: string;
}) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [reduce, pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: 0.45 + pulse.value * 0.55 }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Yükleniyor"
      style={{
        width: width ?? '100%',
        height,
        borderRadius: rounded,
        backgroundColor: colors.lineStrong,
      }}
    >
      <Animated.View style={[{ flex: 1, borderRadius: rounded, backgroundColor: colors.border }, animated]} />
    </View>
  );
}

/** Liste yüklemesi: gerçek satır ritmini taklit eden 5 satır. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View className="gap-2 px-4 pt-2">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className="flex-row items-center gap-3 rounded-overlay border border-border bg-card px-3.5 py-3">
          <Skeleton width={40} height={40} rounded={12} />
          <View className="flex-1 gap-2">
            <Skeleton width="62%" />
            <Skeleton width="38%" height={11} />
          </View>
          <Skeleton width={64} height={13} />
        </View>
      ))}
    </View>
  );
}

/** Detay ekranı yüklemesi: başlık kartı + bilgi satırları. */
export function DetailSkeleton() {
  return (
    <View className="gap-4 px-4 pt-4">
      <View className="gap-3 rounded-surface border border-border bg-card p-4">
        <Skeleton width="34%" height={22} />
        <Skeleton width="70%" height={16} />
        <Skeleton width="52%" height={12} />
      </View>
      <View className="gap-3 rounded-surface border border-border bg-card p-4">
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} className="flex-row items-center justify-between gap-4">
            <Skeleton width={90} height={12} />
            <Skeleton width="42%" height={12} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Metin blokları için küçük yardımcı (form özetleri vb.). */
export function TextSkeleton({ lines = 2 }: { lines?: number }) {
  const widths: (`${number}%`)[] = ['88%', '72%', '80%', '58%'];
  return (
    <View className="gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} height={12} />
      ))}
    </View>
  );
}

/** Monospace veri rakamları: tutarlarda sabit genişlik (DESIGN.md veri tipografisi). */
export function tabularNums(style?: TextStyle): TextStyle {
  return { fontVariant: ['tabular-nums'], ...(style ?? {}) };
}
