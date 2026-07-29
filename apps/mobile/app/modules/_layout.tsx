import { Stack } from 'expo-router';
import { colors } from '@/src/theme/tokens';

/** Modül ekranları kendi PageHeader'ını kullanır */
export default function ModulesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
