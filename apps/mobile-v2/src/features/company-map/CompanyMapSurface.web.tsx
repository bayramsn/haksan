import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as L from 'leaflet';
import './leaflet-web.css';
import type { CompanyMapPoint } from '@/src/api/endpoints';
import { useTheme } from '@/src/theme/theme';

const TURKEY_CENTER: L.LatLngExpression = [39, 35];

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
  const elementRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<CompanyMapPoint | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || mapRef.current) return;

    const map = L.map(element, { attributionControl: false, zoomControl: false }).setView(TURKEY_CENTER, 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      markerLayerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const coordinates: L.LatLngExpression[] = [];
    for (const point of points) {
      const coordinate: L.LatLngExpression = [point.latitude, point.longitude];
      coordinates.push(coordinate);
      const marker = L.marker(coordinate, {
        icon: L.divIcon({
          className: '',
          html: `<span aria-hidden="true" class="haksan-map-marker${
            point.statusCode === 'active' ? ' haksan-map-marker--active' : ''
          }"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        title: point.shortName || point.legalTitle,
      });
      marker.on('click', () => setSelectedPoint(point));
      marker.addTo(layer);
    }

    if (coordinates.length === 1) map.setView(coordinates[0]!, 13, { animate: true });
    else if (coordinates.length > 1) map.fitBounds(L.latLngBounds(coordinates), { padding: [40, 40], animate: true });
  }, [points]);

  function centerOnUser() {
    if (!navigator.geolocation) {
      Alert.alert('Konum desteklenmiyor', 'Bu tarayıcı konum hizmetini desteklemiyor.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => mapRef.current?.setView([coords.latitude, coords.longitude], 13, { animate: true }),
      () => Alert.alert('Konum alınamadı', 'Tarayıcı konum iznini kontrol edin.'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  return (
    <View className="flex-1">
      <View
        className="haksan-leaflet-map flex-1"
        ref={(node) => {
          elementRef.current = node as unknown as HTMLElement | null;
        }}
        style={{ flex: 1 }}
      />
      <View className="absolute bottom-20 right-4 overflow-hidden rounded-control border border-border bg-card shadow-lg">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Haritayı yakınlaştır"
          onPress={() => mapRef.current?.zoomIn()}
          className="h-11 w-11 items-center justify-center border-b border-border active:opacity-70"
        >
          <Ionicons name="add" size={22} color={colors.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Haritayı uzaklaştır"
          onPress={() => mapRef.current?.zoomOut()}
          className="h-11 w-11 items-center justify-center active:opacity-70"
        >
          <Ionicons name="remove" size={22} color={colors.foreground} />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Konumuma git"
        onPress={centerOnUser}
        className="absolute bottom-6 right-4 h-12 w-12 items-center justify-center rounded-full border border-border bg-card shadow-lg active:opacity-70"
      >
        <Ionicons name="locate-outline" size={22} color={colors.foreground} />
      </Pressable>
      {selectedPoint ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${selectedPoint.legalTitle} firma kartını aç`}
          onPress={() => onCompanyPress(selectedPoint)}
          className="absolute bottom-6 left-4 right-20 gap-1 rounded-surface border border-border bg-card px-4 py-3 shadow-lg active:opacity-90"
        >
          <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>
            {selectedPoint.legalTitle}
          </Text>
          <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
            {locationLabel(selectedPoint)}
          </Text>
          <Text className="pt-1 font-inter-semibold text-xs text-primary">Firma kartını aç</Text>
        </Pressable>
      ) : null}
      <View className="absolute bottom-1 left-2 rounded bg-card/90 px-1.5 py-0.5">
        <Text className="font-inter text-[9px] text-muted-foreground">© OpenStreetMap</Text>
      </View>
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
