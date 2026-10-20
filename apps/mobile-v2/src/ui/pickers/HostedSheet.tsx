import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/theme';

export type SheetHandle = { present: () => void; dismiss: () => void };

/** Eski BottomSheetModal ref API'sini (present/dismiss) HostedSheet open state'ine bağlar. */
export function useSheetHandle(sheetRef: RefObject<SheetHandle | null>, onDismissExtra?: () => void) {
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    sheetRef.current = {
      present: () => setOpen(true),
      dismiss: () => {
        onDismissExtra?.();
        setOpen(false);
      },
    };
    return () => {
      sheetRef.current = null;
    };
  });
  return {
    open,
    close: () => {
      onDismissExtra?.();
      setOpen(false);
    },
  };
}

/**
 * Form picker sheet'i — @gorhom/bottom-sheet DEĞİL.
 *
 * Expo Router `presentation: 'modal' | 'containedModal' | 'formSheet'` native
 * katmanı, gorhom portal host'unun üstünde/altında bozuluyor (arkada açılma
 * veya FlatList'in başlığın üzerine binmesi). RN Modal her zaman native
 * ekranın üstünde yeni bir pencere açar; Hızlı Fırsat vb. formlarda güvenli.
 */
export function HostedSheet({
  open,
  onClose,
  heightRatio = 0.72,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** 0–1 arası panel yüksekliği. */
  heightRatio?: number;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const panelHeight = Math.round(height * Math.min(0.92, Math.max(0.4, heightRatio)));

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={onClose} className="flex-1" />
        <View
          className="overflow-hidden rounded-t-[20px] border-t border-border"
          style={{
            height: panelHeight,
            backgroundColor: colors.card,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <View className="items-center py-2.5">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: colors.mutedForeground, opacity: 0.45 }} />
          </View>
          <View className="min-h-0 flex-1">{children}</View>
        </View>
      </View>
    </Modal>
  );
}
