import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/src/theme/tokens';

/** Basit imza alanı — Stitch Servis Tamamlama */
export function SignaturePad({ onChange }: { onChange?: (hasStroke: boolean) => void }) {
  const [paths, setPaths] = useState<Array<{ x: number; y: number }[]>>([]);
  const current = useRef<{ x: number; y: number }[]>([]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        current.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
      },
      onPanResponderMove: (e) => {
        current.current.push({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
        setPaths((p) => [...p.slice(0, -1), [...current.current]]);
      },
      onPanResponderRelease: () => {
        setPaths((p) => [...p, [...current.current]]);
        onChange?.(true);
      },
    })
  ).current;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Müşteri İmzası</Text>
      <View style={styles.pad} {...pan.panHandlers}>
        {paths.map((stroke, i) =>
          stroke.length > 1 ? (
            <View key={i} style={StyleSheet.absoluteFill} pointerEvents="none">
              {stroke.slice(1).map((pt, j) => {
                const prev = stroke[j];
                const dx = pt.x - prev.x;
                const dy = pt.y - prev.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                return (
                  <View
                    key={j}
                    style={{
                      position: 'absolute',
                      left: prev.x,
                      top: prev.y,
                      width: len,
                      height: 2,
                      backgroundColor: colors.textPrimary,
                      transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                    }}
                  />
                );
              })}
            </View>
          ) : null
        )}
        <Text style={styles.hint}>Buraya imza atın</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 12 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  pad: {
    height: 160,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 8,
  },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
