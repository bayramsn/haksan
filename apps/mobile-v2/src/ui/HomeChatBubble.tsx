import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { canOpenChat } from '@/src/modules/catalog';
import { useChatUnreadCount } from '@/src/api/chat.hooks';
import { useTheme } from '@/src/theme/theme';
import { GlassNavigationControl } from './NavigationGlass';

/** Ana sayfa başlığında sohbet: önceden alt sağda yüzen düğmeydi ve Ajandam'ın üstüne biniyordu. */
function ChatButton() {
  const router = useRouter();
  const { colors } = useTheme();
  const unread = useChatUnreadCount();
  return (
    <GlassNavigationControl>
      <Pressable accessibilityRole="button" accessibilityLabel={unread > 0 ? `Sohbet, ${unread} okunmamış mesaj` : 'Sohbeti aç'}
        onPress={() => router.push('/chat')} className="h-11 w-11 items-center justify-center active:opacity-60">
        <Ionicons name="chatbubbles-outline" size={23} color={colors.foreground} />
        {unread > 0 ? <View className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" /> : null}
      </Pressable>
    </GlassNavigationControl>
  );
}

export function HomeChatButton() {
  const { tenant } = useAuth();
  return canOpenChat(tenant) ? <ChatButton /> : null;
}
