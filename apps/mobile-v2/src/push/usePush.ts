import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { loadAccessToken, request } from '@/src/api/client';
import { allowedIncomingLinkHosts, apiOrigin } from '@/src/api/config';
import { kv } from '@/src/offline/storage';
import { routeForPushData } from '@/src/modules/navigate';
import { queuePendingRoute } from '@/src/navigation/pendingTarget';
import { queryClient } from '@/src/query/client';
import { notificationKeys } from '@/src/api/notifications.hooks';
import { chatKeys } from '@/src/api/chat.keys';
import {
  canRetryPending,
  createPendingUnregistration,
  isPendingPushUnregistration,
  isPushRegistration,
  markPendingAttemptFailed,
  ownerFromAccessToken,
  samePushOwner,
  samePushRegistration,
  type PendingPushUnregistration,
  type PushOwner,
  type PushRegistration,
} from './lifecycle';

const LEGACY_TOKEN_KEY = 'push_token';
const CURRENT_REGISTRATION_KEY = 'haksan.push.current.v2';
const PENDING_INDEX_KEY = 'haksan.push.pending.index.v2';
const PENDING_RECORD_PREFIX = 'haksan.push.pending.v2.';
const PENDING_ID_PATTERN = /^[a-zA-Z0-9._-]{1,160}$/;
const PUSH_CLEANUP_TIMEOUT_MS = 5_000;
let permissionRequestedThisRuntime = false;
let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRetryAt: number | null = null;
let pushRegistrationSuspended = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

type SecureReadResult = { available: true; value: unknown } | { available: false };

async function secureReadJson(key: string): Promise<SecureReadResult> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return { available: true, value: raw ? JSON.parse(raw) : null };
  } catch {
    return { available: false };
  }
}

async function secureWriteJson(key: string, value: unknown): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

async function secureDelete(key: string): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(key);
    return true;
  } catch {
    // Silme idempotenttir; kayıt kalırsa sonraki yaşam döngüsünde tekrar denenir.
    return false;
  }
}

async function currentOwner(): Promise<PushOwner | null> {
  return ownerFromAccessToken(await loadAccessToken(), apiOrigin());
}

async function readCurrentRegistration(): Promise<PushRegistration | null | undefined> {
  const result = await secureReadJson(CURRENT_REGISTRATION_KEY);
  if (!result.available) return undefined;
  if (result.value === null) return null;
  return isPushRegistration(result.value) ? result.value : undefined;
}

async function readPendingIds(): Promise<string[] | null> {
  const result = await secureReadJson(PENDING_INDEX_KEY);
  if (!result.available) return null;
  if (result.value === null) return [];
  if (!Array.isArray(result.value)) return null;
  if (result.value.some((item) => typeof item !== 'string' || !PENDING_ID_PATTERN.test(item))) return null;
  return [
    ...new Set(
      result.value.filter((item): item is string => typeof item === 'string' && PENDING_ID_PATTERN.test(item))
    ),
  ];
}

async function writePendingIds(ids: string[]): Promise<boolean> {
  return secureWriteJson(PENDING_INDEX_KEY, [...new Set(ids)]);
}

function pendingKey(id: string): string {
  return `${PENDING_RECORD_PREFIX}${id}`;
}

async function readPendingRecords(): Promise<PendingPushUnregistration[] | null> {
  const ids = await readPendingIds();
  if (!ids) return null;
  const records: PendingPushUnregistration[] = [];
  const missingIds: string[] = [];
  for (const id of ids) {
    const result = await secureReadJson(pendingKey(id));
    // Geçici okuma hatası veya bozuk kayıt, silme talebini unutturmamalı.
    if (!result.available) return null;
    // Sunucu silmesinden sonra record silinip index yazımı yarıda kaldıysa yalnız
    // hassas veri içermeyen ölü index girdisini iyileştir.
    if (result.value === null) {
      missingIds.push(id);
      continue;
    }
    if (!isPendingPushUnregistration(result.value) || result.value.id !== id) return null;
    records.push(result.value);
  }
  if (missingIds.length > 0 && !(await writePendingIds(ids.filter((id) => !missingIds.includes(id))))) return null;
  return records;
}

function newPendingId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Silme isteğinden önce kalıcılaştırılır; uygulama kapanırsa token unutulmaz. */
async function persistPending(registration: PushRegistration): Promise<PendingPushUnregistration | null> {
  const records = await readPendingRecords();
  if (!records) return null;
  const existing = records.find((record) => samePushRegistration(record, registration));
  if (existing) return existing;

  const record = createPendingUnregistration(registration, newPendingId(), Date.now());
  if (!(await secureWriteJson(pendingKey(record.id), record))) return null;
  const ids = await readPendingIds();
  if (!ids) {
    await secureDelete(pendingKey(record.id));
    return null;
  }
  if (await writePendingIds([...ids, record.id])) return record;
  await secureDelete(pendingKey(record.id));
  return null;
}

