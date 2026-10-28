import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { canOpenChat } from '@/src/modules/catalog';
import { useChatUnreadCount } from '@/src/api/chat.hooks';
import { useTheme } from '@/src/theme/theme';
import { useNavigationBottomInset } from './LiquidGlassTabBarBackground';

function ChatBubble() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const { colors } = useTheme();
  const unread = useChatUnreadCount();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={unread > 0 ? `Sohbet, ${unread} okunmamış mesaj` : 'Sohbeti aç'}
      onPress={() => router.push('/chat')}
      style={{ bottom: GLASS_TAB_BAR_HEIGHT + 12, backgroundColor: colors.primary,
        boxShadow: '0 4px 16px rgba(13,20,68,0.18)' }}
      className="absolute right-5 h-14 flex-row items-center justify-center gap-2 rounded-full px-5 active:opacity-80">
      <Ionicons name="chatbubbles-outline" size={24} color={colors.primaryForeground} />
      <Text className="font-inter-semibold text-[14px] text-primary-foreground">Sohbet</Text>
      {unread > 0 ? <View className="min-w-5 items-center rounded-full bg-card px-1.5 py-0.5">
        <Text className="font-inter-semibold text-[11px] text-primary">{unread > 99 ? '99+' : unread}</Text>
      </View> : null}
    </Pressable>
  );
}

export function HomeChatBubble() {
  const { tenant } = useAuth();
  return canOpenChat(tenant) ? <ChatBubble /> : null;
}
