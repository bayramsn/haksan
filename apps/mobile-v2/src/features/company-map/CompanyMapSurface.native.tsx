import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView, { Callout, Marker, Polyline, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { toneColor, useTheme } from '@/src/theme/theme';
import type { CompanyMapSurfaceProps } from './map-style';

const TURKEY_REGION: Region = {
  latitude: 39,
  longitude: 35,
  latitudeDelta: 13,
  longitudeDelta: 18,
};

export function CompanyMapSurface({
  pins,
  truncated,
  userPos,
  routeLine,
  focusId,
  pickMode,
  onPinPress,
  onMapPick,
  onLocate,
}: CompanyMapSurfaceProps) {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  const pinKey = pins.map((pin) => pin.id).join('|');

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (pins.length === 1) {
        mapRef.current?.animateToRegion({ latitude: pins[0]!.latitude, longitude: pins[0]!.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 });
      } else if (pins.length > 1) {
        mapRef.current?.fitToCoordinates(
          pins.map(({ latitude, longitude }) => ({ latitude, longitude })),
          { edgePadding: { top: 64, right: 48, bottom: 160, left: 48 }, animated: true },
        );
      }
    }, 250);
    return () => clearTimeout(timeout);
    // Yalnız pin kümesi değişince yeniden sığdır; seçim değişimi haritayı zıplatmasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  useEffect(() => {
    const pin = focusId ? pins.find((row) => row.id === focusId) : null;
    if (pin) mapRef.current?.animateToRegion({ latitude: pin.latitude, longitude: pin.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (userPos) mapRef.current?.animateToRegion({ latitude: userPos.lat, longitude: userPos.lng, latitudeDelta: 0.6, longitudeDelta: 0.6 });
  }, [userPos?.lat, userPos?.lng]);

  return (
    <View className="flex-1">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={TURKEY_REGION}
        showsMyLocationButton={false}
        loadingEnabled
        onPress={(event) => {
          if (!pickMode) return;
          const { latitude, longitude } = event.nativeEvent.coordinate;
          onMapPick?.({ lat: latitude, lng: longitude });
        }}
      >
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
            title={pin.title}
            description={pin.subtitle}
            pinColor={toneColor(colors, pin.tone)}
          >
            <Callout accessibilityLabel={`${pin.title} işlemleri`} onPress={() => onPinPress(pin.id)}>
              <View className="w-52 gap-1 p-1">
                <Text className="font-inter-semibold text-sm text-foreground">{pin.title}</Text>
                <Text className="font-inter text-xs text-muted-foreground">{pin.subtitle}</Text>
                <Text className="pt-1 font-inter-semibold text-xs text-primary">İşlemler</Text>
              </View>
            </Callout>
          </Marker>
        ))}
        {userPos ? (
          <Marker coordinate={{ latitude: userPos.lat, longitude: userPos.lng }} title="Konumum" pinColor={colors.primary} />
        ) : null}
        {routeLine && routeLine.length > 1 ? (
          <Polyline
            coordinates={routeLine.map((point) => ({ latitude: point.lat, longitude: point.lng }))}
            strokeColor={colors.primary}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        ) : null}
      </MapView>
      {onLocate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Konumuma git"
          onPress={onLocate}
          className="absolute bottom-6 right-4 h-12 w-12 items-center justify-center rounded-full border border-border bg-card shadow-lg active:opacity-70"
        >
          <Ionicons name="locate-outline" size={22} color={colors.foreground} />
        </Pressable>
      ) : null}
      {pickMode ? (
        <View className="absolute left-4 right-4 top-3 rounded-control border border-primary bg-card px-3 py-2">
          <Text className="font-inter text-xs text-primary">Haritada doğru noktaya dokunun; koordinat kaydedilir.</Text>
        </View>
      ) : truncated ? (
        <View className="absolute left-4 right-20 top-3 rounded-control bg-card px-3 py-2">
          <Text className="font-inter text-xs text-muted-foreground">Firma listesi kısaltıldı; aramayla daraltın.</Text>
        </View>
      ) : null}
    </View>
  );
}
