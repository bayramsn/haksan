import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mediaUrl } from '@/src/api/config';
import { useTheme } from '@/src/theme/theme';

/** Web `ProductThumb`: ürün görseli, yoksa kutu ikonu. `imageUrl` göreli gelir. */
export function ProductThumb({
  imageUrl,
  label,
  size = 46,
  icon = 'cube-outline',
}: {
  imageUrl: string | null | undefined;
  label: string;
  size?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const uri = mediaUrl(imageUrl ?? null);
  return (
    <View
      className="items-center justify-center overflow-hidden rounded-[12px] border border-border bg-card-subtle"
      style={{ width: size, height: size }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size - 4, height: size - 4 }}
          resizeMode="contain"
          accessibilityLabel={label}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name={icon} size={Math.round(size * 0.45)} color={colors.mutedForeground} />
      )}
    </View>
  );
}
