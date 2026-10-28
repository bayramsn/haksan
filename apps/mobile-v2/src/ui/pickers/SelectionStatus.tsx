import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTheme } from '@/src/theme/theme';

/** Seçenekler önbellekte olsa da güncelleme/hata durumu görünür kalır. */
export function SelectionStatus({ loading, error, onRetry }: {
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  if (!loading && !error) return null;
  return (
    <View accessibilityLiveRegion="polite" className={`flex-row items-center gap-3 rounded-control border px-3 py-2 ${error ? 'border-destructive bg-destructive-soft' : 'border-border bg-muted'}`}>
      {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      <Text className={`min-w-0 flex-1 font-inter text-sm leading-5 ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
        {error ? 'Seçenekler yüklenemedi. Yeniden deneyin.' : 'Seçenekler yükleniyor…'}
      </Text>
      {error && onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} disabled={loading} className="min-h-11 justify-center px-2 active:opacity-70">
        <Text className="font-inter-semibold text-sm text-destructive">Yeniden dene</Text>
      </Pressable> : null}
    </View>
  );
}
