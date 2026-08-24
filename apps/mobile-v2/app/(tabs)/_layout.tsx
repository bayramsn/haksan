import { useEffect } from 'react';
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
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        tabBarBadgeStyle: { backgroundColor: colors.destructive, color: '#fff', fontSize: 10 },
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
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="modules"
        options={{
          title: 'Modüller',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Bildirimler',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color} size={size} />,
          tabBarBadge: unreadNotifications > 0 ? unreadNotifications : undefined,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Sohbet',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" color={color} size={size} />,
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Daha Fazla',
          tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
