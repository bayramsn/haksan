import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Bulunamadı' }} />
      <View className="flex-1 items-center justify-center gap-3 bg-canvas p-6">
        <Text className="text-base font-inter-semibold text-foreground">Bu sayfa yok.</Text>
        <Link href="/(tabs)/(home)" accessibilityLabel="Ana sayfaya dön" className="min-h-11 py-3 text-sm font-inter-semibold text-primary">
          Panele dön
        </Link>
      </View>
    </>
  );
}
