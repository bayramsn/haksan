import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import { ScrollView, Text, View, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import { SCREEN_PAD, useTheme } from '@/src/theme/theme';

/** Büyük kimlik kartı ekrandan çıktı mı; kısa kimlik satırı yalnız o zaman görünür. */
const IntroScrolledAway = createContext(true);

/**
 * Firma listesindeki intro + yapışkan arama düzeni, detay kimlik kartı için.
 * Büyük kart (intro) kaydırılınca yukarı çıkar. Kısa kimlik ve sekmeler
 * (sticky) üstte kalır — kart içeriğin üstünde sabit bant olarak kalmaz.
 */
export function CollapsingDetailScroll({
  intro,
  sticky,
  children,
  refreshControl,
  contentClassName,
  contentStyle,
  paddingBottom,
}: {
  intro: ReactNode;
  sticky: ReactNode;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  contentClassName?: string;
  contentStyle?: StyleProp<ViewStyle>;
  paddingBottom?: number;
}) {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const { colors } = useTheme();
  const [viewport, setViewport] = useState(0);
  const [introHeight, setIntroHeight] = useState(0);
  const [scrolledAway, setScrolledAway] = useState(false);

  return (
    <ScrollView
      className="flex-1"
      stickyHeaderIndices={[1]}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: paddingBottom ?? GLASS_TAB_BAR_HEIGHT + 32 }}
      scrollEventThrottle={32}
      onScroll={(event) => {
        // Kart görünürken aynı ad ikinci kez (yapışkan satırda) çizilmesin.
        const away = introHeight > 0 && event.nativeEvent.contentOffset.y >= introHeight - 8;
        setScrolledAway((current) => (current === away ? current : away));
      }}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.height);
        setViewport((current) => (current === next ? current : next));
      }}
    >
      <View
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.height);
          setIntroHeight((current) => (current === next ? current : next));
        }}
      >
        {intro}
      </View>
      <View collapsable={false} style={{ backgroundColor: colors.canvas, zIndex: 2 }}>
        <IntroScrolledAway.Provider value={scrolledAway}>{sticky}</IntroScrolledAway.Provider>
      </View>
      {/* İçerik en az bir ekran boyunda: kısa sekmelerde de kart tamamen kaydırılabilsin. */}
      <View className={contentClassName} style={[{ minHeight: viewport }, contentStyle]}>
        {children}
      </View>
    </ScrollView>
  );
}

/** Listenin yapışkan arama satırı gibi kalan tek satır: kısa ad. */
export function PinnedIdentity({
  title,
  leading,
  trailing,
  pad = SCREEN_PAD,
}: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  pad?: number;
}) {
  if (!useContext(IntroScrolledAway)) return null;
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={title}
      className="min-h-11 flex-row items-center gap-2.5 py-1"
      style={{ paddingHorizontal: pad }}
    >
      {leading}
      <Text className="min-w-0 flex-1 font-inter-semibold text-[16px] text-foreground" numberOfLines={1}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}
