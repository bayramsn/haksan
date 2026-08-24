import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { consumePendingRoute, subscribePendingRoutes } from './pendingTarget';

/** Başarılı session bootstrap/login sonrasında bekleyen hedefi tam bir kez açar. */
export function PendingTargetReplayer() {
  const router = useRouter();
  const { loading, user } = useAuth();
  const replaying = useRef(false);
  const replayRequested = useRef(false);
  const canReplay = useRef(false);
  canReplay.current = !loading && Boolean(user);

  const replay = useCallback(() => {
    if (!canReplay.current) return;
    if (replaying.current) {
      replayRequested.current = true;
      return;
    }
    replaying.current = true;
    void (async () => {
      try {
        do {
          replayRequested.current = false;
          const route = await consumePendingRoute();
          // Oturum consume sırasında kapandıysa hedef yeni/anonim kullanıcıya
          // taşınmaz. Route guard, açık oturumdaki resource yetkisini ayrıca sınar.
          if (route && canReplay.current) router.replace(route);
        } while (replayRequested.current && canReplay.current);
      } finally {
        replaying.current = false;
      }
    })();
  }, [router]);

  useEffect(() => {
    const unsubscribe = subscribePendingRoutes(replay);
    replay();
    return unsubscribe;
  }, [loading, replay, user]);

  return null;
}
