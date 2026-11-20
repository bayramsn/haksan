import { Pressable, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { childPages } from '@/src/modules/catalog';
import { SCREEN_PAD, useTheme } from '@/src/theme/theme';

/**
 * Web menüsünde kendi satırı olmayan alt sayfalar, webdeki gibi ana sayfanın
 * içinden açılır (ör. Ödemeler & Kasa → Tahsilatlar). Yetki yoksa hiç görünmez.
 */
export function SubPageLinks({ parent }: { parent: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, tenant } = useAuth();
  const pages = childPages(parent, user, tenant);
  if (!pages.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 8, paddingBottom: 8 }}>
      {pages.map((page) => (
        <Pressable
          key={page.key}
          accessibilityRole="link"
          accessibilityLabel={page.title}
          onPress={() => router.push(page.route)}
          className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3.5 active:opacity-70"
        >
          <Ionicons name={page.icon} size={16} color={colors.foreground} />
          <Text className="font-inter-medium text-[13px] text-foreground">{page.title}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
