import type { ComponentType, ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

/**
 * Expo Router `presentation: 'modal' | 'formSheet'` iOS'ta ayrı UIWindow açar.
 * @gorhom/bottom-sheet portal'ı kök provider'da kalınca sheet native modalın
 * ARKASINDA çizilir (Hızlı Fırsat vb.). FullWindowOverlay sheet'i en üst
 * pencereye taşır — tüm BottomSheetModal'larda containerComponent olarak kullan.
 *
 * @see https://github.com/gorhom/react-native-bottom-sheet/issues/2322
 */
function SheetOverlayContainer({ children }: { children?: ReactNode }) {
  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{children}</FullWindowOverlay>;
  }
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{children}</View>;
}

export const sheetContainerComponent = SheetOverlayContainer as ComponentType<{ children?: ReactNode }>;
