import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useBottomSheet, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

/**
 * Kütüphanenin BottomSheetBackdrop'u bu yığında (NativeWind + Reanimated 4) görünmüyordu:
 * `StyleSheet.absoluteFill` ve Animated.View stil dizileri `position: absolute`'u düşürüyor,
 * katman ekranın altına 0 yükseklikle yerleşiyordu (ölçüldü: y=874, h=0).
 * Sonuç: karartma yok, dışarı dokunuş alttaki ekrana geçiyor, menü sayfa değişince açık kalıyor.
 * Düz Pressable + tek StyleSheet nesnesi; karartma animasyonsuz (sayfa zaten kayarak geliyor).
 */
export function SheetBackdrop({ animatedIndex, opacity = 0.4 }: BottomSheetBackdropProps & { opacity?: number }) {
  const { close } = useBottomSheet();
  const [open, setOpen] = useState(false);
  useAnimatedReaction(() => animatedIndex.value > -1, (next, prev) => {
    if (next !== prev) runOnJS(setOpen)(next);
  });
  if (!open) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Menüyü kapat"
      style={[styles.fill, { backgroundColor: `rgba(0,0,0,${opacity})` }]}
      onPress={() => close()}
    />
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
