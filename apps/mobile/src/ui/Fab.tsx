import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/tokens';
import { pressFade, shadowFab } from '@/src/theme/styles';

type Props = {
  onPress: () => void;
  label?: string;
};

/** Liste ekranları — sağ alt FAB */
export function Fab({ onPress, label = 'Yeni' }: Props) {
  return (
    <View style={styles.host} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.fab, shadowFab, pressFade(pressed)]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
