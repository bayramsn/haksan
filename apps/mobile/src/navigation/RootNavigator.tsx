import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../lib/auth';
import { Loading, colors } from '../ui';
import { LoginScreen } from '../screens/LoginScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { CalendarSettingsScreen } from '../screens/CalendarSettingsScreen';
import { MenuScreen } from './MenuScreen';
import { PlaceholderScreen } from './PlaceholderScreen';
import { DivisionSwitcher } from './DivisionSwitcher';
import { SCREEN_REGISTRY } from './screens';

const Tabs = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/** Modül anahtarına göre gerçek ekranı veya placeholder'ı gösterir. */
function ModuleHost({ route }: { route: { params?: { key?: string; title?: string } } }) {
  const key = route.params?.key ?? '';
  const Comp = SCREEN_REGISTRY[key];
  if (Comp) return <Comp route={route} />;
  return <PlaceholderScreen route={route} />;
}

const headerRight = () => <DivisionSwitcher />;
const screenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerRight,
} as const;

function CalendarStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="CalendarHome" component={CalendarScreen} options={{ title: 'Takvim' }} />
      <Stack.Screen name="CalendarSettings" component={CalendarSettingsScreen} options={{ title: 'Takvim Ayarları' }} />
    </Stack.Navigator>
  );
}

function MenuStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MenuHome" component={MenuScreen} options={{ title: 'Menü' }} />
      <Stack.Screen
        name="Module"
        component={ModuleHost}
        options={({ route }: any) => ({ title: route.params?.title ?? 'Modül' })}
      />
    </Stack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        ...screenOptions,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSubtle,
      }}
    >
      <Tabs.Screen
        name="Assistant"
        component={AssistantScreen}
        options={{ title: 'Sekreter', tabBarIcon: tabIcon('📞') }}
      />
      <Tabs.Screen
        name="Calendar"
        component={CalendarStack}
        options={{ title: 'Takvim', headerShown: false, tabBarIcon: tabIcon('📅') }}
      />
      <Tabs.Screen
        name="Menu"
        component={MenuStack}
        options={{ title: 'Menü', headerShown: false, tabBarIcon: tabIcon('☰') }}
      />
    </Tabs.Navigator>
  );
}

function tabIcon(glyph: string) {
  return ({ color }: { color: string }) => <Text style={{ fontSize: 18, color }}>{glyph}</Text>;
}

export function RootNavigator() {
  const { loading, authed } = useAuth();
  return (
    <NavigationContainer>
      {loading ? <Loading /> : authed ? <AppTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}
