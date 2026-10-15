import { Stack } from 'expo-router';
import { useTheme } from '@/src/theme/theme';

export default function ModalLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
      }}
    />
  );
}
