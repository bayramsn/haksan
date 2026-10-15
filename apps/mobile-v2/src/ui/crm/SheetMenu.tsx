import { forwardRef } from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
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
    const dismiss = () => (ref && typeof ref === 'object' ? ref.current?.dismiss() : undefined);
    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-1 px-5 pb-10 pt-1">
          <Text accessibilityRole="header" className="font-inter-semibold text-base text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text className="pb-1 font-inter text-xs text-muted-foreground">{subtitle}</Text> : null}
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
                className={`min-h-12 flex-row items-center gap-3 rounded-control px-2 ${item.destructive ? 'active:bg-destructive-soft' : 'active:bg-muted'} ${item.disabled ? 'opacity-40' : ''}`}
              >
                {item.icon ? <Ionicons name={item.icon} size={20} color={tint} /> : null}
                <Text
                  className={`flex-1 font-inter-medium text-base ${item.destructive ? 'text-destructive' : item.selected ? 'text-primary' : 'text-foreground'}`}
                >
                  {item.label}
                </Text>
                {item.selected ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
