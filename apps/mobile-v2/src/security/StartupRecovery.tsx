import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

/** Fail closed: no authenticated content mounts while secure storage cannot be read. */
export function StartupRecovery({ onRetry }: { onRetry: () => void }) {
  useEffect(() => { void SplashScreen.hideAsync().catch(() => undefined); }, []);
  return <View accessibilityLiveRegion="assertive" style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 18, backgroundColor: '#f8fafc' }}>
    <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: '#0b1f3a' }}>Güvenli başlangıç tamamlanamadı</Text>
    <Text style={{ fontSize: 16, lineHeight: 24, color: '#475569' }}>Cihazın kilidini açıp tekrar deneyin. Kayıtlarınız silinmedi; güvenlik kontrolü tamamlanmadan iş verileriniz açılmaz.</Text>
    <Pressable accessibilityRole="button" onPress={onRetry} style={{ backgroundColor: '#0b1f3a', padding: 16, borderRadius: 12 }}>
      <Text style={{ textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '600' }}>Tekrar Dene</Text>
    </Pressable>
  </View>;
}
