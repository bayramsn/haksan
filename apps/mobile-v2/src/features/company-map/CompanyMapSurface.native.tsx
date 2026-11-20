import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Callout, Marker, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { CompanyMapPoint } from '@/src/api/endpoints';
import { useTheme } from '@/src/theme/theme';

const TURKEY_REGION: Region = {
  latitude: 39,
  longitude: 35,
  latitudeDelta: 13,
  longitudeDelta: 18,
};

function locationLabel(point: CompanyMapPoint): string {
  return [point.district, point.province].filter(Boolean).join(', ') || 'Konum bilgisi yok';
}

export function CompanyMapSurface({
  points,
  truncated,
  onCompanyPress,
}: {
  points: CompanyMapPoint[];
  truncated?: boolean;
  onCompanyPress: (point: CompanyMapPoint) => void;
}) {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  const [showsUserLocation, setShowsUserLocation] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (points.length === 1) {
        mapRef.current?.animateToRegion({
          latitude: points[0]!.latitude,
          longitude: points[0]!.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        });
      } else if (points.length > 1) {
        mapRef.current?.fitToCoordinates(
          points.map(({ latitude, longitude }) => ({ latitude, longitude })),
          { edgePadding: { top: 64, right: 48, bottom: 160, left: 48 }, animated: true }
        );
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [points]);

  async function centerOnUser() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Konum izni gerekli',
          'Yakınınızdaki firmaları haritada görmek için yalnız uygulama açıkken konum izni verin.'
        );
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

  return (
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
            <Callout
              accessibilityLabel={`${point.legalTitle} firma kartını aç`}
              onPress={() => onCompanyPress(point)}
            >
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
      {truncated ? (
        <View className="absolute left-4 right-20 top-3 rounded-control bg-card/95 px-3 py-2">
          <Text className="font-inter text-xs text-muted-foreground">
            İlk 2.000 firma gösteriliyor; aramayla daraltın.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
