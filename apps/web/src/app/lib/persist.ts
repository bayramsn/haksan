/**
 * localStorage tabanlı küçük kalıcılık yardımcıları.
 *
 * Amaç: sayfa yenilendiğinde kullanıcının kaldığı yeri ve doldurduğu taslakları
 * korumak (nav konumu, harita filtreleri, form taslakları). Tüm anahtarlar
 * `haksan:` ön eki ile saklanır ve hata durumları sessizce yutulur (özel/gizli
 * modda localStorage erişilemeyebilir).
 */
import { useEffect, useState } from "react";

const PREFIX = "haksan:";

export function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function savePersisted<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* depolama dolu/erişilemez — yok say */
  }
}

export function clearPersisted(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* yok say */
  }
}

export function clearDrafts(): void {
  try {
    const prefix = `${PREFIX}draft.`;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    /* yok say */
  }
}

/**
 * `useState` gibi davranır ama değeri localStorage ile eşitler; yenilemede
 * son değer geri yüklenir. `key` sabit olmalıdır.
 */
export function usePersistentState<T>(
  key: string,
  initial: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => loadPersisted(key, initial));
  useEffect(() => {
    savePersisted(key, value);
  }, [key, value]);
  return [value, setValue];
}
