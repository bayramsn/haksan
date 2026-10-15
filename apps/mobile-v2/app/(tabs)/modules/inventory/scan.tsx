import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { inventoryApi } from '@/src/api/endpoints';
import { ApiError } from '@/src/api/client';
import { parseInventoryCode } from '@/src/native/inventory-code';
import { useTheme } from '@/src/theme/theme';
import { Button, DetailHeader, Loading } from '@/src/ui';

export default function InventoryScanScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastScan = useRef<{ value: string; at: number } | null>(null);

  async function onScan(result: BarcodeScanningResult) {
    if (busy) return;
    const serial = parseInventoryCode(result.data);
    if (!serial) {
      const previous = lastScan.current;
      if (!previous || previous.value !== result.data || Date.now() - previous.at > 2500) {
        lastScan.current = { value: result.data, at: Date.now() };
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Kod tanınmadı', 'QR veya barkod geçerli bir stok seri numarası içermiyor.');
      }
      return;
    }
    setBusy(true);
    try {
      const item = await inventoryApi.bySerial(serial);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/(tabs)/modules/inventory/${item.id}`);
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Stok bulunamadı',
        error instanceof ApiError && error.status === 404
          ? `${serial} seri numarasıyla eşleşen stok yok.`
          : error instanceof Error ? error.message : 'Stok sorgulanamadı.'
      );
      setBusy(false);
    }
  }

  if (!permission) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Seri No Tara" />
        <Loading />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Seri No Tara" />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Ionicons name="camera-outline" size={42} color={colors.mutedForeground} />
          <Text className="text-center font-inter text-sm leading-5 text-muted-foreground">
            Stok kartındaki QR veya barkodu taramak için kamera izni gerekir. Kamera yalnız bu ekran açıkken kullanılır.
          </Text>
          <Button label="Kamera İzni Ver" onPress={() => void requestPermission()} />
          {!permission.canAskAgain ? (
            <Button label="Ayarları Aç" variant="ghost" onPress={() => void Linking.openSettings()} />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top', 'left', 'right']}>
      <DetailHeader title="Seri No Tara" />
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
        onBarcodeScanned={busy ? undefined : (result) => void onScan(result)}
      >
        <View className="flex-1 items-center justify-between bg-black/20 px-6 py-10">
          <View className="rounded-full bg-black/60 px-4 py-2">
            <Text className="font-inter-medium text-sm text-white">Kodu çerçevenin içine hizalayın</Text>
          </View>
          <View className="h-60 w-full max-w-[320px] rounded-[28px] border-2 border-white/90" />
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Fener"
            accessibilityState={{ checked: torch }}
            onPress={() => setTorch((value) => !value)}
            className="h-12 min-w-12 flex-row items-center justify-center gap-2 rounded-full bg-black/70 px-4"
          >
            <Ionicons name={torch ? 'flash' : 'flash-off'} size={19} color="white" />
            <Text className="font-inter-medium text-sm text-white">{torch ? 'Fener açık' : 'Fener'}</Text>
          </Pressable>
        </View>
      </CameraView>
    </SafeAreaView>
  );
}
