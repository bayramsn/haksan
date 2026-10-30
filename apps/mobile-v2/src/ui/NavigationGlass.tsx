import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { BlurViewProps } from 'expo-blur';
import type { GlassViewProps } from 'expo-glass-effect';
import { useTheme } from '@/src/theme/theme';
import { useReducedEffects } from '@/src/theme/glass-preference';
import { resolveNavigationMaterial } from '@/src/theme/navigation-material';

/** Desktop NavigationGlass malzemesi; mevcut mobil rotalarla da kullanılabilir. */
type GlassModule = {
  GlassView: ComponentType<GlassViewProps>;
  isGlassEffectAPIAvailable: () => boolean;
  isLiquidGlassAvailable: () => boolean;
};

function loadGlass(): GlassModule | null {
  if (Platform.OS !== 'ios' || !requireOptionalNativeModule('ExpoGlassEffect')) return null;
  try { return require('expo-glass-effect') as GlassModule; } catch { return null; }
}
function loadBlur(): ComponentType<BlurViewProps> | null {
  if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoBlurView')) return null;
  try { return (require('expo-blur') as { BlurView: ComponentType<BlurViewProps> }).BlurView; } catch { return null; }
}
const glass = loadGlass();
const BlurView = loadBlur();
function glassAvailable() {
  try { return Boolean(glass?.isGlassEffectAPIAvailable() && glass?.isLiquidGlassAvailable()); } catch { return false; }
}

export function NavigationGlass() {
  const { colors, scheme } = useTheme();
  const reducedEffects = useReducedEffects();
  // Sistem tercihi okunmadan saydamlık açılmaz.
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    if (Platform.OS === 'web') { setReduceTransparency(false); return; }
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (active) setReduceTransparency(value);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { active = false; subscription.remove(); };
  }, []);
  const material = resolveNavigationMaterial({
    platform: Platform.OS, version: Platform.Version,
    reducedEffects, reduceTransparency, glassAvailable: glassAvailable(), blurAvailable: Boolean(BlurView),
  });
  if (material === 'glass' && glass) {
    const GlassView = glass.GlassView;
    return <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme={scheme} style={StyleSheet.absoluteFill} />;
  }
  if (material === 'blur' && BlurView) {
    return <BlurView pointerEvents="none" tint={scheme} intensity={48}
      experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? 'rgba(24,24,30,0.72)' : 'rgba(255,255,255,0.72)' }]} />;
  }
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />;
}

/** Sistem glass başlık düğmelerinin mevcut özel başlıklardaki karşılığı. */
export function GlassNavigationControl({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.control, { borderColor: colors.border }, style]}>
    <NavigationGlass />
    {children}
  </View>;
}
const styles = StyleSheet.create({
  control: { width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
});
