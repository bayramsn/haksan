import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import NetInfo from '@react-native-community/netinfo';
import { flushQueue, pendingCount } from './queue';
import { queryClient } from '@/src/query/client';

const BACKGROUND_SYNC_TASK = 'haksan-background-sync';

/**
 * §10.1: uygulama kapalıyken de kuyruğu boşalt ve önbelleği tazele.
 * İşletim sistemi aralığı garanti etmez; `minimumInterval` yalnızca alt sınırdır.
 */
// Expo Go'da arka plan görevi çalışmaz; defineTask orada atılırsa uygulama
// açılışta çöker, bu yüzden kayıt tamamı korumalı.
try {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const result = await flushQueue();
    if (result.sent > 0) await queryClient.invalidateQueries();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
} catch {
  // Expo Go / desteklenmeyen ortam: bağlantı geri geldiğinde NetInfo ile senkronlanır.
}

export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
  } catch {
    // Expo Go'da desteklenmiyor; sessizce geç.
  }
}

/**
 * Bağlantı geri geldiğinde kuyruğu boşaltır. Dönen fonksiyon aboneliği keser.
 */
export function startConnectivitySync(): () => void {
  let wasOnline: boolean | null = null;
  return NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    const reconnected = wasOnline === false && online;
    wasOnline = online;
    if (!reconnected || pendingCount() === 0) return;
    void flushQueue().then((result) => {
      if (result.sent > 0) void queryClient.invalidateQueries();
    });
  });
}
