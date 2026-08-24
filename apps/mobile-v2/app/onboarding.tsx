import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { kv } from '@/src/offline/storage';
import { chipClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button, H1 } from '@/src/ui';

export const ONBOARDING_KEY = 'onboarding_seen';

const pageIndexFor = (x: number, width: number) => Math.round(x / width);

type Slide = {
  key: string;
  title: string;
  body: string;
  /** Görsel yerine modül rozetleri: tasarımdaki 3B sahnenin sade karşılığı. */
  tiles: { icon: keyof typeof Ionicons.glyphMap; label: string; tone: Tone }[];
};

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    title: 'Tüm İş Süreçleriniz Tek Platformda',
    body: 'CRM, satış, stok, servis ve finans süreçlerini tek uygulamadan yönetin.',
    tiles: [
      { icon: 'people-outline', label: 'Müşteriler', tone: 'info' },
      { icon: 'cube-outline', label: 'Stok', tone: 'success' },
      { icon: 'wallet-outline', label: 'Finans', tone: 'warning' },
      { icon: 'construct-outline', label: 'Servis', tone: 'destructive' },
    ],
  },
  {
    key: 'crm',
    title: 'Müşteri ve Fırsat Takibi',
    body: 'Lead’den kazanılan işe kadar fırsatları pano üzerinde adım adım ilerletin.',
    tiles: [
      { icon: 'briefcase-outline', label: 'Fırsatlar', tone: 'stage' },
      { icon: 'business-outline', label: 'Firmalar', tone: 'info' },
      { icon: 'pulse-outline', label: 'Aktiviteler', tone: 'neutral' },
      { icon: 'grid-outline', label: 'Pano', tone: 'success' },
    ],
  },
  {
    key: 'sales',
    title: 'Tekliften Siparişe',
    body: 'Teklif, proforma ve sipariş adımlarını tek akışta hızlı ve düzenli yönetin.',
    tiles: [
      { icon: 'document-text-outline', label: 'Teklif', tone: 'warning' },
      { icon: 'receipt-outline', label: 'Sipariş', tone: 'success' },
      { icon: 'document-outline', label: 'Fatura', tone: 'info' },
      { icon: 'cart-outline', label: 'Satın Alma', tone: 'neutral' },
    ],
  },
  {
    key: 'operations',
    title: 'Servis, Kurulum ve Sevkiyat',
    body: 'Teknik servis, montaj ve teslim süreçlerini sahadan anlık takip edin.',
    tiles: [
      { icon: 'construct-outline', label: 'Servis', tone: 'destructive' },
      { icon: 'hammer-outline', label: 'Kurulum', tone: 'info' },
      { icon: 'car-outline', label: 'Sevkiyat', tone: 'stage' },
      { icon: 'build-outline', label: 'Bakım', tone: 'success' },
    ],
  },
  {
    key: 'offline',
    title: 'Bağlantı Durumu Kontrol Altında',
    body: 'Çevrimdışı olduğunuzu anında görün; kayıt işlemlerinde bağlantı gerektiğinde açık uyarı alın, bağlantı gelince verilerinizi yenileyin.',
    tiles: [
      { icon: 'cloud-offline-outline', label: 'Durum Uyarısı', tone: 'warning' },
      { icon: 'sync-outline', label: 'Otomatik Yenile', tone: 'info' },
      { icon: 'notifications-outline', label: 'Bildirim', tone: 'destructive' },
      { icon: 'stats-chart-outline', label: 'Rapor', tone: 'success' },
    ],
  },
];

/**
 * Kaydırmaya bağlı paralaks: odaktaki slayt tam görünür, kenardakiler hafif
 * geride kalır ve soluklaşır. Kurumsal ton korunur — abartısız derinlik.
 */
