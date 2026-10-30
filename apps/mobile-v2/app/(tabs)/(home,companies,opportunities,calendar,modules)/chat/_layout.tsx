import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Redirect, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '@/src/auth/AuthProvider';
import { canOpenChat } from '@/src/modules/catalog';

export default function ChatLayout() {
  const { tenant } = useAuth();
  if (!canOpenChat(tenant)) return <Redirect href="/more" />;
  // formSheet native katmanı kök BottomSheet provider'ın üstünde; sheet'ler
  // için yerel provider + pickers'taki FullWindowOverlay birlikte çalışır.
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <BottomSheetModalProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen
            name="new"
            options={{
              presentation: 'formSheet',
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.5, 0.9],
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="new-group"
            options={{
              presentation: 'formSheet',
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.9, 1],
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        </Stack>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
