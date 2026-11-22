import { Stack, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/src/auth/AuthProvider';
import { canAccessModule, moduleForPath } from '@/src/modules/catalog';
import { EmptyState } from '@/src/ui';

/**
 * Tüm modül ekranları (liste + detay) bu tek yığında. Başlıklar native header
 * yerine ekranların kendi çubuğunda (ScreenHeader / DetailHeader) — tasarımdaki
 * büyük başlık + eylem düğmeleri düzeni native header'a sığmıyor.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function ModulesLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, tenant } = useAuth();
  const entry = moduleForPath(pathname);
  // Sessiz yönlendirme kullanıcıyı neden geri atıldığını bilmeden bırakıyordu.
  if (entry && !canAccessModule(user, tenant, entry)) {
    return (
      <View className="flex-1 justify-center bg-canvas">
        <EmptyState
          icon="lock-closed-outline"
          title="Bu modüle erişiminiz yok"
          hint="Yetkiniz ya da seçili bölüm kapsamı bu modülü kapsamıyor."
          actionLabel="Modüllere dön"
          onAction={() => router.replace('/modules')}
        />
      </View>
    );
  }
  return <Stack initialRouteName="index" screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
