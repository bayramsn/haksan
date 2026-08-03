import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { meResponseSchema, type NavigationVisibilityKey } from '@haksan/shared';
import {
  api,
  ApiError,
  getAccessToken,
  getActiveDepartment,
  getActiveDivision,
  refreshSession,
  setAccessToken,
  setActiveDepartment as setClientActiveDepartment,
  setActiveDivision as setClientActiveDivision,
  setSessionExpiredHandler,
} from './apiClient';
import { disconnectChatSocket } from './chatRealtime';

export interface MeDivision {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface MeDepartment {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface MeAccessScope {
  resource: string;
  departmentId: string | null;
  divisionId: string | null;
  isPrimary: boolean;
}

/** Bölüm seçimi: bir bölüm id'si veya tüm bölümler ('all'). */
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
  /** view_all kullanıcılarda tüm bölümler; aksi halde kullanıcının bölümleri. */
  divisions: MeDivision[];
  departments: MeDepartment[];
  accessScopes: MeAccessScope[];
  canViewAllDivisions: boolean;
}

/** Kullanıcı için varsayılan aktif bölümü seçer (kalıcı seçim geçerliyse onu korur). */
function pickActiveDivision(user: MeUser, stored: string | null): ActiveDivision {
  const canPickAll = user.canViewAllDivisions || user.accessScopes.some((scope) => scope.divisionId === null);
  const storedValid =
    stored === 'all' ? canPickAll : !!stored && user.divisions.some((d) => d.id === stored);
  if (storedValid) return stored as string;
  if (canPickAll) return 'all';
  return user.divisions.find((d) => d.isPrimary)?.id ?? user.divisions[0]?.id ?? 'all';
}

function pickActiveDepartment(user: MeUser, stored: string | null): string | null {
  if (stored && user.departments.some((department) => department.id === stored)) return stored;
  return user.departments.find((department) => department.isPrimary)?.id ?? user.departments[0]?.id ?? user.departmentId ?? null;
}

export interface MeTenant {
  id: string;
  name: string;
  slug: string;
  hiddenNavigationKeys: NavigationVisibilityKey[];
}

interface AuthState {
  loading: boolean;
  /** Auth bootstrap finished and, when logged in, an access token is available for API calls. */
  sessionReady: boolean;
  authed: boolean;
  user: MeUser | null;
  tenant: MeTenant | null;
  hasPermission: (code: string) => boolean;
  hasRole: (code: string) => boolean;
  /** Aktif bölüm: bir bölüm id'si veya 'all'. API isteklerine başlık olarak gider. */
  activeDivision: ActiveDivision;
  setActiveDivision: (value: ActiveDivision) => void;
  activeDepartment: string | null;
  setActiveDepartment: (value: string | null) => void;
  scopesForResource: (resource: string) => MeAccessScope[];
  canUseAllDivisionsForResource: (resource: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);
  const [tenant, setTenant] = useState<MeTenant | null>(null);
  const [activeDivision, setActiveDivisionState] = useState<ActiveDivision>(() => getActiveDivision() ?? 'all');
  const [activeDepartment, setActiveDepartmentState] = useState<string | null>(() => getActiveDepartment());

  const applyActiveDivision = useCallback((value: ActiveDivision) => {
    setClientActiveDivision(value);
    setActiveDivisionState(value);
  }, []);

  const applyActiveDepartment = useCallback((value: string | null) => {
    setClientActiveDepartment(value);
    setActiveDepartmentState(value);
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const res = await api.get('/auth/me', { schema: meResponseSchema });
      setUser(res.user as MeUser);
      setTenant({
        ...res.tenant,
        hiddenNavigationKeys: res.tenant.hiddenNavigationKeys ?? [],
      });
      applyActiveDivision(pickActiveDivision(res.user as MeUser, getActiveDivision()));
      applyActiveDepartment(pickActiveDepartment(res.user as MeUser, getActiveDepartment()));
    } catch (err) {
      setUser(null);
      setTenant(null);
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
  }, [applyActiveDepartment, applyActiveDivision]);

  const refresh = useCallback(async () => {
    try {
      const token = await refreshSession();
      if (token) await fetchMe();
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
    // `identifier` kullanıcı adı ya da e-posta olabilir; API ikisini de kabul eder.
    async (identifier: string, password: string) => {
      const res = await api.post<{ accessToken: string; user: { id: string; email: string; fullName: string; tenantId: string; roles: string[] } }>(
        '/auth/login',
        { identifier, password }
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
    disconnectChatSocket();
    setAccessToken(null);
    setUser(null);
    setTenant(null);
    setClientActiveDivision(null);
    setClientActiveDepartment(null);
    setActiveDivisionState('all');
    setActiveDepartmentState(null);
  }, []);

  const clearSession = useCallback(() => {
    disconnectChatSocket();
    setAccessToken(null);
    setUser(null);
    setTenant(null);
    setClientActiveDivision(null);
    setClientActiveDepartment(null);
    setActiveDivisionState('all');
    setActiveDepartmentState(null);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  useEffect(() => {
    if (!loading && user && !getAccessToken()) {
      clearSession();
    }
  }, [loading, user, clearSession]);

  const sessionReady = !loading && (!user || !!getAccessToken());

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

  const scopesForResource = useCallback(
    (resource: string) => user?.accessScopes.filter((scope) => scope.resource === resource) ?? [],
    [user]
  );

  const canUseAllDivisionsForResource = useCallback(
    (resource: string) => scopesForResource(resource).some((scope) => scope.divisionId === null),
    [scopesForResource]
  );

  const value = useMemo<AuthState>(
    () => ({
      loading,
      sessionReady,
      authed: !!user,
      user,
      tenant,
      activeDivision,
      setActiveDivision: applyActiveDivision,
      activeDepartment,
      setActiveDepartment: applyActiveDepartment,
      scopesForResource,
      canUseAllDivisionsForResource,
      login,
      logout,
      refresh,
      hasPermission,
      hasRole,
    }),
    [
      loading,
      sessionReady,
      user,
      tenant,
      activeDivision,
      activeDepartment,
      applyActiveDepartment,
      applyActiveDivision,
      scopesForResource,
      canUseAllDivisionsForResource,
      login,
      logout,
      refresh,
      hasPermission,
      hasRole,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
