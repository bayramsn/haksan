import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { useUnreadCount } from '@/src/api/notifications.hooks';
import { useChatUnreadCount } from '@/src/api/chat.hooks';

export default function TabsLayout() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const unreadNotifications = useUnreadCount();
  const unreadMessages = useChatUnreadCount();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Uygulama ikonu rozeti, uygulama içindeki iki okunmamış kaynağın toplamını
    // izler. Platform/launcher rozet desteklemiyorsa güvenle no-op olur.
    void Notifications.setBadgeCountAsync(unreadNotifications + unreadMessages).catch(() => undefined);
  }, [unreadMessages, unreadNotifications]);

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        // Mockup taban çubuğu: beyaz, ayraç yerine yalnız ince bir çizgi,
        // ikonlar 24pt ve etiketler 12pt.
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, paddingTop: 6, height: 88 },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 12 },
        tabBarIconStyle: { marginBottom: 2 },
        tabBarBadgeStyle: { backgroundColor: colors.primary, color: '#fff', fontSize: 10 },
      }}
      screenListeners={{
        // §5.2: sekme geçişi anında, geri bildirim dokunsal.
        tabPress: () => void Haptics.selectionAsync(),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ana Sayfa',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="companies"
        options={{
          title: 'Firmalar',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'business' : 'business-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="opportunities"
        options={{
          title: 'Fırsatlar',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'briefcase' : 'briefcase-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Takvim',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Daha Fazla',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'menu' : 'menu-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen name="modules" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
    </Tabs>
  );
}
