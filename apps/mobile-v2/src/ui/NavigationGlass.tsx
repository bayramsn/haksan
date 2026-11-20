import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/src/theme/theme';
import { useReducedEffects } from '@/src/theme/glass-preference';

/** Android navigation material; iOS keeps its native system glass controls. */
export function NavigationGlass() {
  const { colors, scheme } = useTheme();
  const reducedEffects = useReducedEffects();
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (active) setReduceTransparency(value);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { active = false; subscription.remove(); };
  }, []);
  const supported = Platform.OS !== 'android' || Number(Platform.Version) >= 31;
  if (reducedEffects || reduceTransparency || !supported) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card }]} />;
  }
  return <BlurView pointerEvents="none" tint={scheme} intensity={48}
    experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
    style={[StyleSheet.absoluteFillObject, { backgroundColor: scheme === 'dark' ? 'rgba(24,24,30,0.72)' : 'rgba(255,255,255,0.72)' }]} />;
}
