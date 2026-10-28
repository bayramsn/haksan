import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { Redirect, Tabs, useRouter, useSegments } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/src/auth/AuthProvider';
import { useCanAccessModule } from '@/src/modules/useModuleAccess';
import { useTheme } from '@/src/theme/theme';
import { useReducedEffects } from '@/src/theme/glass-preference';
import { useUnreadCount } from '@/src/api/notifications.hooks';
import { useChatUnreadCount } from '@/src/api/chat.hooks';
import { NavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { navigationBottomInset } from '@/src/ui/navigation-inset';
import { NavigationGlass } from '@/src/ui/NavigationGlass';

const ITEMS = [
  { key: 'home', label: 'Ana Sayfa', icon: 'home', sf: 'house' },
  { key: 'companies', label: 'Firmalar', icon: 'business', sf: 'building.2' },
  { key: 'opportunities', label: 'Fırsatlar', icon: 'briefcase', sf: 'briefcase' },
  { key: 'calendar', label: 'Takvim', icon: 'calendar', sf: 'calendar' },
  { key: 'modules', label: 'Modüller', icon: 'grid', sf: 'square.grid.2x2' },
] as const;

export default function TabsLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const segments = useSegments() as string[];
  const companies = useCanAccessModule('companies');
  const opportunities = useCanAccessModule('opportunities');
  const calendar = useCanAccessModule('calendar');
  const visible: Record<string, boolean> = { home: true, companies, opportunities, calendar, modules: true };
  const { colors } = useTheme();
  const reduced = useReducedEffects();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const bottom = navigationBottomInset({ platform: Platform.OS, version: Number.parseInt(String(Platform.Version), 10), bottom: insets.bottom, landscape: width > windowHeight });
  const unread = useUnreadCount() + useChatUnreadCount();
  const group = segments[1]?.replace(/[()]/g, '');
  useEffect(() => {
    if (Platform.OS !== 'web') void Notifications.setBadgeCountAsync(unread).catch(() => undefined);
  }, [unread]);
  useEffect(() => {
    if (user && group && visible[group] === false) router.replace('/(tabs)/(home)' as never);
  }, [user, group, companies, opportunities, calendar]);
  if (!user) return <Redirect href="/(auth)/login" />;
  if (group && visible[group] === false) return <Redirect href={'/(tabs)/(home)' as never} />;
  if (Platform.OS === 'ios') return (
    <NavigationBottomInset.Provider value={bottom}><NativeTabs tintColor={colors.primary} iconColor={{ default: colors.mutedForeground, selected: colors.primary }}
      labelStyle={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: colors.mutedForeground }}
      backgroundColor={reduced ? colors.card : null} disableTransparentOnScrollEdge={reduced}>
      {ITEMS.map((item) => <NativeTabs.Trigger key={item.key} name={`(${item.key})`} hidden={!visible[item.key]}>
        <Label>{item.label}</Label>
        <Icon sf={{ default: item.sf, selected: item.sf === 'calendar' ? 'calendar' : `${item.sf}.fill` } as never} />
      </NativeTabs.Trigger>)}
    </NativeTabs></NavigationBottomInset.Provider>
  );
  const height = 60 + Math.max(insets.bottom, 8);
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.mutedForeground, tabBarHideOnKeyboard: true,
    tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
    tabBarStyle: { height, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
    tabBarBackground: () => <NavigationGlass />, sceneStyle: { backgroundColor: colors.canvas },
  }} screenListeners={{ tabPress: () => { void Haptics.selectionAsync(); } }}>
    {ITEMS.map((item) => <Tabs.Screen key={item.key} name={`(${item.key})`} options={{ title: item.label,
      href: visible[item.key] ? undefined : null,
      tabBarIcon: ({ color, size, focused }) => <Ionicons name={(focused ? item.icon : `${item.icon}-outline`) as never} size={size} color={color} />,
    }} />)}
  </Tabs>;
}
