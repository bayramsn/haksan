import { Stack } from 'expo-router';

export default function ChatLayout() {
  // Başlıklar ekranların kendi çubuklarında (DetailHeader); native header kapalı.
  return (
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
  );
}
