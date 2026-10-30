import { Image, View } from 'react-native';

/** User-supplied original artwork. A viewport trims only the surrounding white margin. */
const LOGO = require('../../assets/brand/haksan-original.jpeg');
const SOURCE_SIZE = 447;
const CONTENT_TOP = 130;
const CONTENT_HEIGHT = 160;

export function Logo({ width = 120 }: { width?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Haksan Makina — 1972’den bugüne"
      style={{ width, height: width * CONTENT_HEIGHT / SOURCE_SIZE, overflow: 'hidden', backgroundColor: '#fff', borderRadius: 3 }}>
      <Image source={LOGO} accessible={false} resizeMode="contain"
        style={{ width, height: width, position: 'absolute', top: -width * CONTENT_TOP / SOURCE_SIZE }} />
    </View>
  );
}
