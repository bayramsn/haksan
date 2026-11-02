import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { accessTokenSnapshot, subscribeAccessToken } from '@/src/api/client';
import { mediaUrl } from '@/src/api/config';
import type { TradeFairPhoto } from '@/src/api/trade-fairs.api';
import { useTradeFairPhotos } from '@/src/api/trade-fairs.hooks';
import { activeScope } from '@/src/auth/scope';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, ListSkeleton, Loading, SCREEN_PAD } from '@/src/ui';
import { filePreviewPath, tradeFairPhotoKey } from './tradeFairLogic';

/** `/files/:id/preview` Bearer ister; RN Image başlıkları iOS/Android'de iletir. */
function previewSource(fileId: string, token: string | null) {
  const scope = activeScope();
  return {
    uri: mediaUrl(filePreviewPath(fileId)) ?? '',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Active-Division': scope.divisionId ?? 'all',
      'X-Active-Department': scope.departmentId ?? 'all',
    },
  };
}

/** Yenilenen token ile kaynak yeniden kurulur; 401 kalıcı hata olarak takılmaz. */
function useAccessToken() {
  const [token, setToken] = useState(accessTokenSnapshot);
  useEffect(() => {
    const unsubscribe = subscribeAccessToken(setToken);
    return () => { unsubscribe(); };
  }, []);
  return token;
}

/**
 * Yükleme durumu dosya + token + deneme anahtarlı iç bileşende tutulur:
 * FlashList hücreyi başka fotoğrafa verdiğinde eski hata/yüklendi durumu taşınmaz.
 */
