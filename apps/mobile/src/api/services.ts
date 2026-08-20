/**
 * Mobil API servisleri — web `apps/web/src/lib/services.ts` ile parite hedefi.
 * Audit: `npm run audit:parity`
 */
import { meResponseSchema, type MeResponse } from '@haksan/shared';
import { getApiBaseUrl } from './config';
import { api, setAccessToken, setRefreshCookie } from './apiClient';

export * from './services.web';

async function persistLoginCookies(headers: Headers): Promise<void> {
  const raw = headers.get('set-cookie');
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const lines = anyHeaders.getSetCookie?.() ?? (raw ? [raw] : []);
  for (const line of lines) {
    const match = line.match(/haksan_rt=([^;]+)/);
    if (match) {
      await setRefreshCookie(`haksan_rt=${match[1]}`);
      return;
    }
  }
}

export const authService = {
  // `identifier` kullanıcı adı ya da e-posta olabilir; API ikisini de kabul eder.
  login: async (identifier: string, password: string) => {
    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    await persistLoginCookies(response.headers);
    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(json?.error?.message ?? 'Giriş başarısız');
    }
    const data = (await response.json()) as { accessToken: string };
    await setAccessToken(data.accessToken);
    return data;
  },
  me: async (): Promise<MeResponse> => {
    const json = await api.get('/auth/me');
    return meResponseSchema.parse(json);
  },
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email: string) =>
    api.post<{ ok: boolean; token?: string }>('/auth/forgot-password', {
      email,
    }),
  resetPassword: (token: string, newPassword: string) => api.post<{ ok: boolean }>('/auth/reset-password', { token, newPassword }),
};
