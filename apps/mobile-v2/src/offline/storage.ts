import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * MMKV'nin senkron API'sini AsyncStorage üzerinde taklit eder: açılışta bir kez
 * belleğe okunur, okumalar bellekten senkron döner, yazmalar arka planda diske
 * geçer. Böylece çağrı yerleri (`kv.getString(...)`) async'e çevrilmek zorunda
 * kalmaz ve uygulama Expo Go'da çalışır — MMKV yerel modül olduğu için orada yok.
 *
 * ponytail: yazma hatası sessizce yutulur (bellek yine doğru). Diske yazamamanın
 * görünür olması gerekirse set/delete'i Promise döndürecek şekilde genişlet.
 */
const PREFIX = 'haksan:';

const cache = new Map<string, string>();

export async function hydrateStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length === 0) return;
    for (const [key, value] of await AsyncStorage.multiGet(ours)) {
      if (value !== null) cache.set(key.slice(PREFIX.length), value);
    }
  } catch {
    // Boş önbellekle devam et; uygulama açılışı depolama yüzünden kilitlenmesin.
  }
}

export const kv = {
  getString(key: string): string | undefined {
    return cache.get(key);
  },
  set(key: string, value: string): void {
    cache.set(key, value);
    void AsyncStorage.setItem(PREFIX + key, value).catch(() => {});
  },
  delete(key: string): void {
    cache.delete(key);
    void AsyncStorage.removeItem(PREFIX + key).catch(() => {});
  },
};

/** React Query önbelleği: persister zaten asenkron, doğrudan AsyncStorage. */
const QUERY_PREFIX = 'haksan-query:';

export const queryPersistStorage = {
  getItem: (key: string) => AsyncStorage.getItem(QUERY_PREFIX + key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(QUERY_PREFIX + key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(QUERY_PREFIX + key),
};
