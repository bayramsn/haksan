import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/theme';
import { Ionicons } from '@expo/vector-icons';

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
  const { height, width } = useWindowDimensions();
  const wide = width >= 768;
  const panelHeight = Math.round(Math.min(height - insets.top - insets.bottom - 24, height * Math.min(0.92, Math.max(0.4, heightRatio))));

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className={`flex-1 ${wide ? 'items-center justify-center' : 'justify-end'}`} style={{ backgroundColor: 'rgba(13,20,44,0.48)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={onClose} className="absolute inset-0" />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          className={`overflow-hidden border border-border ${wide ? 'rounded-[24px]' : 'rounded-t-[24px]'}`}
          style={{
            width: wide ? Math.min(width - 48, 600) : '100%',
            height: panelHeight,
            flexShrink: 1,
            backgroundColor: colors.card,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <View className="h-12 flex-row items-center justify-center px-3">
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="h-1 w-10 rounded-full" style={{ backgroundColor: colors.border }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Seçim panelini kapat" onPress={onClose} className="absolute right-2 h-11 w-11 items-center justify-center rounded-full active:bg-muted">
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View className="min-h-0 flex-1">{open ? children : null}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
