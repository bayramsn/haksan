import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { ScreenAccess } from '@/src/modules/ModuleAccess';
import { useTheme } from '@/src/theme/theme';
import { Logo } from '@/src/ui/Logo';
import { NavigationGlass } from '@/src/ui/NavigationGlass';
import { useReducedEffects } from '@/src/theme/glass-preference';

/**
 * Her sekmenin kendi yığını. Kayıt ekranları (modules/*, chat, bildirimler) bu
 * paylaşılan klasörde olduğu için her sekmede ayrı ayrı vardır; Expo Router
 * grup öneki verilmemiş bir href'i açık sekmenin grubunda çözer. Böylece
 * Bugün'den açılan görev Bugün sekmesinde kalır, geri tuşu da oraya döner.
 */
const TAB_ROOTS = { today: 'index', work: 'work', calendar: 'calendar', modules: 'modules/index', more: 'more/index' } as const;

export const unstable_settings = Object.fromEntries(
  Object.entries(TAB_ROOTS).map(([group, anchor]) => [group, { anchor }]),
);

/** `segment` paylaşılan yerleşimin hangi sekme grubunda çalıştığını söyler, ör. "(work)". */
export default function TabStackLayout({ segment }: { segment: string }) {
  const root = TAB_ROOTS[segment.replace(/[()]/g, '') as keyof typeof TAB_ROOTS];
  const { colors } = useTheme();
  const reducedEffects = useReducedEffects();
  return (
    <Stack
      // Yetki her ekranın kendi rotasıyla denetlenir; reddedilen ekran sorgu başlatmaz.
      screenLayout={({ children, route, navigation }) => (
        <ScreenAccess routeName={route.name} onBack={() => (navigation.canGoBack() ? navigation.goBack() : router.navigate('/modules'))}>
          {children}
        </ScreenAccess>
      )}
      screenOptions={({ navigation, route }) => ({
        // Ekranlar başlığı ScreenHeader / DetailHeader ile kendisi açar.
        headerShown: false,
        // Sekme kökünde geri tuşu yok; yerini marka logosu alır.
        headerLeft: navigation.getState()?.routes[0]?.key === route.key ? () => <Logo width={112} /> : undefined,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, color: colors.foreground },
        // Saydam arka plan içeriği başlığın altına uzatıyor; ekranlardaki SafeAreaView
        // payı ikinci kez eklenip başlıkla içerik arasında boşluk bırakıyordu.
        // Düğmeler iOS 26'da yine liquid glass.
        headerStyle: { backgroundColor: reducedEffects ? colors.card : colors.canvas },
        headerBackground: Platform.OS === 'android' ? () => <NavigationGlass /> : undefined,
        contentStyle: { backgroundColor: colors.canvas },
        animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
      })}
    >
      {/* Açıkça tanımlanan ekranlar sıranın başına geçer ve yığın ilkini kök yapar;
          kök ekran bu yüzden sohbet sayfalarından önce tanımlanmalı. */}
      {root ? <Stack.Screen name={root} /> : null}
      <Stack.Screen
        name="chat/new"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.5, 0.9],
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="chat/new-group"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.9, 1],
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
