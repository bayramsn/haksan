import type { MeResponse } from '@haksan/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import {
  ApiError,
  clearApiSession,
  getAccessToken,
  hydrateApiClient,
  refreshSession,
  setActiveDepartment,
  setActiveDivision,
  setSessionExpiredHandler,
} from '../api/apiClient';
import { authService } from '../api/services';
import { loadApiBaseUrlFromStorage } from '../api/config';
import { clearOfflineQueue, flushOfflineQueue, setOfflineQueueScope } from '../offline/queue';
import { usePushRegistration } from '../push/usePushRegistration';

type MeUser = MeResponse['user'];
type MeTenant = MeResponse['tenant'];

type AuthState = {
  loading: boolean;
  authed: boolean;
  user: MeUser | null;
  tenant: MeTenant | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (code: string) => boolean;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);
  const [tenant, setTenant] = useState<MeTenant | null>(null);

  const fetchMe = useCallback(async () => {
    const res = await authService.me();
    setUser(res.user);
    setTenant(res.tenant);
    const primary = res.user.divisions.find((d: MeResponse['user']['divisions'][number]) => d.isPrimary)?.id ?? res.user.divisions[0]?.id ?? null;
    const primaryDepartment =
      res.user.departments.find((department: MeResponse['user']['departments'][number]) => department.isPrimary)?.id ??
      res.user.departments[0]?.id ??
      null;
    const canPickAnyDivision = res.user.roles.includes('super_admin') && res.user.canViewAllDivisions;
    await Promise.all([
      setActiveDivision(canPickAnyDivision ? null : primary),
      setActiveDepartment(primaryDepartment),
      setOfflineQueueScope({ tenantId: res.tenant.id, userId: res.user.id }),
    ]);
  }, []);

  const clearSession = useCallback(async () => {
    await Promise.all([clearApiSession(), clearOfflineQueue()]);
    setUser(null);
    setTenant(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      await loadApiBaseUrlFromStorage();
      await hydrateApiClient();
      const token = await refreshSession();
      if (token || getAccessToken()) await fetchMe();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearSession();
      }
    }
  }, [clearSession, fetchMe]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      void clearSession();
      router.replace('/login');
    });
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // Giriş yapılınca cihaz push token'ını backend'e kaydet.
  usePushRegistration(Boolean(user));

  const login = useCallback(
    async (email: string, password: string) => {
      await authService.login(email, password);
      await fetchMe();
      void flushOfflineQueue();
      router.replace('/(tabs)');
    },
    [fetchMe]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // ignore
    }
    await clearSession();
    router.replace('/login');
  }, [clearSession]);

  const hasRole = useCallback(
    (code: string) => {
      if (!user) return false;
      return user.roles.includes(code);
    },
    [user]
  );

  const value = useMemo<AuthState>(
    () => ({ loading, authed: !!user, user, tenant, login, logout, hasRole }),
    [loading, user, tenant, login, logout, hasRole]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
