import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/src/ui/FloatingTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ lazy: true, headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Ana' }} />
      <Tabs.Screen name="sales" options={{ title: 'Satış' }} />
      <Tabs.Screen name="operations" options={{ title: 'Operasyon' }} />
      <Tabs.Screen name="service" options={{ title: 'Servis' }} />
      <Tabs.Screen name="more" options={{ title: 'Daha Fazla' }} />
    </Tabs>
  );
}
