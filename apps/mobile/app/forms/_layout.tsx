import { Stack } from 'expo-router';
import { colors } from '@/src/theme/tokens';

/** Form ekranları FormPageLayout ile kendi header'ını kullanır */
export default function FormsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        presentation: 'card',
      }}
    />
  );
}
