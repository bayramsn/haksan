import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '@/src/theme/theme';

/**
 * Form stack: kök layout `containedModal` ile aynı UIWindow'da açılır.
 * Yine de yerel BottomSheetModalProvider + GestureHandlerRootView taşırız;
 * sheet'ler (SearchSelect / OptionPicker) formun üstünde kalır.
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
