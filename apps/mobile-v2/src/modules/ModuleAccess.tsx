import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/auth/AuthProvider';
import { canAccessModule, moduleForPath, modules } from './catalog';
import { Button, EmptyState } from '@/src/ui';

/** Guards mounted children, so denied screens cannot start their queries. */
export function ModuleAccess({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const { user, tenant } = useAuth();
  const entry = modules.find((item) => item.key === moduleKey);
  if (!entry || !canAccessModule(user, tenant, entry)) {
    return <SafeAreaView className="flex-1 bg-canvas"><EmptyState title="Bu alana erişiminiz yok"
      hint="Yetkiniz olan işlere Modüller sekmesinden ulaşabilirsiniz." /></SafeAreaView>;
  }
  return <>{children}</>;
}

/**
 * Sekme yığınındaki her ekranı kendi rotasına göre korur. Yerleşimden <Redirect> dönmek
 * yığını söküp sekme çubuğuna REPLACE gönderiyordu (sekme yönlendiricisi bunu işlemez,
 * ekran boş kalıyordu); burada yığın yerinde kalır, geri tuşu çalışır.
 */
export function ScreenAccess({ routeName, onBack, children }: { routeName: string; onBack: () => void; children: ReactNode }) {
  const { user, tenant } = useAuth();
  const entry = moduleForPath(`/${routeName}`);
  if (entry && !canAccessModule(user, tenant, entry)) {
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <EmptyState title="Bu alana erişiminiz yok" hint="Yetkiniz olan işlere Modüller sekmesinden ulaşabilirsiniz." />
        <View className="px-6 pb-6"><Button label="Geri dön" variant="ghost" onPress={onBack} /></View>
      </SafeAreaView>
    );
  }
  return <>{children}</>;
}
