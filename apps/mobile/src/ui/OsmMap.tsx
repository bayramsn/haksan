import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import MapView, { Callout, Marker, UrlTile, type Region } from 'react-native-maps';
import { colors } from '@/src/theme/tokens';

/** OpenStreetMap — ücretsiz, API key yok */
export const OSM_TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export type MapMarker = {
  id: string;
  title: string;
  subtitle?: string;
  coordinate: { latitude: number; longitude: number };
  onPress?: () => void;
};

type Props = {
  region: Region;
  markers: MapMarker[];
  onRegionChange?: (r: Region) => void;
  style?: ViewStyle;
};

export function OsmMap({ region, markers, onRegionChange, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <MapView
        style={styles.map}
        mapType="none"
        initialRegion={region}
        region={region}
        onRegionChangeComplete={onRegionChange}
        rotateEnabled={false}
      >
        <UrlTile urlTemplate={OSM_TILE} maximumZ={19} flipY={false} />
        {markers.map((m) => (
          <Marker key={m.id} coordinate={m.coordinate} pinColor={colors.primary}>
            {m.onPress ? (
              <Callout onPress={m.onPress}>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{m.title}</Text>
                  {m.subtitle ? <Text>{m.subtitle}</Text> : null}
                </View>
              </Callout>
            ) : null}
          </Marker>
        ))}
      </MapView>
      <Text style={styles.attribution}>© OpenStreetMap katkıda bulunanlar</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  map: { flex: 1, minHeight: 400 },
  callout: { maxWidth: 200 },
  calloutTitle: { fontWeight: '700' },
  attribution: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 4,
    backgroundColor: colors.card,
  },
});
