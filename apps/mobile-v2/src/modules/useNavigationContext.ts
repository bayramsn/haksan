import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { toast } from '@/src/ui/toast';
import { consumeNavigationContext, type NavigationContext } from './navigationContext';

export function useNavigationContext(nav: string, apply: (value: NavigationContext) => void) {
  const { navigationAction } = useLocalSearchParams<{ navigationAction?: string }>();
  const router = useRouter();
  const callback = useRef(apply); callback.current = apply;
  const consumed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!navigationAction || navigationAction === consumed.current) return;
    consumed.current = navigationAction;
    const value = consumeNavigationContext(navigationAction, nav);
    router.setParams({ navigationAction: undefined });
    if (value) callback.current(value);
    else toast.error('Yönlendirme süresi doldu veya çalışma alanı değişti. Filtreleri yeniden seçin.');
  }, [navigationAction, nav, router]);
}
