import { forwardRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import { can, useAuth } from '@/src/auth/AuthProvider';
import { chipClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';

export type QuickCreateOption = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: Tone;
  permission: string;
  pathname: string;
  params?: Record<string, string>;
};

/** Yetkisi olan seçenekler; hiçbiri yoksa başlıktaki "+" de gösterilmez. */
export function useAllowedOptions(options: QuickCreateOption[]): QuickCreateOption[] {
  const { user } = useAuth();
  return options.filter((option) => can(user, option.permission));
}

/**
 * Firma/fırsat detayındaki "+" menüsü: açılan form kaydın firma ve fırsat
 * bilgisiyle dolu gelir, kullanıcı yeniden seçmez.
 */
export const QuickCreateSheet = forwardRef<BottomSheetModal, { title: string; subtitle?: string; options: QuickCreateOption[] }>(
  function QuickCreateSheet({ title, subtitle, options }, ref) {
    const router = useRouter();
    const { colors } = useTheme();
    const allowed = useAllowedOptions(options);
    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-4 px-5 pb-10 pt-1">
          <View className="gap-0.5">
            <Text className="font-inter-semibold text-[17px] text-foreground">{title}</Text>
            {subtitle ? <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -5 }}>
            {allowed.map((option) => (
              <View key={option.key} className="w-1/2 p-[5px]">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    if (typeof ref !== 'function') ref?.current?.dismiss();
                    router.push({ pathname: option.pathname, params: option.params } as unknown as Href);
                  }}
                  className="min-h-[64px] flex-row items-center gap-3 rounded-surface border border-border bg-canvas px-3 active:opacity-70"
                >
                  <View className={`h-9 w-9 items-center justify-center rounded-control border ${chipClass[option.tone]}`}>
                    <Ionicons name={option.icon} size={18} color={toneColor(colors, option.tone)} />
                  </View>
                  <Text className="flex-1 font-inter-medium text-[14px] text-foreground" numberOfLines={2}>{option.label}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
