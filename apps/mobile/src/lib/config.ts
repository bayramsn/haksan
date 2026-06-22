import { Platform } from 'react-native';

/**
 * Mobil yapılandırma sabitleri. API adresi çalışma anında değiştirilebildiği
 * için (giriş ekranında düzenlenebilir) apiClient bunu bellekte tutar; burada
 * yalnız varsayılan ve AsyncStorage anahtarları yaşar.
 */

/** Emülatör/simülatörden yerel backend'e varsayılan adres. */
export const DEFAULT_API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000/api/v1' : 'http://localhost:3000/api/v1';

/** AsyncStorage anahtarları — eski sürümle uyumlu kalsın diye aynı önekler. */
export const STORAGE_KEYS = {
  apiBaseUrl: 'haksan.mobile.apiBaseUrl',
  accessToken: 'haksan.mobile.accessToken',
  activeDivision: 'haksan.mobile.activeDivision',
  email: 'haksan.mobile.email',
} as const;
