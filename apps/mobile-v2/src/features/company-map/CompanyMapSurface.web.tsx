import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as L from 'leaflet';
import './leaflet-web.css';
import { toneColor, useTheme } from '@/src/theme/theme';
import type { CompanyMapSurfaceProps } from './map-style';

const TURKEY_CENTER: L.LatLngExpression = [39, 35];

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
  const elementRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef({ pickMode, onMapPick });
  pickRef.current = { pickMode, onMapPick };
  const pinKey = pins.map((pin) => `${pin.id}:${pin.latitude}:${pin.longitude}:${pin.tone}`).join('|');

  useEffect(() => {
    const element = elementRef.current;
    if (!element || mapRef.current) return;
    const map = L.map(element, { attributionControl: false, zoomControl: false }).setView(TURKEY_CENTER, 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    overlayLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (!pickRef.current.pickMode) return;
      pickRef.current.onMapPick?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      markerLayerRef.current = null;
      overlayLayerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const coordinates: L.LatLngExpression[] = [];
    for (const pin of pins) {
      const coordinate: L.LatLngExpression = [pin.latitude, pin.longitude];
      coordinates.push(coordinate);
      const marker = L.marker(coordinate, {
        icon: L.divIcon({
          className: '',
          html: `<span aria-hidden="true" class="haksan-map-marker" style="background:${toneColor(colors, pin.tone)}"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        title: pin.title,
      });
      marker.on('click', () => onPinPress(pin.id));
      marker.addTo(layer);
    }
    if (coordinates.length === 1) map.setView(coordinates[0]!, 13, { animate: true });
    else if (coordinates.length > 1) map.fitBounds(L.latLngBounds(coordinates), { padding: [40, 40], animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey, colors]);

  useEffect(() => {
    const layer = overlayLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (userPos) {
      L.circleMarker([userPos.lat, userPos.lng], { radius: 8, color: colors.primary, fillColor: colors.primary, fillOpacity: 0.9 })
        .bindTooltip('Konumum')
        .addTo(layer);
    }
    if (routeLine && routeLine.length > 1) {
      L.polyline(routeLine.map((point) => [point.lat, point.lng] as L.LatLngTuple), { color: colors.primary, weight: 3, dashArray: '8 6' }).addTo(layer);
    }
  }, [userPos, routeLine, colors]);

  useEffect(() => {
    const pin = focusId ? pins.find((row) => row.id === focusId) : null;
    if (pin) mapRef.current?.setView([pin.latitude, pin.longitude], 13, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (userPos) mapRef.current?.setView([userPos.lat, userPos.lng], 10, { animate: true });
  }, [userPos?.lat, userPos?.lng]);

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
      <View className="absolute bottom-1 left-2 rounded bg-card px-1.5 py-0.5">
        <Text className="font-inter text-[9px] text-muted-foreground">© OpenStreetMap</Text>
      </View>
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