async function removePending(record: PendingPushUnregistration): Promise<boolean> {
  // Önce token içeren record silinir. Sonraki index yazımı yarıda kalırsa
  // readPendingRecords hassas veri içermeyen ölü girdiyi kendisi temizler.
  if (!(await secureDelete(pendingKey(record.id)))) return false;
  const ids = await readPendingIds();
  if (!ids) return true;
  await writePendingIds(ids.filter((id) => id !== record.id));
  return true;
}

function schedulePendingRetry(nextAttemptAt: number): void {
  if (pendingRetryTimer && pendingRetryAt !== null && pendingRetryAt <= nextAttemptAt) return;
  if (pendingRetryTimer) clearTimeout(pendingRetryTimer);
  pendingRetryAt = nextAttemptAt;
  const delay = Math.max(0, nextAttemptAt - Date.now());
  pendingRetryTimer = setTimeout(() => {
    pendingRetryTimer = null;
    pendingRetryAt = null;
    void NetInfo.fetch()
      .then((state) => {
        if (state.isConnected && state.isInternetReachable !== false) return syncPushLifecycle();
        return undefined;
      })
      .catch(() => undefined);
  }, delay);
}

async function markPendingFailed(record: PendingPushUnregistration): Promise<void> {
  const updated = markPendingAttemptFailed(record, Date.now());
  await secureWriteJson(pendingKey(record.id), updated);
  schedulePendingRetry(updated.nextAttemptAt);
}

async function removeOnServer(record: PushRegistration): Promise<void> {
  // Push temizleme hatası auth refresh/session-lost zincirine girmemeli. Endpoint
  // zaten access token imzasını ve tenant+user ownership'ini doğrular.
  await request('/notifications/push-token', {
    method: 'DELETE',
    body: { token: record.token },
    skipRefresh: true,
    timeoutMs: PUSH_CLEANUP_TIMEOUT_MS,
  });
}

async function settleSuccessfulRemoval(record: PendingPushUnregistration): Promise<boolean> {
  const current = await readCurrentRegistration();
  if (current === undefined) return false;
  if (current && samePushRegistration(current, record) && !(await secureDelete(CURRENT_REGISTRATION_KEY))) {
    return false;
  }
  return removePending(record);
}

async function flushPendingUnregistrations(owner: PushOwner): Promise<boolean> {
  const records = await readPendingRecords();
  if (!records) return false;
  for (const record of records) {
    if (!canRetryPending(record, owner, Date.now())) continue;
    try {
      await removeOnServer(record);
      if (!(await settleSuccessfulRemoval(record))) {
        await markPendingFailed(record);
        return false;
      }
    } catch {
      await markPendingFailed(record);
      // İlk ağ hatasında dur; çevrimdışıyken bütün kayıtları boşuna tüketmeyelim.
      return false;
    }
  }
  return true;
}

async function registerToken(): Promise<void> {
  if (pushRegistrationSuspended) return;
  const owner = await currentOwner();
  if (!owner) return;

  // İzin kapalı olsa bile önce önceki başarısız logout temizliğini dene.
  if (!(await flushPendingUnregistrations(owner))) return;

  // §10.2: izin ilk açılışta değil, giriş sonrası bağlamda istenir.
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain && !permissionRequestedThisRuntime) {
    permissionRequestedThisRuntime = true;
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Genel',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return; // EAS projesi bağlanmadan token alınamaz

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (pushRegistrationSuspended) return;
  const registration: PushRegistration = { ...owner, token };
  const current = await readCurrentRegistration();
  if (current === undefined) return;
  // Aynı token ancak aynı API + tenant + kullanıcı için kayıtlıysa dedupe edilir.
  if (current && samePushRegistration(current, registration)) return;

  // Başka hesaba ait mevcut kayıt, yeni kayıt tarafından ezilmeden önce durable
  // pending listesine alınır. Sunucu DELETE'i de owner-scoped olduğu için başka
  // kullanıcının sonradan devraldığı tokenı silemez.
  if (current) {
    const pending = await persistPending(current);
    // Eski sahiplik/token durable olmadan current kaydını ezmek güvenli değil.
    if (!pending) return;
    if (samePushOwner(current, owner)) {
      try {
        await removeOnServer(current);
        if (!(await settleSuccessfulRemoval(pending))) {
          await markPendingFailed(pending);
          return;
        }
      } catch {
        await markPendingFailed(pending);
      }
    }
  }

  await request('/notifications/push-token', {
    method: 'POST',
    body: { token, platform: 'expo' },
    skipRefresh: true,
  });
  // Eski sürüm AsyncStorage kaydı yalnız başarılı güvenli kayıt sonrasında silinir.
  if (await secureWriteJson(CURRENT_REGISTRATION_KEY, registration)) kv.delete(LEGACY_TOKEN_KEY);
}

