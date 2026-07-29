import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_URL_KEY = 'haksan_api_base_url';

/** Android emülatör: 10.0.2.2 · iOS sim: localhost · fiziksel cihaz: LAN IP */
function defaultHost(): string {
  const envHost = process.env.EXPO_PUBLIC_API_HOST?.trim();
  if (envHost) return envHost;
  if (Platform.OS === 'android') return '10.0.2.2';
  return 'localhost';
}

function envDefaultBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? `http://${defaultHost()}:3000/api/v1`;
}

let runtimeBaseUrl: string | null = null;
let originChangedHandler: ((previousOrigin: string, nextOrigin: string) => Promise<void> | void) | null = null;

declare const __DEV__: boolean;

/** localhost, emülatör köprüsü ve özel LAN aralıkları (RFC1918) — dev/saha için cleartext'e izin verilir. */
const LOCAL_HOST_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|\[?::1\]?|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?(\/|$)/i;

/**
 * Release build'de uzak (yerel-olmayan) bir sunucuya cleartext `http://` ile
 * bağlanmayı reddeder — token ve ticari veri MITM'e açık olmasın diye `https`
 * zorunludur. Dev build'de (`__DEV__`) serbest; yerel/LAN adresleri her zaman serbest.
 */
export function assertAllowedBaseUrl(url: string): void {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Geçerli bir API adresi girin.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('API adresi yalnızca http(s) olmalı ve kullanıcı bilgisi içermemelidir.');
  }
  if (/^https:\/\//i.test(trimmed)) return;
  if (LOCAL_HOST_RE.test(trimmed)) return;
  const isRelease = typeof __DEV__ !== 'undefined' && !__DEV__;
  if (isRelease) {
    throw new Error('Güvensiz adres: uzak sunucuya bağlanmak için https:// zorunludur.');
  }
}

export function apiBaseOrigin(url = getApiBaseUrl()): string {
  return new URL(url).origin;
}

export function setApiOriginChangedHandler(
  handler: ((previousOrigin: string, nextOrigin: string) => Promise<void> | void) | null
): void {
  originChangedHandler = handler;
}

export function getApiBaseUrl(): string {
  return runtimeBaseUrl ?? envDefaultBaseUrl();
}

/** @deprecated use getApiBaseUrl() — geriye uyumluluk */
export const API_BASE_URL = getApiBaseUrl();

export async function loadApiBaseUrlFromStorage(): Promise<string> {
  const stored = (await SecureStore.getItemAsync(API_URL_KEY))?.trim();
  if (stored) {
    try {
      assertAllowedBaseUrl(stored);
      runtimeBaseUrl = stored;
    } catch {
      await SecureStore.deleteItemAsync(API_URL_KEY);
      runtimeBaseUrl = envDefaultBaseUrl();
    }
  } else {
    runtimeBaseUrl = envDefaultBaseUrl();
  }
  return runtimeBaseUrl;
}

export async function persistApiBaseUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  assertAllowedBaseUrl(trimmed);
  const previousOrigin = apiBaseOrigin(getApiBaseUrl());
  const nextOrigin = apiBaseOrigin(trimmed);
  if (previousOrigin !== nextOrigin) await originChangedHandler?.(previousOrigin, nextOrigin);
  runtimeBaseUrl = trimmed;
  await SecureStore.setItemAsync(API_URL_KEY, trimmed);
}

export { API_URL_KEY };
