import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Bulunamadı' }} />
      <View className="flex-1 items-center justify-center gap-3 bg-canvas p-6">
        <Text className="text-base font-inter-semibold text-foreground">Bu sayfa yok.</Text>
        <Link href="/(tabs)" className="text-sm font-inter-semibold text-accent">
          Panele dön
        </Link>
      </View>
    </>
  );
}
