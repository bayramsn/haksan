import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '@/src/theme/tokens';

/**
 * `expo-router` `BottomTabBarProps`'un kullandığımız yapısal alt kümesi. Gerçek prop
 * nesnesi (daha zengin) bu tipe sorunsuzca atanır; böylece sürüm-kırılgan derin
 * import'a gerek kalmaz.
 */
type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  descriptors: Record<string, { options: { tabBarAccessibilityLabel?: string } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  insets: { top: number; right: number; bottom: number; left: number };
};

/** Figma tasarımındaki gri (aktif olmayan sekme). */
const INACTIVE = '#9fa3b0';

type TabMeta = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconActive: React.ComponentProps<typeof Ionicons>['name'];
};

/** route.name → ikon + etiket. (`app/(tabs)/*` dosya adlarıyla eşleşir.) */
const TAB_META: Record<string, TabMeta> = {
  index: { label: 'Ana', icon: 'home-outline', iconActive: 'home' },
  sales: { label: 'Satış', icon: 'briefcase-outline', iconActive: 'briefcase' },
  operations: { label: 'Operasyon', icon: 'cube-outline', iconActive: 'cube' },
  service: { label: 'Servis', icon: 'construct-outline', iconActive: 'construct' },
  more: { label: 'Daha', icon: 'menu-outline', iconActive: 'menu' },
};

/**
 * Figma `MobileNav` paritesi: kayan beyaz pill, kırmızı aktif ikon + yumuşak kırmızı
 * arka plan + kırmızı alt çizgi, lacivert (primary) aktif etiket.
 */
export function FloatingTabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const meta = TAB_META[route.name];
          if (!meta) return null;
          const isActive = state.index === index;
          const { options } = descriptors[route.key];

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isActive && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isActive ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? meta.label}
              onPress={onPress}
              style={styles.tab}
            >
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Ionicons
                  name={isActive ? meta.iconActive : meta.icon}
                  size={22}
                  color={isActive ? colors.accentRed : INACTIVE}
                />
              </View>
              {isActive ? <View style={styles.underline} /> : <View style={styles.underlineSpacer} />}
              <Text
                numberOfLines={1}
                style={[styles.label, { color: isActive ? colors.primary : INACTIVE, fontFamily: isActive ? fonts.bold : fonts.medium }]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 12,
    paddingTop: 4,
    backgroundColor: colors.canvas,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  iconWrap: {
    width: 38,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(207,6,12,0.08)',
  },
  underline: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accentRed,
    marginTop: 1,
  },
  underlineSpacer: {
    height: 4,
    marginTop: 1,
  },
  label: {
    fontSize: 10,
    lineHeight: 12,
    marginTop: 2,
  },
});
