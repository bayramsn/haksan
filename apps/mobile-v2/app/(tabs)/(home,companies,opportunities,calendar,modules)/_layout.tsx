import { useEffect } from 'react';
import { Stack, useNavigation } from 'expo-router';
import { StackActions } from '@react-navigation/native';
import { moduleResetTargets } from '@/src/navigation/tab-stack-reset';
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
  const { colors } = useTheme();
  useEffect(() => {
    if (key !== 'modules') return;
    return navigation.addListener('blur', () => {
      const state = navigation.getState();
      for (const target of moduleResetTargets(state)) navigation.dispatch({ ...StackActions.popToTop(), target });
    });
  }, [key, navigation]);
  return <Stack initialRouteName={root} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
    <Stack.Screen name={root} />
  </Stack>;
}
