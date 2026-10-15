import { Image } from 'react-native';

/**
 * Marka kilidi: açılı "H" işareti + "Haksan" (kırmızı) / "Makina" (koyu) ve
 * sağ altta "ERP". Mockup kataloğundan çıkarılan asıl işaret; kodla yeniden
 * çizilmiyor çünkü "H" özel bir glif.
 */
const LOGO = require('../../assets/brand/logo.png');
const RATIO = 411 / 97;

export function Logo({ width = 150 }: { width?: number }) {
  return (
    <Image
      source={LOGO}
      accessibilityLabel="Haksan Makina ERP"
      resizeMode="contain"
      style={{ width, height: width / RATIO }}
    />
  );
}
