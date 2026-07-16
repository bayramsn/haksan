import { Stack } from 'expo-router';
import { colors, fonts } from '@/src/theme/tokens';

export default function ModuleKeyLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
