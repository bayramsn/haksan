import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/src/theme/theme';

/** Public şikayet linki için SVG QR; paylaşım URL'sini doğrudan kodlar. */
export function ComplaintQr({ value, size = 200 }: { value: string; size?: number }) {
  const { colors } = useTheme();
  if (!value.trim()) return null;
  return (
    <View className="items-center self-center rounded-control bg-card p-3" accessibilityLabel="Şikayet formu QR kodu">
      <QRCode value={value} size={size} backgroundColor={colors.card} color={colors.foreground} ecl="M" />
    </View>
  );
}
