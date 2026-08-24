import Constants from 'expo-constants';
import { kv } from '@/src/offline/storage';

const OVERRIDE_KEY = 'api_base_url';

function fromConfig(): string {
  const raw = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (raw?.trim()) return raw;
  if (__DEV__) return 'http://localhost:3000/api/v1';
  throw new Error('Mobil API adresi production build ortamında tanımlı değil.');
}

/**
 * Android emülatöründe host makinenin `localhost`u 10.0.2.2'dir; düzeltilmezse
 * geliştirme derlemesi sessizce "Network request failed" verir.
 */
function normalize(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (process.env.EXPO_OS !== 'android') return trimmed;
  return trimmed.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, '$110.0.2.2');
}

/** Ayarlar ekranından girilen değer varsa onu, yoksa derleme değerini kullanır. */
export function apiBaseUrl(): string {
  const configured = __DEV__ ? kv.getString(OVERRIDE_KEY) : undefined;
  const resolved = normalize(configured ?? fromConfig());
  if (!__DEV__ && !resolved.startsWith('https://')) {
    throw new Error('Production mobil API adresi HTTPS olmalıdır.');
  }
  return resolved;
}

export function setApiBaseUrl(url: string | null): void {
  if (!__DEV__) throw new Error('Sunucu adresi yalnız geliştirme derlemelerinde değiştirilebilir.');
  if (url) kv.set(OVERRIDE_KEY, url);
  else kv.delete(OVERRIDE_KEY);
}

/** Kuyruk anahtarlarını kapsamlamak için kullanılır (sunucu değişince kuyruk karışmasın). */
export function apiOrigin(): string {
  try {
    return apiBaseUrl();
  } catch {
    return 'unknown';
  }
}

/** Universal/App Link yalnız derlemede tanımlı hostlardan kabul edilir. */
export function allowedIncomingLinkHosts(): string[] {
  const configured = (Constants.expoConfig?.extra as { appLinkHost?: string } | undefined)?.appLinkHost;
  const hosts = new Set<string>();
  if (configured?.trim()) hosts.add(configured.trim().toLowerCase());
  try {
    hosts.add(new URL(apiBaseUrl()).hostname.toLowerCase());
  } catch {
    // Hatalı/eksik production config'te dış linki fail-closed reddederiz.
  }
  return [...hosts];
}
