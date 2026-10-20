import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';
import { useTheme } from '@/src/theme/theme';

/**
 * Expo Router `presentation: 'modal'` native katmanı, kök
 * BottomSheetModalProvider'ın ÜSTÜNDE çizilir. SearchSelect / OptionPicker
 * sheet'leri köke portal olunca Hızlı Fırsat vb. formların ARKASINDA kalıyordu.
 * Bu layout kendi provider'ını taşır; sheet'ler modalın üstünde açılır.
 */
export default function ModalLayout() {
  const { colors } = useTheme();
  return (
    <BottomSheetModalProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
        }}
      />
    </BottomSheetModalProvider>
  );
}
