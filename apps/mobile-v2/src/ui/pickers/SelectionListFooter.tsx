import { Text, View } from 'react-native';
import { Button } from '@/src/ui';

/** A filtered/short page can never hide the way to the next server page. */
export function SelectionListFooter({ hasNextPage, isFetchingNextPage, error, fetchNextPage }: {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  error?: Error | null;
  fetchNextPage?: () => unknown;
}) {
  if (!hasNextPage && !isFetchingNextPage && !error) return null;
  return <View className="gap-2 py-3">
    {error ? <Text accessibilityLiveRegion="polite" className="font-inter text-[13px] text-destructive">Kayıtlar yüklenemedi. Yeniden deneyin.</Text> : null}
    {fetchNextPage && (hasNextPage || error) ? <Button variant="ghost" label={error ? 'Yeniden dene' : 'Daha fazla kayıt yükle'}
      loading={isFetchingNextPage} onPress={() => { if (!isFetchingNextPage) void fetchNextPage(); }} /> : null}
  </View>;
}
