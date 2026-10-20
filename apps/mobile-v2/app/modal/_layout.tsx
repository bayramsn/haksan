import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '@/src/theme/theme';

/**
 * Expo Router `presentation: 'modal'` native katmanı, kök
 * BottomSheetModalProvider'ın ÜSTÜNDE çizilir. Sheet'ler için:
 * 1) Bu layout kendi provider + GestureHandlerRootView taşır
 * 2) Pickers `sheetContainerComponent` (iOS FullWindowOverlay) kullanır
 * Böylece SearchSelect / OptionPicker modalın üstünde açılır.
 */
export default function ModalLayout() {
  const { colors } = useTheme();
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <BottomSheetModalProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.foreground,
            headerShadowVisible: false,
          }}
        />
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
