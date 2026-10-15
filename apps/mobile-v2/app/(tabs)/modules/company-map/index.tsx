import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyMapPoints } from '@/src/api/companies.hooks';
import type { CompanyMapPoint } from '@/src/api/endpoints';
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
    router.push(`/(tabs)/modules/companies/${point.id}`);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title="Firma Haritası"
        subtitle={query.data ? `${query.data.data.length} konumlu firma` : undefined}
        actions={mapAvailable ? [{
          icon: view === 'map' ? 'list-outline' : 'map-outline',
          label: view === 'map' ? 'Liste görünümü' : 'Harita görünümü',
          onPress: () => setView((current) => current === 'map' ? 'list' : 'map'),
        }] : []}
      />
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
          <FlatList
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
    </SafeAreaView>
  );
}
