/**
 * Web'de Expo SecureStore eşdeğeri yoktur. Access token zaten yalnız bellekte,
 * refresh token ise httpOnly cookie'dedir. Oturum özeti, push kaydı ve çevrimdışı
 * kuyruk da XSS ile okunabilen localStorage/sessionStorage'a düşmesin diye bu
 * adaptör sayfa yaşamı boyunca bellekle sınırlıdır.
 */
const memory = new Map<string, string>();

export type SecureStoreOptions = { keychainAccessible?: number };
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 0;

export async function getItemAsync(key: string, _options?: SecureStoreOptions): Promise<string | null> {
  return memory.get(key) ?? null;
}

export async function setItemAsync(
  key: string,
  value: string,
  _options?: SecureStoreOptions
): Promise<void> {
  memory.set(key, value);
}

export async function deleteItemAsync(key: string, _options?: SecureStoreOptions): Promise<void> {
  memory.delete(key);
}
