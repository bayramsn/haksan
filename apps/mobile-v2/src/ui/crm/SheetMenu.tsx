import { forwardRef } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/theme';

export type SheetMenuItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  selected?: boolean;
  hint?: string;
};

/** İşlem/sıralama menüsü: web DropdownMenu/Select karşılığı. Seçimden sonra kapanır. */
export const SheetMenu = forwardRef<BottomSheetModal, { title: string; subtitle?: string; items: SheetMenuItem[] }>(
  function SheetMenu({ title, subtitle, items }, ref) {
    const { colors } = useTheme();
    const { height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const dismiss = () => (ref && typeof ref === 'object' ? ref.current?.dismiss() : undefined);
    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        maxDynamicContentSize={Math.max(160, height - insets.top - 24)}
        backgroundStyle={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
        handleIndicatorStyle={{ backgroundColor: colors.border, width: 40 }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
          <Text accessibilityRole="header" className="px-2 font-display-semibold text-[22px] text-foreground" numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text className="px-2 pb-2 font-inter text-sm leading-5 text-muted-foreground">{subtitle}</Text> : null}
          {items.map((item) => {
            const tint = item.destructive ? colors.destructive : item.selected ? colors.primary : colors.foreground;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ disabled: item.disabled, selected: item.selected }}
                accessibilityHint={item.hint}
                disabled={item.disabled}
                onPress={() => {
                  dismiss();
                  item.onPress();
                }}
                className={`min-h-14 flex-row items-center gap-3 rounded-surface px-3 py-2 ${item.selected ? 'bg-primary-soft' : item.destructive ? 'bg-destructive-soft' : 'bg-muted'} ${item.destructive ? 'active:bg-destructive-soft' : 'active:opacity-70'} ${item.disabled ? 'opacity-40' : ''}`}
              >
                {item.icon ? <View className="h-9 w-9 items-center justify-center rounded-lg bg-card"><Ionicons name={item.icon} size={20} color={tint} /></View> : null}
                <Text
                  className={`flex-1 font-inter-medium text-base ${item.destructive ? 'text-destructive' : item.selected ? 'text-primary' : 'text-foreground'}`}
                >
                  {item.label}
                </Text>
                {item.selected ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
