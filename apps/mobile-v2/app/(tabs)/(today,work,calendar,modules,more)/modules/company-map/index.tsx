import { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyMapPoints } from '@/src/api/companies.hooks';
import { companies, type CompanyMapPoint } from '@/src/api/endpoints';
import type { NearbyStaleVisitCompany } from '@haksan/shared';
import { currentPosition } from '@/src/native/location';
import { useTheme } from '@/src/theme/theme';
import { DetailHeader, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { CompanyMapSurface } from '@/src/features/company-map/CompanyMapSurface';

function configuredGoogleMapsKey(): boolean {
  const extra = Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined;
  return Boolean(extra?.googleMapsApiKey?.trim());
}

function locationLabel(point: CompanyMapPoint): string {
  return [point.district, point.province].filter(Boolean).join(', ') || 'Konum bilgisi yok';
}

export default function CompanyMapScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const query = useCompanyMapPoints();
  const mapAvailable =
    Platform.OS === 'web' || Platform.OS === 'ios' || (Platform.OS === 'android' && configuredGoogleMapsKey());
  const [view, setView] = useState<'map' | 'list'>(mapAvailable ? 'map' : 'list');
  const [search, setSearch] = useState('');
  // Web'deki "yakınımdaki ziyaret edilmemiş firmalar" hatırlatmasının elle tetiklenen hâli.
  const [nearby, setNearby] = useState<{ staleDays: number; radiusKm: number; companies: NearbyStaleVisitCompany[] } | null>(null);
  const [locating, setLocating] = useState(false);

  async function findNearby() {
    if (nearby) return setNearby(null);
    setLocating(true);
    try {
      const here = await currentPosition('Yakındaki firmaları bulmak için konumunuz kullanılır.');
      setNearby(await companies.nearbyStaleVisits({ ...here, notify: false }));
    } catch (cause) {
      Alert.alert('Yakındaki firmalar alınamadı', cause instanceof Error ? cause.message : 'Bilinmeyen hata.');
    } finally {
      setLocating(false);
    }
  }

  const points = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('tr');
    const rows = query.data?.data ?? [];
    if (!normalized) return rows;
    return rows.filter((point) =>
      [point.legalTitle, point.shortName, point.province, point.district]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('tr').includes(normalized))
    );
  }, [query.data?.data, search]);

  function openCompany(point: CompanyMapPoint) {
    router.push(`/modules/companies/${point.id}`);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <DetailHeader
        title="Firma Haritası"
        subtitle={query.data ? `${query.data.data.length} konumlu firma` : undefined}
        actions={[
          {
            icon: locating ? 'hourglass-outline' : nearby ? 'close-circle-outline' : 'navigate-outline',
            label: locating ? 'Konum alınıyor' : nearby ? 'Yakınımdakileri kapat' : 'Yakınımdakiler',
            onPress: () => { if (!locating) void findNearby(); },
          },
          ...(mapAvailable && !nearby ? [{
            icon: view === 'map' ? 'list-outline' as const : 'map-outline' as const,
            label: view === 'map' ? 'Liste görünümü' : 'Harita görünümü',
            onPress: () => setView((current) => current === 'map' ? 'list' : 'map'),
          }] : []),
        ]}
      />
      {nearby ? (
        <FlatList contentInsetAdjustmentBehavior="automatic"
          data={nearby.companies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={
            <Text className="mb-3 font-inter text-xs leading-5 text-muted-foreground">
              {nearby.radiusKm} km içinde, {nearby.staleDays} gündür ziyaret edilmemiş firmalar.
            </Text>
          }
          ListEmptyComponent={<EmptyState title="Yakında bekleyen ziyaret yok" />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name} firma kartını aç`}
              onPress={() => router.push(`/modules/companies/${item.id}`)}
              className="mb-2 min-h-16 flex-row items-center gap-3 rounded-overlay border border-border bg-card px-4 py-3 active:opacity-70"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-soft">
                <Ionicons name="navigate-outline" size={19} color={colors.primary} />
              </View>
              <View className="flex-1 gap-1">
                <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.name}</Text>
                <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                  {[`${item.distanceKm.toFixed(1)} km`, item.daysSinceVisit === null ? 'Hiç ziyaret yok' : `${item.daysSinceVisit} gün önce`, item.district ?? item.city].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
            </Pressable>
          )}
        />
      ) : <>
      <View className="border-b border-border bg-card px-4 py-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Firma veya şehir ara" />
      </View>

      {query.isPending ? <Loading /> : query.error ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : points.length === 0 ? (
        <EmptyState
          title={search ? 'Aramayla eşleşen firma yok' : 'Haritada gösterilecek firma yok'}
          hint="Firma adresine geçerli koordinat eklendiğinde burada görünür."
        />
      ) : view === 'map' && mapAvailable ? (
        <CompanyMapSurface points={points} truncated={query.data?.truncated} onCompanyPress={openCompany} />
      ) : (
        <View className="flex-1">
          {!mapAvailable ? (
            <View className="border-b border-warning/30 bg-warning-soft px-4 py-3">
              <Text className="font-inter text-xs leading-5 text-foreground">
                {Platform.OS === 'android'
                  ? 'Android haritası bu derlemede yapılandırılmamış. Firma konumları güvenli liste görünümünde kullanılabilir.'
                  : 'Harita bu platformda desteklenmiyor; firma konumları liste görünümünde gösteriliyor.'}
              </Text>
            </View>
          ) : null}
          <FlatList contentInsetAdjustmentBehavior="automatic"
            data={points}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.legalTitle} firma kartını aç`}
                onPress={() => openCompany(item)}
                className="mb-2 min-h-16 flex-row items-center gap-3 rounded-overlay border border-border bg-card px-4 py-3 active:opacity-70"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-soft">
                  <Ionicons name="location-outline" size={19} color={colors.primary} />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.legalTitle}</Text>
                  <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{locationLabel(item)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
              </Pressable>
            )}
          />
        </View>
      )}
      </>}
    </SafeAreaView>
  );
}
