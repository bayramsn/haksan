import { useEffect, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  Pressable,
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
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  FadeIn,
  FadeInDown,
  withTiming,
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

/** Metinler mockup kataloğundan; animasyonlu görseller `onboarding-film/` HyperFrames projesinden render edilir. */
const SLIDES: Slide[] = [
  {
    key: 'welcome',
    lead: 'HaksanMakina',
    tail: 'ERP’ye Hoş Geldiniz',
    body: 'Tüm iş süreçlerinizi tek bir platformda yönetin, verimliliğinizi artırın.',
    art: require('../assets/onboarding/step01.gif'),
  },
  {
    key: 'stock',
    lead: 'Akıllı Stok',
    tail: 'Yönetimi',
    body: 'Makine, yedek parça ve seri no süreçlerini tek ekranda izleyin.',
    art: require('../assets/onboarding/step02.gif'),
  },
  {
    key: 'quote-to-order',
    lead: 'Tekliften',
    tail: 'Siparişe',
    body: 'Teklif, proforma ve sipariş adımlarını hızlı ve düzenli yönetin.',
    art: require('../assets/onboarding/step03.gif'),
  },
  {
    key: 'crm',
    lead: 'Müşteri ve',
    tail: 'Fırsat Takibi',
    body: 'Lead, müşteri ve satış fırsatlarını tek akışta takip edin.',
    art: require('../assets/onboarding/step04.gif'),
  },
  {
    key: 'service',
    lead: 'Servis ve',
    tail: 'Kurulum Planlama',
    body: 'Teknik servis, montaj ve teslim süreçlerini kolayca organize edin.',
    art: require('../assets/onboarding/step05.gif'),
  },
  {
    key: 'logistics',
    lead: 'Sevkiyat ve',
    tail: 'Lojistik Kontrolü',
    body: 'Yükleme, teslimat ve depo hareketlerini anlık görün.',
    art: require('../assets/onboarding/step06.gif'),
  },
  {
    key: 'finance',
    lead: 'Cari ve Finans',
    tail: 'Yönetimi',
    body: 'Borç, alacak ve ödeme hareketlerini güvenle yönetin.',
    art: require('../assets/onboarding/step07.gif'),
  },
  {
    key: 'reporting',
    lead: 'Raporlama ve',
    tail: 'Performans',
    body: 'Haftalık, aylık ve yıllık verileri net raporlarla analiz edin.',
    art: require('../assets/onboarding/step08.gif'),
  },
  {
    key: 'roles',
    lead: 'Rol ve',
    tail: 'Onay Süreçleri',
    body: 'Yetkileri doğru tanımlayın, onay adımlarını kontrollü ilerletin.',
    art: require('../assets/onboarding/step09.gif'),
  },
  {
    key: 'ready',
    lead: 'Hazırsınız',
    body: 'HaksanMakina ERP ile süreçlerinizi şimdi daha hızlı ve kontrollü yönetin.',
    art: require('../assets/onboarding/step10.gif'),
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
  active,
}: {
  slide: Slide;
  pageIndex: number;
  width: number;
  scrollX: SharedValue<number>;
  active: boolean;
}) {
  const { colors } = useTheme();
  // GIF tek sefer oynar; ekrana gelmeden yüklenirse animasyon görünmeden biter.
  // Slayt ilk kez açıldığında takılır, geri dönüşte bitmiş hâliyle durur.
  const [seen, setSeen] = useState(active);
  useEffect(() => {
    if (active) setSeen(true);
  }, [active]);

  // Her stil scrollX.value'yu kendi gövdesinde okur: Reanimated aboneliği yalnız
  // doğrudan okunan paylaşılan değerlere kurar; yardımcı fonksiyon içinden okununca
  // stil yalnız React yeniden çizdiğinde güncelleniyordu.
  const progressOf = (x: number) => {
    'worklet';
    return interpolate(x, [(pageIndex - 1) * width, pageIndex * width, (pageIndex + 1) * width], [-1, 0, 1], 'clamp');
  };

  // Katmanlı paralaks: başlık, alt başlık ve metin farklı hızlarda kayar;
  // görsel sayfadan yavaş kayıp hafifçe küçülür — kaydırmada derinlik hissi.
  const layer = (x: number, shift: number) => {
    'worklet';
    const p = progressOf(x);
    return { opacity: interpolate(Math.abs(p), [0, 1], [1, 0], 'clamp'), transform: [{ translateX: p * shift }] };
  };
  const leadStyle = useAnimatedStyle(() => layer(scrollX.value, 40));
  const tailStyle = useAnimatedStyle(() => layer(scrollX.value, 70));
  const bodyStyle = useAnimatedStyle(() => layer(scrollX.value, 100));

  const artStyle = useAnimatedStyle(() => {
    const p = progressOf(scrollX.value);
    return {
      opacity: interpolate(Math.abs(p), [0, 1], [1, 0.2], 'clamp'),
      transform: [{ translateX: p * width * 0.35 }, { scale: interpolate(Math.abs(p), [0, 1], [1, 0.86], 'clamp') }],
    };
  });

  return (
    // flexShrink kapalı: yatay ScrollView satır düzeni kurduğu için `flex-1`
    // sabit sayfa genişliğini ezip sayfaları birbirine taşırıyor.
    // overflow-hidden: paralaks kaydırması komşu slaydı kendi sayfasının
    // dışına taşırıyordu, duran ekranda yan sayfanın başlığı görünüyordu.
    <View style={{ width, height: '100%', flexGrow: 0, flexShrink: 0, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: 28, paddingTop: 36 }}>
        <Animated.Text
          accessibilityRole="header"
          className="font-inter-bold"
          style={[leadStyle, { fontSize: 30, lineHeight: 35, color: colors.primary }]}
        >
          {slide.lead}
        </Animated.Text>
        {slide.tail ? (
          <Animated.Text className="font-inter-bold" style={[tailStyle, { fontSize: 30, lineHeight: 35, color: colors.foreground }]}>
            {slide.tail}
          </Animated.Text>
        ) : null}
        <Animated.Text
          className="font-inter"
          style={[bodyStyle, { fontSize: 15, lineHeight: 21, marginTop: 17, color: colors.mutedForeground }]}
        >
          {slide.body}
        </Animated.Text>
      </View>

      <Animated.View style={[artStyle, { flex: 1, justifyContent: 'center' }]}>
        {seen ? (
          <Image source={slide.art} style={{ width, height: undefined, aspectRatio: 760 / 732 }} resizeMode="contain" />
        ) : (
          <View style={{ width, aspectRatio: 760 / 732 }} />
        )}
      </Animated.View>
    </View>
  );
}

/** Sürekli ilerleme çubuğu: kaydırmayı parmakla birlikte izler (10 slayt için 5 nokta yanıltıcıydı). */
const TRACK = 96;
/** Sayfa ilerleme çubuğu (10 slayt için 5 nokta yanıltıcıydı). */
function Progress({ index }: { index: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: TRACK, height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.lineStrong }}>
      <View style={{ width: (TRACK * (index + 1)) / SLIDES.length, height: 6, borderRadius: 999, backgroundColor: colors.primary }} />
    </View>
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
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);

  function finish() {
    kv.set(ONBOARDING_KEY, '1');
    router.replace('/(auth)/login');
  }

  function goTo(page: number) {
    setIndex(page);
    scrollRef.current?.scrollTo({ x: page * width, animated: true });
    // Programatik kaydırmada olay gelmese de paralaks hedef sayfada otursun.
    scrollX.value = withTiming(page * width, { duration: 320 });
  }

  function next() {
    if (index >= SLIDES.length - 1) return finish();
    goTo(index + 1);
  }

  // Paralaks UI iş parçacığında kaydırmayı birebir izler; JS'teki onScroll
  // bırakma sonrası olayları kaçırıp ekranı yarı kaymış bırakıyordu.
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const x = e.contentOffset.x;
      scrollX.value = reduce ? pageIndexFor(x, width) * width : x;
    },
  });

  function onSettle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const page = pageIndexFor(event.nativeEvent.contentOffset.x, width);
    setIndex(page);
    scrollX.value = page * width;
  }

  const last = index === SLIDES.length - 1;
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: authPaper }} edges={['top', 'left', 'right']}>
      <Animated.View entering={FadeInDown.duration(420)} style={{ paddingHorizontal: 28, paddingTop: 8 }}>
        <Logo width={156} />
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onMomentumScrollEnd={onSettle}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {SLIDES.map((slide, slideIndex) => (
          <SlideView key={slide.key} slide={slide} pageIndex={slideIndex} width={width} scrollX={scrollX} active={slideIndex === index} />
        ))}
      </Animated.ScrollView>

      {/* Alt çubuk mockup'ta zeminden ayrılan beyaz bir tabaka. */}
      <View
        className="flex-row items-center justify-between bg-card px-8 pb-9 pt-5"
        style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, borderCurve: 'continuous' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={last ? 'Önceki adım' : 'Onboarding’i atla'}
          onPress={last ? () => goTo(index - 1) : finish}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-inter-medium text-[16px] text-foreground">{last ? 'Geri' : 'Geç'}</Text>
        </Pressable>

        <View accessibilityLabel={`${index + 1} / ${SLIDES.length}`}>
          <Progress index={index} />
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
          <Animated.Text key={last ? 'start' : 'next'} entering={FadeIn.duration(220)} className="font-inter-semibold text-[16px] text-primary-foreground">
            {last ? 'Başla' : 'İleri'}
          </Animated.Text>
          <Ionicons name="chevron-forward" size={17} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
