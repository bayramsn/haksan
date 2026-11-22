import { useCallback, useRef } from 'react';
import { Stack, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useTheme } from '@/src/theme/theme';

const ROOTS = { home: 'index', companies: 'companies', opportunities: 'opportunities', calendar: 'calendar', modules: 'modules' } as const;
export const unstable_settings = {
  home: { initialRouteName: 'index' }, companies: { initialRouteName: 'companies' },
  opportunities: { initialRouteName: 'opportunities' }, calendar: { initialRouteName: 'calendar' },
  modules: { initialRouteName: 'modules' },
};

export default function TabStackLayout({ segment }: { segment: string }) {
  const key = segment.replace(/[()]/g, '') as keyof typeof ROOTS;
  const root = ROOTS[key] ?? 'index';
  const navigation = useNavigation();
  const router = useRouter();
  const resetOnReturn = useRef(false);
  const { colors } = useTheme();
  useFocusEffect(useCallback(() => {
    if (key !== 'modules') return;
    if (resetOnReturn.current) {
      resetOnReturn.current = false;
      router.replace('/(tabs)/(modules)/modules');
    }
    return () => {
      const parent = navigation.getState();
      // Root modals also blur this screen; preserve their originating stack.
      if (parent && parent.routes[parent.index]?.name !== '(modules)') resetOnReturn.current = true;
    };
  }, [key, navigation, router]));
  return <Stack initialRouteName={root} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
    <Stack.Screen name={root} />
  </Stack>;
}
