import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setAccessToken } from './apiClient';

export interface MeUser {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  departmentId: string | null;
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
}

export interface MeTenant {
  id: string;
  name: string;
  slug: string;
}

interface AuthState {
  loading: boolean;
  authed: boolean;
  user: MeUser | null;
  tenant: MeTenant | null;
  hasPermission: (code: string) => boolean;
  hasRole: (code: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);
  const [tenant, setTenant] = useState<MeTenant | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const res = await api.get<{ user: MeUser; tenant: MeTenant }>('/auth/me');
      setUser(res.user);
      setTenant(res.tenant);
    } catch (err) {
      setUser(null);
      setTenant(null);
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await api.post<{ accessToken: string | null }>('/auth/refresh');
      if (r.accessToken) {
        setAccessToken(r.accessToken);
        await fetchMe();
      }
    } catch {
      // ignore — caller will redirect to login
    }
  }, [fetchMe]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ accessToken: string; user: { id: string; email: string; fullName: string; tenantId: string; roles: string[] } }>(
        '/auth/login',
        { email, password }
      );
      setAccessToken(res.accessToken);
      await fetchMe();
    },
    [fetchMe]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    setAccessToken(null);
    setUser(null);
    setTenant(null);
  }, []);

  const hasPermission = useCallback(
    (code: string) => {
      if (!user) return false;
      return user.permissions.includes(code);
    },
    [user]
  );

  const hasRole = useCallback(
    (code: string) => {
      if (!user) return false;
      return user.roles.includes(code);
    },
    [user]
  );

  const value = useMemo<AuthState>(
    () => ({ loading, authed: !!user, user, tenant, login, logout, refresh, hasPermission, hasRole }),
    [loading, user, tenant, login, logout, refresh, hasPermission, hasRole]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
