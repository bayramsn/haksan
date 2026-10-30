import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useCanAccessModule } from '@/src/modules/useModuleAccess';

/** Sekme rotaları `modules/` yığınının dışında; aynı erişim kuralıyla ana sayfaya döner. */
export function ModuleGate({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const allowed = useCanAccessModule(moduleKey);
  if (!allowed) return <Redirect href="/(tabs)/(home)" />;
  return children;
}
