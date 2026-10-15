import { useEffect, useRef, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { kv } from '@/src/offline/storage';
import { authPaper, FixedScheme, useTheme } from '@/src/theme/theme';
import { Logo } from '@/src/ui/Logo';

export const ONBOARDING_KEY = 'onboarding_seen';

const pageIndexFor = (x: number, width: number) => Math.round(x / width);

type Slide = {
  key: string;
  /** Başlığın kırmızı ilk satırı. */
  lead: string;
  /** Başlığın koyu ikinci satırı; "Hazırsınız" gibi tek satırlarda boş. */
  tail?: string;
  body: string;
  art: ImageSourcePropType;
};

/** Metinler ve görseller mockup kataloğundan birebir alındı. */
const SLIDES: Slide[] = [
  {
    key: 'welcome',
    lead: 'HaksanMakina',
    tail: 'ERP’ye Hoş Geldiniz',
    body: 'Tüm iş süreçlerinizi tek bir platformda yönetin, verimliliğinizi artırın.',
    art: require('../assets/onboarding/step01.png'),
  },
  {
    key: 'stock',
    lead: 'Akıllı Stok',
    tail: 'Yönetimi',
    body: 'Makine, yedek parça ve seri no süreçlerini tek ekranda izleyin.',
    art: require('../assets/onboarding/step02.png'),
  },
  {
    key: 'quote-to-order',
    lead: 'Tekliften',
    tail: 'Siparişe',
    body: 'Teklif, proforma ve sipariş adımlarını hızlı ve düzenli yönetin.',
    art: require('../assets/onboarding/step03.png'),
  },
  {
    key: 'crm',
    lead: 'Müşteri ve',
    tail: 'Fırsat Takibi',
    body: 'Lead, müşteri ve satış fırsatlarını tek akışta takip edin.',
    art: require('../assets/onboarding/step04.png'),
  },
  {
    key: 'service',
    lead: 'Servis ve',
    tail: 'Kurulum Planlama',
    body: 'Teknik servis, montaj ve teslim süreçlerini kolayca organize edin.',
    art: require('../assets/onboarding/step05.png'),
  },
  {
    key: 'logistics',
    lead: 'Sevkiyat ve',
    tail: 'Lojistik Kontrolü',
    body: 'Yükleme, teslimat ve depo hareketlerini anlık görün.',
    art: require('../assets/onboarding/step06.png'),
  },
  {
    key: 'finance',
    lead: 'Cari ve Finans',
    tail: 'Yönetimi',
    body: 'Borç, alacak ve ödeme hareketlerini güvenle yönetin.',
    art: require('../assets/onboarding/step07.png'),
  },
  {
    key: 'reporting',
    lead: 'Raporlama ve',
    tail: 'Performans',
    body: 'Haftalık, aylık ve yıllık verileri net raporlarla analiz edin.',
    art: require('../assets/onboarding/step08.png'),
  },
  {
    key: 'roles',
    lead: 'Rol ve',
    tail: 'Onay Süreçleri',
    body: 'Yetkileri doğru tanımlayın, onay adımlarını kontrollü ilerletin.',
    art: require('../assets/onboarding/step09.png'),
  },
  {
    key: 'ready',
    lead: 'Hazırsınız',
    body: 'HaksanMakina ERP ile süreçlerinizi şimdi daha hızlı ve kontrollü yönetin.',
    art: require('../assets/onboarding/step10.png'),
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

  const progressAt = (from: number, to: number) => {
    'worklet';
    return interpolate(
      scrollX.value,
      [(pageIndex - 1) * width, pageIndex * width, (pageIndex + 1) * width],
      [from, 0, to],
      'clamp'
    );
  };

  const textStyle = useAnimatedStyle(() => {
    const progress = progressAt(-1, 1);
    return {
      opacity: interpolate(progress, [-1, 0, 1], [0.35, 1, 0.35], 'clamp'),
      transform: [{ translateX: progress * 36 }],
    };
  });

  const artStyle = useAnimatedStyle(() => ({ transform: [{ translateY: progressAt(-1, 1) * 26 }] }));

  return (
    // flexShrink kapalı: yatay ScrollView satır düzeni kurduğu için `flex-1`
    // sabit sayfa genişliğini ezip sayfaları birbirine taşırıyor.
    // overflow-hidden: paralaks kaydırması komşu slaydı kendi sayfasının
    // dışına taşırıyordu, duran ekranda yan sayfanın başlığı görünüyordu.
    <View style={{ width, height: '100%', flexGrow: 0, flexShrink: 0, overflow: 'hidden' }}>
      <Animated.View style={[textStyle, { paddingHorizontal: 28, paddingTop: 36 }]}>
        <Text
          accessibilityRole="header"
          className="font-inter-bold"
          style={{ fontSize: 30, lineHeight: 35, color: colors.primary }}
        >
          {slide.lead}
        </Text>
        {slide.tail ? (
          <Text
            className="font-inter-bold"
            style={{ fontSize: 30, lineHeight: 35, color: colors.foreground }}
          >
            {slide.tail}
          </Text>
        ) : null}
        <Text
          className="font-inter"
          style={{ fontSize: 15, lineHeight: 21, marginTop: 17, color: colors.mutedForeground }}
        >
          {slide.body}
        </Text>
      </Animated.View>

      <Animated.View style={[artStyle, { flex: 1, justifyContent: 'center' }]}>
        <Image source={slide.art} style={{ width, height: undefined, aspectRatio: 758 / 730 }} resizeMode="contain" />
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

  const dotStyle = useAnimatedStyle(() => ({ width: interpolate(progress.value, [0, 1], [8, 8]) }));

  return (
    <Animated.View
      style={[
        dotStyle,
        { height: 8, borderRadius: 999, backgroundColor: active ? colors.primary : '#d9d9d9' },
      ]}
    />
  );
}

export default function OnboardingScreen() {
  return (
    <FixedScheme scheme="light">
      <Onboarding />
    </FixedScheme>
  );
}

function Onboarding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const { colors } = useTheme();
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

  function back() {
    scrollRef.current?.scrollTo({ x: (index - 1) * width, animated: true });
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
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: authPaper }} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: 28, paddingTop: 8 }}>
        <Logo width={205} />
      </View>

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

      {/* Alt çubuk mockup'ta zeminden ayrılan beyaz bir tabaka. */}
      <View
        className="flex-row items-center justify-between bg-card px-8 pb-9 pt-5"
        style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, borderCurve: 'continuous' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={last ? 'Önceki adım' : 'Onboarding’i atla'}
          onPress={last ? back : finish}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-inter-medium text-[16px] text-foreground">{last ? 'Geri' : 'Geç'}</Text>
        </Pressable>

        <View className="flex-row gap-[9px]" accessibilityLabel={`${index + 1} / ${SLIDES.length}`}>
          {Array.from({ length: 5 }, (_, dotIndex) => (
            <Dot key={dotIndex} active={dotIndex === Math.floor(index / 2)} />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={last ? 'Başla' : 'İleri'}
          onPress={next}
          style={{
            width: 128,
            height: 53,
            borderRadius: 27,
            borderCurve: 'continuous',
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.28,
            shadowRadius: 12,
            elevation: 5,
          }}
          className="flex-row items-center justify-between bg-primary px-5 active:opacity-85"
        >
          <Text className="font-inter-semibold text-[16px] text-primary-foreground">{last ? 'Başla' : 'İleri'}</Text>
          <Ionicons name="chevron-forward" size={17} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
