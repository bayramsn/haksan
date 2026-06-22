/**
 * Mobil auth context — web `apps/web/src/lib/auth.tsx` port'u.
 * login/logout/refresh/fetchMe + bölümler + izin/rol + aktif bölüm.
 * Web'den farkları:
 *  - Açılışta `bootstrapApiClient()` ile AsyncStorage'daki token/url/bölüm yüklenir.
 *  - API adresi mobilde çalışma anında değiştirilebilir (`apiBaseUrl`/`setApiBaseUrl`).
 *  - Token değişince native arama istemcisi (`CallAssistantNative`) yeniden configure edilir.
 */
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { meResponseSchema } from '@haksan/shared';
import {
  api,
  ApiError,
  bootstrapApiClient,
  getAccessToken,
  getActiveDivision,
  getBaseUrl,
  refreshSession,
  setAccessToken,
  setActiveDivision as setClientActiveDivision,
  setBaseUrl,
  setSessionExpiredHandler,
  setTokenChangeHandler,
} from './apiClient';
import { STORAGE_KEYS } from './config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CallAssistantNative } from '../native/CallAssistantNative';

export interface MeDivision {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export type ActiveDivision = string;

export interface MeUser {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  departmentId: string | null;
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
  divisions: MeDivision[];
  canViewAllDivisions: boolean;
}

export interface MeTenant {
  id: string;
  name: string;
  slug: string;
}

function pickActiveDivision(user: MeUser, stored: string | null): ActiveDivision {
  const storedValid =
    stored === 'all' ? user.canViewAllDivisions : !!stored && user.divisions.some((d) => d.id === stored);
  if (storedValid) return stored as string;
  if (user.canViewAllDivisions) return 'all';
  return user.divisions.find((d) => d.isPrimary)?.id ?? user.divisions[0]?.id ?? 'all';
}

interface AuthState {
  loading: boolean;
  authed: boolean;
  user: MeUser | null;
  tenant: MeTenant | null;
  apiBaseUrl: string;
  setApiBaseUrl: (url: string) => void;
  hasPermission: (code: string) => boolean;
  hasRole: (code: string) => boolean;
  activeDivision: ActiveDivision;
  setActiveDivision: (value: ActiveDivision) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);
  const [tenant, setTenant] = useState<MeTenant | null>(null);
  const [apiBaseUrl, setApiBaseUrlState] = useState<string>(getBaseUrl());
  const [activeDivision, setActiveDivisionState] = useState<ActiveDivision>('all');

  const applyActiveDivision = useCallback((value: ActiveDivision) => {
    setClientActiveDivision(value);
    setActiveDivisionState(value);
  }, []);

  const applyApiBaseUrl = useCallback((url: string) => {
    setBaseUrl(url);
    setApiBaseUrlState(getBaseUrl());
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const res = await api.get('/auth/me', { schema: meResponseSchema });
      setUser(res.user as unknown as MeUser);
      setTenant(res.tenant as unknown as MeTenant);
      applyActiveDivision(pickActiveDivision(res.user as unknown as MeUser, getActiveDivision()));
    } catch (err) {
      setUser(null);
      setTenant(null);
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
  }, [applyActiveDivision]);

  const refresh = useCallback(async () => {
    try {
      const token = await refreshSession();
      if (token) await fetchMe();
    } catch {
      // ignore — caller redirects to login
    }
  }, [fetchMe]);

  // Açılış: kalıcı state yükle, oturum varsa kullanıcıyı çek.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await bootstrapApiClient();
        setApiBaseUrlState(getBaseUrl());
        setActiveDivisionState(getActiveDivision() ?? 'all');
        if (getAccessToken()) await fetchMe();
        else await refresh();
      } catch {
        // sessizce login ekranına düş
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchMe, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ accessToken: string; user: { id: string; email: string } }>('/auth/login', {
        email: email.trim(),
        password,
      });
      setAccessToken(res.accessToken);
      void AsyncStorage.setItem(STORAGE_KEYS.email, email.trim());
      await fetchMe();
    },
    [fetchMe]
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setTenant(null);
    setClientActiveDivision(null);
    setActiveDivisionState('all');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    try {
      await CallAssistantNative.setEnabled(false);
    } catch {
      // native modül yoksa yoksay
    }
    clearSession();
  }, [clearSession]);

  // 401 sonrası (yenileme başarısız) oturumu temizle.
  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  // Token değişince native arama istemcisini taze token ile yeniden yapılandır.
  useEffect(() => {
    setTokenChangeHandler((token) => {
      if (token) void CallAssistantNative.configure(getBaseUrl(), token).catch(() => {});
    });
    return () => setTokenChangeHandler(null);
  }, []);

  const hasPermission = useCallback((code: string) => !!user && user.permissions.includes(code), [user]);
  const hasRole = useCallback((code: string) => !!user && user.roles.includes(code), [user]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      authed: !!user,
      user,
      tenant,
      apiBaseUrl,
      setApiBaseUrl: applyApiBaseUrl,
      activeDivision,
      setActiveDivision: applyActiveDivision,
      login,
      logout,
      refresh,
      hasPermission,
      hasRole,
    }),
    [loading, user, tenant, apiBaseUrl, applyApiBaseUrl, activeDivision, applyActiveDivision, login, logout, refresh, hasPermission, hasRole]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