async function performUnregisterPushToken(): Promise<void> {
  try {
    const owner = await currentOwner();
    let registration = await readCurrentRegistration();
    if (registration === undefined) return;
    const legacyToken = kv.getString(LEGACY_TOKEN_KEY);
    if (!registration && legacyToken && owner) registration = { ...owner, token: legacyToken };
    if (!registration) return;

    // Write-ahead: ağ isteği veya uygulama kapanması başarısız olsa da kayıt kalır.
    const pending = await persistPending(registration);
    if (!owner || !samePushOwner(registration, owner)) return;

    try {
      await removeOnServer(registration);
      if (pending && !(await settleSuccessfulRemoval(pending))) {
        await markPendingFailed(pending);
        return;
      }
      if (!pending) {
        const current = await readCurrentRegistration();
        if (current === undefined) return;
        if (
          current &&
          samePushRegistration(current, registration) &&
          !(await secureDelete(CURRENT_REGISTRATION_KEY))
        ) {
          return;
        }
      }
      if (legacyToken === registration.token) kv.delete(LEGACY_TOKEN_KEY);
    } catch {
      if (pending) await markPendingFailed(pending);
      // Logout devam eder; current + pending kayıt bir sonraki aynı-user online
      // fırsatında tekrar denenir. Token hiçbir log veya hata metnine girmez.
    }
  } catch {
    // SecureStore/notification altyapısı logout'u engelleyemez. Mevcut current
    // kayıt silinmediği için depolama tekrar erişilebilir olduğunda retry edilir.
  }
}

let lifecycleTail: Promise<void> = Promise.resolve();
function runLifecycleExclusive(work: () => Promise<void>): Promise<void> {
  const current = lifecycleTail.catch(() => undefined).then(work);
  // Başarısız bir push işi kuyruğu zehirlemez; hata yalnız çağırana döner.
  lifecycleTail = current.catch(() => undefined);
  return current;
}

export async function unregisterPushToken(): Promise<void> {
  // İşlem kuyruğunda bekleyen veya network/app-state listener'ından son anda
  // gelen register işlerinin logout temizliğini geri almaması için hemen askıya al.
  pushRegistrationSuspended = true;
  // Token yenileme/registration ile logout cleanup aynı SecureStore kayıtlarını
  // eşzamanlı değiştiremez. perform fonksiyonu hatayı zaten yuttuğu için logout
  // bu kuyruğu beklese dahi push hatasıyla reddedilmez.
  await runLifecycleExclusive(performUnregisterPushToken);
}

let syncPromise: Promise<void> | null = null;
function syncPushLifecycle(): Promise<void> {
  if (pushRegistrationSuspended) return Promise.resolve();
  syncPromise ??= runLifecycleExclusive(registerToken).finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

/**
 * Giriş yapılmışken token'ı kaydeder ve bildirime dokunulunca ilgili sayfaya götürür.
 */
export function usePush(enabled: boolean): void {
  const router = useRouter();
  const enabledRef = useRef(enabled);
  const handledResponses = useRef(new Set<string>());
  const responseTail = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    pushRegistrationSuspended = false;
    const trySync = () => void syncPushLifecycle().catch(() => undefined);
    trySync();
    const stopNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) trySync();
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') trySync();
    });
    // Native token dönerse Expo tokenını tekrar çöz ve owner-scoped dedupe ile
    // sunucu kaydını yenile.
    const tokenSubscription = Notifications.addPushTokenListener(trySync);
    return () => {
      stopNetwork();
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Uygulama öndeyken sistem banner'ı gösterilse bile React Query cache'i
    // kendiliğinden değişmez. Push içeriğine güvenmeden, owner-scoped API
    // verilerini yeniden çekerek rozet ve listeleri güncel tutarız.
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
    });
    return () => subscription.remove();
  }, [enabled]);

  useEffect(() => {
    const openResponse = async (response: Notifications.NotificationResponse | null): Promise<void> => {
      if (!response) return;
      const responseId = response.notification.request.identifier;
      if (handledResponses.current.has(responseId)) return;
      handledResponses.current.add(responseId);
      const route = routeForPushData(response.notification.request.content.data, allowedIncomingLinkHosts());
      if (route) {
        if (enabledRef.current) {
          try {
            router.push(route);
          } catch {
            // Navigation ağacı henüz hazır değilse hedef auth sonrasına taşınır.
            await queuePendingRoute(route);
          }
        } else {
          // Cold-start response auth bootstrap'tan bağımsız yakalanır. Raw payload
          // değil yalnız doğrulanmış, querysiz kanonik iç rota saklanır.
          await queuePendingRoute(route);
        }
      }
      // Aynı OS response'u sonraki cold start'ta tekrar oynatılmasın.
      await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    const enqueueResponse = (response: Notifications.NotificationResponse | null) => {
      responseTail.current = responseTail.current.then(() => openResponse(response)).catch(() => undefined);
    };

    // Uygulama tamamen kapalıyken bildirime dokunulduysa listener kurulmadan
    // önce gelen yanıtı da tüket; response id ile çift navigasyonu engelle.
    void Notifications.getLastNotificationResponseAsync().then(enqueueResponse).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(enqueueResponse);
    return () => sub.remove();
  }, [router]);
}
