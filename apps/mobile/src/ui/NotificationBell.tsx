import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, layout } from '@/src/theme/tokens';

/** Figma TopBar bildirim zili + kırmızı okunmamış rozeti. */
export function NotificationBell({ count = 0, onPress }: { count?: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Bildirimler"
      style={styles.btn}
    >
      <Ionicons name="notifications-outline" size={22} color={colors.textMuted} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: layout.touchMin,
    height: layout.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 6,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: colors.accentRed,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 8, lineHeight: 10, fontFamily: fonts.bold, color: '#ffffff' },
});
