import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import MapView, { Callout, Marker, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyMapPoints } from '@/src/api/companies.hooks';
import type { CompanyMapPoint } from '@/src/api/endpoints';
import { useTheme } from '@/src/theme/theme';
import { DetailHeader, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';

const TURKEY_REGION: Region = {
  latitude: 39,
  longitude: 35,
  latitudeDelta: 13,
  longitudeDelta: 18,
};

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
  const mapRef = useRef<MapView>(null);
  const query = useCompanyMapPoints();
  const mapAvailable = Platform.OS === 'ios' || (Platform.OS === 'android' && configuredGoogleMapsKey());
  const [view, setView] = useState<'map' | 'list'>(mapAvailable ? 'map' : 'list');
  const [search, setSearch] = useState('');
  const [showsUserLocation, setShowsUserLocation] = useState(false);

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

  useEffect(() => {
    if (view !== 'map' || points.length === 0) return;
    const timeout = setTimeout(() => {
      if (points.length === 1) {
        mapRef.current?.animateToRegion({
          latitude: points[0]!.latitude,
          longitude: points[0]!.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        });
      } else {
        mapRef.current?.fitToCoordinates(
          points.map(({ latitude, longitude }) => ({ latitude, longitude })),
          { edgePadding: { top: 64, right: 48, bottom: 160, left: 48 }, animated: true }
        );
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [points, view]);

  async function centerOnUser() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Konum izni gerekli', 'Yakınınızdaki firmaları haritada görmek için yalnız uygulama açıkken konum izni verin.');
        return;
      }
      setShowsUserLocation(true);
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      });
    } catch (error) {
      Alert.alert('Konum alınamadı', error instanceof Error ? error.message : 'Konum servisine ulaşılamadı.');
    }
  }

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
        <View className="flex-1">
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={TURKEY_REGION}
            showsUserLocation={showsUserLocation}
            showsMyLocationButton={false}
            loadingEnabled
          >
            {points.map((point) => (
              <Marker
                key={point.id}
                coordinate={{ latitude: point.latitude, longitude: point.longitude }}
                title={point.shortName || point.legalTitle}
                description={locationLabel(point)}
                pinColor={point.statusCode === 'active' ? colors.success : colors.primary}
              >
                <Callout accessibilityLabel={`${point.legalTitle} firma kartını aç`} onPress={() => openCompany(point)}>
                  <View className="w-52 gap-1 p-1">
                    <Text className="font-inter-semibold text-sm text-foreground">{point.legalTitle}</Text>
                    <Text className="font-inter text-xs text-muted-foreground">{locationLabel(point)}</Text>
                    <Text className="pt-1 font-inter-semibold text-xs text-primary">Firma kartını aç</Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Konumuma git"
            onPress={() => void centerOnUser()}
            className="absolute bottom-6 right-4 h-12 w-12 items-center justify-center rounded-full border border-border bg-card shadow-lg active:opacity-70"
          >
            <Ionicons name="locate-outline" size={22} color={colors.foreground} />
          </Pressable>
          {query.data?.truncated ? (
            <View className="absolute left-4 right-20 top-3 rounded-control bg-card/95 px-3 py-2">
              <Text className="font-inter text-xs text-muted-foreground">İlk 2.000 firma gösteriliyor; aramayla daraltın.</Text>
            </View>
          ) : null}
        </View>
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
