import type { Href } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createPendingTargetQueue } from './pendingTargetPolicy';

const STORAGE_KEY = 'haksan_pending_navigation_v1';

const pendingQueue = createPendingTargetQueue({
  get: () => SecureStore.getItemAsync(STORAGE_KEY),
  set: (value) => SecureStore.setItemAsync(STORAGE_KEY, value),
  delete: () => SecureStore.deleteItemAsync(STORAGE_KEY),
});

/**
 * Dış link/push çözüldükten sonra yalnız kanonik iç rotayı beklemeye alır.
 * Raw URL, auth rotası, query veya hash hiçbir zaman kalıcı depoya girmez.
 */
export function queuePendingRoute(route: Href | string | null | undefined): Promise<boolean> {
  return pendingQueue.queue(route);
}

/** Kaydı döndürmeden önce siler; eşzamanlı tüketicilerden yalnız ilki hedef alır. */
export function consumePendingRoute(): Promise<Href | null> {
  return pendingQueue.consume();
}

export function subscribePendingRoutes(listener: () => void): () => void {
  return pendingQueue.subscribe(listener);
}
