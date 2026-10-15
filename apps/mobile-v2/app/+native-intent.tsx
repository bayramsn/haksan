import { routeForIncomingHref } from '@/src/modules/navigate';
import { allowedIncomingLinkHosts } from '@/src/api/config';
import { queuePendingRoute } from '@/src/navigation/pendingTarget';

export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string> {
  try {
    const route = routeForIncomingHref(path, allowedIncomingLinkHosts());
    if (!route) return '/(tabs)';

    // Auth rotaları (örn. reset-password tokenı) doğrudan açılır ve hiçbir zaman
    // bekleyen hedef deposuna yazılmaz. Yalnız korumalı /(tabs) rotaları kuyruğa alınır.
    await queuePendingRoute(route);
    return route as string;
  } catch {
    // Expo Router native-intent hook'undan hata fırlatmak uygulamayı açılışta
    // düşürebilir. Güvenli ana sayfaya yönelerek session guard'a bırak.
    return '/(tabs)';
  }
}
