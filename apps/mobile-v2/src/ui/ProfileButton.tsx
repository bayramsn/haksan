import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';
import { GlassNavigationControl } from './NavigationGlass';

/** Hesap seçenekleri üst gezinmeden açılır. */
export function ProfileButton() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <GlassNavigationControl>
      <Pressable accessibilityRole="button" accessibilityLabel="Profil ve hesap"
        onPress={() => router.push('/more')}
        className="h-11 w-11 items-center justify-center active:opacity-60">
        <Ionicons name="person-circle-outline" size={25} color={colors.foreground} />
      </Pressable>
    </GlassNavigationControl>
  );
}
