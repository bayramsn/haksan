import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { useReducedEffects } from '@/src/theme/glass-preference';
import { useUnreadCount } from '@/src/api/notifications.hooks';
import { useChatUnreadCount } from '@/src/api/chat.hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationGlass } from '@/src/ui/NavigationGlass';
import { androidSceneBottom } from '@/src/auth/layout';

/**
 * Sistem sekme çubuğu: iOS 26'da liquid glass, eski iOS'ta sistem bulanıklığı,
 * Android'de Material. "Saydamlığı Azalt" erişilebilirlik ayarını sistem uygular;
 * uygulama içindeki "Gezinme efektlerini azalt" çubuğu opak yapar.
 */
export default function TabsLayout() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const reducedEffects = useReducedEffects();
  const unreadNotifications = useUnreadCount();
  const unreadMessages = useChatUnreadCount();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Uygulama ikonu rozeti, uygulama içindeki iki okunmamış kaynağın toplamını
    // izler. Platform/launcher rozet desteklemiyorsa güvenle no-op olur.
    void Notifications.setBadgeCountAsync(unreadNotifications + unreadMessages).catch(() => undefined);
  }, [unreadMessages, unreadNotifications]);

  if (!user) return <Redirect href="/(auth)/login" />;

  if (Platform.OS === 'android') {
    const height = 60 + Math.max(insets.bottom, 8);
    return <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.mutedForeground,
      tabBarHideOnKeyboard: true,
      tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
      tabBarStyle: { position: 'absolute', height, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8),
        backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
      tabBarBackground: () => <NavigationGlass />,
      sceneStyle: { paddingBottom: androidSceneBottom(height, keyboardVisible), backgroundColor: colors.canvas },
    }}>
      <Tabs.Screen name="(today)" options={{ title: 'Bugün', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="(work)" options={{ title: 'İşler', tabBarIcon: ({ color, size }) => <Ionicons name="briefcase-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="(calendar)" options={{ title: 'Takvim', tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="(modules)" options={{ title: 'Modüller', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="(more)" options={{ title: 'Hesap', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} /> }} />
    </Tabs>;
  }

  return (
    <NativeTabs
      tintColor={colors.primary}
      iconColor={{ default: colors.mutedForeground, selected: colors.primary }}
      labelStyle={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: colors.mutedForeground }}
      backgroundColor={reducedEffects ? colors.card : null}
      disableTransparentOnScrollEdge={reducedEffects}
      indicatorColor={colors.secondary}
      rippleColor={colors.muted}
    >
      <NativeTabs.Trigger name="(today)">
        <Label>Bugün</Label>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} androidSrc={<VectorIcon family={Ionicons} name="home-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(work)">
        <Label>İşler</Label>
        <Icon sf={{ default: 'briefcase', selected: 'briefcase.fill' }} androidSrc={<VectorIcon family={Ionicons} name="briefcase-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(calendar)">
        <Label>Takvim</Label>
        <Icon sf="calendar" androidSrc={<VectorIcon family={Ionicons} name="calendar-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(modules)">
        <Label>Modüller</Label>
        <Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} androidSrc={<VectorIcon family={Ionicons} name="grid-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(more)">
        <Label>Hesap</Label>
        <Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} androidSrc={<VectorIcon family={Ionicons} name="person-circle-outline" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
