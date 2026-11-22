import { Image } from 'react-native';

/** Haksan Makina artwork with real alpha; no white backing or viewport mask. */
const LOGO = require('../../assets/brand/haksan-transparent.png');
export function Logo({ width = 120 }: { width?: number }) {
  return <Image source={LOGO} resizeMode="contain" accessibilityRole="image"
    accessibilityLabel="Haksan Makina — 1972’den bugüne" accessibilityIgnoresInvertColors
    style={{ width, height: width * 739 / 2127 }} />;
}
