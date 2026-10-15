import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { chipClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';

/**
 * Hafif bildirim şeridi: başarılar Alert ile değil buradan duyurulur (akış
 * kesilmez). Aynı anda tek mesaj gösterilir; yenisi eskisinin yerine geçer.
 * Hatalar için de kullanılabilir; ayrıntı gerektiren hatalar hâlâ Alert'te.
 */

type ToastTone = Extract<Tone, 'success' | 'destructive' | 'info' | 'warning'>;

type ToastData = { id: number; tone: ToastTone; message: string };

let push: ((tone: ToastTone, message: string) => void) | null = null;

export const toast = {
  success: (message: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    push?.('success', message);
  },
  error: (message: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    push?.('destructive', message);
  },
  info: (message: string) => push?.('info', message),
};

const ICONS: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  destructive: 'alert-circle',
  info: 'information-circle',
  warning: 'warning',
};

const VISIBLE_MS = 2400;
const IN_MS = 180;
const OUT_MS = 140;

export function Toaster() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastData | null>(null);

  useEffect(() => {
    push = (tone, message) => setCurrent({ id: Date.now(), tone, message });
    return () => {
      push = null;
    };
  }, []);

  return (
    <View pointerEvents="none" className="absolute left-0 right-0 z-50" style={{ top: insets.top + 8 }}>
      {current ? <ToastCard key={current.id} data={current} onDone={() => setCurrent(null)} /> : null}
    </View>
  );
}

function ToastCard({ data, onDone }: { data: ToastData; onDone: () => void }) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(onDone, VISIBLE_MS + IN_MS);
    progress.value = withTiming(1, { duration: IN_MS, easing: Easing.out(Easing.cubic) });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id]);

  // Çıkış: son 140 ms'de yukarı kayar ve söner.
  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -16 }],
  }));

  useEffect(() => {
    const exit = setTimeout(() => {
      progress.value = withTiming(0, { duration: OUT_MS, easing: Easing.in(Easing.cubic) });
    }, VISIBLE_MS);
    return () => clearTimeout(exit);
  }, [progress]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[animated, { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8 }]}
      className="mx-4 flex-row items-center gap-2.5 rounded-surface border border-border bg-card px-3.5 py-3"
    >
      <View className={`h-8 w-8 items-center justify-center rounded-full ${chipClass[data.tone]}`}>
        <Ionicons name={ICONS[data.tone]} size={17} color={toneColor(colors, data.tone)} />
      </View>
      <Text className="flex-1 font-inter-medium text-[13px] leading-[1.35] text-foreground" numberOfLines={2}>
        {data.message}
      </Text>
    </Animated.View>
  );
}
