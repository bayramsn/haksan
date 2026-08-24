import { colorScheme } from 'nativewind';
import { kv } from '@/src/offline/storage';

export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'theme_preference';

export const themePreferenceLabels: Record<ThemePreference, string> = {
  light: 'Aydınlık',
  dark: 'Karanlık',
  system: 'Sistem',
};

export function loadThemePreference(): ThemePreference {
  const raw = kv.getString(KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/**
 * NativeWind'e uygular ve kaydeder. Açılışta bir kez (hydrate sonrası) ve
 * Ayarlar'dan seçim yapıldığında çağrılır.
 */
export function applyThemePreference(preference: ThemePreference): void {
  if (preference === 'system') kv.delete(KEY);
  else kv.set(KEY, preference);
  colorScheme.set(preference);
}