function Photo({ fileId, alt, contain }: { fileId: string; alt: string; contain?: boolean }) {
  const token = useAccessToken();
  const [attempt, setAttempt] = useState(0);
  return (
    <PhotoImage
      key={`${fileId}|${token ?? ''}|${attempt}`}
      fileId={fileId}
      token={token}
      alt={alt}
      contain={contain}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function PhotoImage({ fileId, token, alt, contain, onRetry }: { fileId: string; token: string | null; alt: string; contain?: boolean; onRetry: () => void }) {
  const { colors } = useTheme();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  if (state === 'failed') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${alt} açılamadı, tekrar dene`}
        onPress={onRetry}
        className="flex-1 items-center justify-center gap-1 px-3 active:opacity-60"
      >
        <Ionicons name="refresh" size={18} color={contain ? '#fff' : colors.mutedForeground} />
        <Text className={`text-center font-inter text-xs ${contain ? 'text-slate-300' : 'text-muted-foreground'}`}>Fotoğraf açılamadı · Tekrar dene</Text>
      </Pressable>
    );
  }
  return (
    <View className="flex-1">
      <Image
        source={previewSource(fileId, token)}
        accessibilityLabel={alt}
        accessibilityIgnoresInvertColors
        resizeMode={contain ? 'contain' : 'cover'}
        style={{ width: '100%', height: '100%' }}
        onLoad={() => setState('ready')}
        onError={() => setState('failed')}
      />
      {state === 'loading' ? (
        <View className="absolute inset-0 items-center justify-center" accessibilityLabel="Fotoğraf yükleniyor">
          <ActivityIndicator color={contain ? '#fff' : colors.mutedForeground} />
        </View>
      ) : null}
    </View>
  );
}

function PhotoViewer({
  photos,
  index,
  total,
  loadingMore,
  onIndex,
  onLoadMore,
  onClose,
}: {
  photos: TradeFairPhoto[];
  index: number | null;
  total: number;
  loadingMore: boolean;
  onIndex: (next: number) => void;
  onLoadMore: () => void;
  onClose: () => void;
}) {
  const selected = index === null ? null : photos[index] ?? null;
  const atEnd = index !== null && index >= photos.length - 1;
  const next = () => {
    if (index === null) return;
    if (!atEnd) onIndex(index + 1);
    else if (photos.length < total && !loadingMore) onLoadMore();
  };
  return (
    <Modal visible={Boolean(selected)} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#020617' }}>
        {selected ? (
          <>
            <View className="flex-row items-center gap-2 px-4 py-2">
              <View className="flex-1">
                <Text className="font-inter-semibold text-sm text-white" numberOfLines={1}>{selected.filename}</Text>
                <Text className="font-inter text-xs text-slate-300" numberOfLines={1}>
                  {selected.fairName} · {selected.companyName} · {selected.contactName}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Fotoğrafı kapat" onPress={onClose} className="h-11 w-11 items-center justify-center active:opacity-60">
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>
            <View className="flex-1">
              <Photo key={tradeFairPhotoKey(selected)} fileId={selected.fileId} alt={selected.filename} contain />
            </View>
            <View className="flex-row items-center justify-between gap-2 px-4 py-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Önceki fotoğraf"
                accessibilityState={{ disabled: index === 0 }}
                disabled={index === 0}
                onPress={() => index !== null && onIndex(index - 1)}
                className={`min-h-11 flex-row items-center gap-1 px-2 active:opacity-60 ${index === 0 ? 'opacity-40' : ''}`}
              >
                <Ionicons name="chevron-back" size={18} color="#fff" />
                <Text className="font-inter-medium text-sm text-white">Önceki</Text>
              </Pressable>
              <Text className="font-inter text-xs text-slate-300">{(index ?? 0) + 1} / {total}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sonraki fotoğraf"
                accessibilityState={{ disabled: loadingMore || (atEnd && photos.length >= total) }}
                disabled={loadingMore || (atEnd && photos.length >= total)}
                onPress={next}
                className={`min-h-11 flex-row items-center gap-1 px-2 active:opacity-60 ${atEnd && photos.length >= total ? 'opacity-40' : ''}`}
              >
                <Text className="font-inter-medium text-sm text-white">{loadingMore ? 'Yükleniyor' : 'Sonraki'}</Text>
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </Pressable>
            </View>
          </>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

/** Web TradeFairPhotoGallery: görüşmelere bağlı fotoğraflar, fuar ve aramaya göre. */
export function TradeFairPhotoGallery({ fairName, q, bottomInset }: { fairName: string | null; q: string; bottomInset: number }) {
  const photos = useTradeFairPhotos(fairName, q, true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const items = photos.data?.items ?? [];
  const total = photos.data?.total ?? 0;

  const loadMore = async () => {
    if (!photos.hasNextPage || photos.isFetchingNextPage) return;
    const before = items.length;
    const result = await photos.fetchNextPage();
    // Görüntüleyiciden "Sonraki" ile yüklendiyse yeni sayfanın ilk fotoğrafına geç.
    if (selectedIndex === before - 1 && (result.data?.items.length ?? 0) > before) setSelectedIndex(before);
  };

  if (photos.isPending) return <ListSkeleton />;
  if (photos.error && items.length === 0) {
    return <ErrorState message={photos.error.message || 'Fotoğraflar yüklenemedi'} onRetry={() => void photos.refetch()} />;
  }

  return (
    <>
      <FlashList
        style={{ flex: 1 }}
        data={items}
        numColumns={2}
        keyExtractor={tradeFairPhotoKey}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD - 4, paddingBottom: bottomInset + 88 }}
        ListHeaderComponent={
          <Text className="px-1 pb-2 font-inter text-xs text-muted-foreground" accessibilityRole="header">
            {fairName ?? 'Tüm fuarlar'} · {total} fotoğraf
          </Text>
        }
        renderItem={({ item, index }) => (
          <View className="p-1">
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={`${item.filename} fotoğrafını aç, ${item.companyName} ${item.contactName}`}
              onPress={() => setSelectedIndex(index)}
              className="overflow-hidden rounded-surface border border-border bg-card active:opacity-80"
            >
              <View className="aspect-square bg-muted">
                <Photo key={tradeFairPhotoKey(item)} fileId={item.fileId} alt={item.filename} />
              </View>
              <View className="p-2">
                <Text className="font-inter-semibold text-xs text-foreground" numberOfLines={1}>{item.companyName}</Text>
                <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>{item.contactName}</Text>
                {!fairName ? <Text className="font-inter text-[10px] text-muted-foreground" numberOfLines={1}>{item.fairName}</Text> : null}
              </View>
            </Pressable>
          </View>
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => void loadMore()}
        refreshing={photos.isRefetching}
        onRefresh={() => void photos.refetch()}
        ListEmptyComponent={
          <EmptyState icon="images-outline" title="Henüz fotoğraf yok" hint="Görüşme kartından fotoğraf eklediğinizde burada görünür." />
        }
        ListFooterComponent={
          photos.isFetchingNextPage ? (
            <Loading />
          ) : photos.error ? (
            <View className="items-center py-3">
              <Button label="Tekrar dene" variant="ghost" onPress={() => void loadMore()} />
            </View>
          ) : items.length > 0 ? (
            <Text className="py-3 text-center font-inter text-xs text-muted-foreground">{items.length} / {total} fotoğraf</Text>
          ) : null
        }
      />
      <PhotoViewer
        photos={items}
        index={selectedIndex}
        total={total}
        loadingMore={photos.isFetchingNextPage}
        onIndex={setSelectedIndex}
        onLoadMore={() => void loadMore()}
        onClose={() => setSelectedIndex(null)}
      />
    </>
  );
}
