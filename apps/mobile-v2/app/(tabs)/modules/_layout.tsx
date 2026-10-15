import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { canAccessModule, moduleForPath } from '@/src/modules/catalog';

/**
 * Tüm modül ekranları (liste + detay) bu tek yığında. Başlıklar native header
 * yerine ekranların kendi çubuğunda (ScreenHeader / DetailHeader) — tasarımdaki
 * büyük başlık + eylem düğmeleri düzeni native header'a sığmıyor.
 */
export default function ModulesLayout() {
  const pathname = usePathname();
  const { user, tenant } = useAuth();
  const entry = moduleForPath(pathname);
  if (entry && !canAccessModule(user, tenant, entry)) {
    return <Redirect href="/(tabs)/modules" />;
  }
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