function SlideView({
  slide,
  pageIndex,
  width,
  scrollX,
}: {
  slide: Slide;
  pageIndex: number;
  width: number;
  scrollX: SharedValue<number>;
}) {
  const { colors } = useTheme();

  const pageStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      scrollX.value,
      [(pageIndex - 1) * width, pageIndex * width, (pageIndex + 1) * width],
      [-1, 0, 1],
      'clamp'
    );
    return {
      opacity: interpolate(progress, [-1, 0, 1], [0.35, 1, 0.35], 'clamp'),
      transform: [{ translateX: progress * 36 }],
    };
  });

  const tileStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      scrollX.value,
      [(pageIndex - 1) * width, pageIndex * width, (pageIndex + 1) * width],
      [-1, 0, 1],
      'clamp'
    );
    return { transform: [{ translateY: progress * 26 }] };
  });

  return (
    <View style={{ width }} className="flex-1 justify-center gap-8 px-8">
      <Animated.View style={tileStyle}>
        <View className="flex-row flex-wrap justify-center gap-3">
          {slide.tiles.map((tile) => (
            <View
              key={tile.label}
              className="w-[45%] items-center gap-2 rounded-surface border border-border bg-card px-3 py-5"
            >
              <View className={`h-12 w-12 items-center justify-center rounded-full border ${chipClass[tile.tone]}`}>
                <Ionicons name={tile.icon} size={23} color={toneColor(colors, tile.tone)} />
              </View>
              <Text className="text-center font-inter-medium text-[12px] text-foreground">{tile.label}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={pageStyle} className="gap-2">
        <H1 className="text-[30px]">{slide.title}</H1>
        <Text className="font-inter text-base leading-[1.45] text-muted-foreground">{slide.body}</Text>
      </Animated.View>
    </View>
  );
}

/** Aktif nokta genişlerken yaylı hareket eder; diğerleri sabit kalır. */
function Dot({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(active ? 1 : 0, { damping: 18, stiffness: 220 });
  }, [active, progress]);

  const dotStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [8, 18]),
  }));

  return (
    <Animated.View
      className="h-2 rounded-full"
      style={[dotStyle, { backgroundColor: active ? colors.primary : colors.lineStrong }]}
    />
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);

  function finish() {
    kv.set(ONBOARDING_KEY, '1');
    router.replace('/(auth)/login');
  }

  function next() {
    if (index >= SLIDES.length - 1) return finish();
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }

  // Kaydırmayla değişen sayfayı nokta göstergesine yansıtır; paralaks için
  // paylaşılan değeri de besler (reduced-motion'da paralaks kapalı kalır).
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = event.nativeEvent.contentOffset.x;
    scrollX.value = reduce ? pageIndexFor(x, width) * width : x;
    const page = pageIndexFor(x, width);
    if (page !== index) setIndex(page);
  }

  const last = index === SLIDES.length - 1;

  const brandStyle = useAnimatedBrandEntrance(reduce);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Animated.View style={brandStyle} className="flex-row items-center justify-between px-5 pt-2">
        <View>
          <Text className="font-display text-[22px] tracking-display text-foreground">Haksan Makina</Text>
          <Text className="font-inter-semibold text-[11px] text-primary">ERP</Text>
        </View>
        {!last ? (
          <Pressable accessibilityRole="button" onPress={finish} className="active:opacity-60">
            <Text className="font-inter-medium text-[14px] text-muted-foreground">Geç</Text>
          </Pressable>
        ) : null}
      </Animated.View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {SLIDES.map((slide, slideIndex) => (
          <SlideView key={slide.key} slide={slide} pageIndex={slideIndex} width={width} scrollX={scrollX} />
        ))}
      </ScrollView>

      <View className="flex-row items-center justify-between gap-4 px-6 pb-4 pt-2">
        <View className="flex-row gap-1.5">
          {SLIDES.map((slide, dotIndex) => (
            <Dot key={slide.key} active={dotIndex === index} />
          ))}
        </View>
        <View className="min-w-[140px]">
          <Button label={last ? 'Başlayalım' : 'İleri'} onPress={next} />
        </View>
      </View>
    </SafeAreaView>
  );
}

/** Marka bloğu ilk açılışta yumuşakça belirir. */
function useAnimatedBrandEntrance(reduce: boolean) {
  const progress = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    progress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [reduce, progress]);
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -10 }],
  }));
}
