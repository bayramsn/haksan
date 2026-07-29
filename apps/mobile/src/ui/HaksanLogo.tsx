import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

const LEGACY = Image.resolveAssetSource(require('../../assets/images/haksan-logo.png'));

type Props = {
  height?: number;
  style?: StyleProp<ImageStyle>;
};

/** Stitch #02 — header logo max-h 32px */
export function HaksanLogo({ height = 32, style }: Props) {
  const aspect = LEGACY.width / LEGACY.height;

  return (
    <Image
      source={LEGACY}
      style={[styles.logo, { height, width: height * aspect }, style]}
      resizeMode="contain"
      accessibilityLabel="Haksan Makina"
    />
  );
}

const styles = StyleSheet.create({
  logo: { maxWidth: 140 },
});
