import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { auth, type AuthTenant, type AuthUser } from '@/src/api/endpoints';
import {
  loadAccessToken,
  refreshSession,
  setAccessToken,
  setSessionLostHandler,
  OfflineError,
  RequestTimeoutError,
} from '@/src/api/client';
import { flushQueue, setQueueScope } from '@/src/offline/queue';
import { apiOrigin } from '@/src/api/config';
import { queryClient } from '@/src/query/client';
import { unregisterPushToken } from '@/src/push/usePush';
import { activeScope, clearActiveScope, setActiveScope, type ActiveScope } from './scope';

const SESSION_CACHE_KEY = 'haksan_cached_session';
const OFFLINE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type CachedSession = {
  user: AuthUser;
  tenant: AuthTenant | null;
  authenticatedAt: number;
};

type AuthState = {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  scope: ActiveScope;
  /** İlk açılışta token/oturum çözülene kadar true. */
  loading: boolean;
  signIn: (identifier: string, password: string, tenantSlug?: string) => Promise<void>;
  signOut: () => Promise<void>;
  changeScope: (scope: ActiveScope) => void;
};

const AuthContext = createContext<AuthState | null>(null);

async function readCachedSession(): Promise<CachedSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedSession;
    if (!parsed.user?.id || Date.now() - parsed.authenticatedAt > OFFLINE_SESSION_MAX_AGE_MS) {
      await SecureStore.deleteItemAsync(SESSION_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_CACHE_KEY);
    return null;
  }
}

async function cacheSession(user: AuthUser | null, tenant: AuthTenant | null): Promise<void> {
  if (!user) {
    await SecureStore.deleteItemAsync(SESSION_CACHE_KEY);
    return;
  }
  const value: CachedSession = { user, tenant, authenticatedAt: Date.now() };
  await SecureStore.setItemAsync(SESSION_CACHE_KEY, JSON.stringify(value));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [scope, setScopeState] = useState<ActiveScope>(activeScope);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((next: AuthUser | null, nextTenant: AuthTenant | null = null) => {
    setUser(next);
    setTenant(nextTenant);
    void cacheSession(next, nextTenant);
    if (next) {
      const saved = activeScope();
      const divisionIds = new Set(next.divisions?.map((item) => item.id) ?? []);
      const departmentIds = new Set(next.departments?.map((item) => item.id) ?? []);
      const selected: ActiveScope = {
        divisionId:
          saved.divisionId && divisionIds.has(saved.divisionId)
            ? saved.divisionId
            : next.canViewAllDivisions
              ? null
              : next.divisions?.find((item) => item.isPrimary)?.id ?? next.divisions?.[0]?.id ?? null,
        departmentId:
          saved.departmentId && departmentIds.has(saved.departmentId)
            ? saved.departmentId
            : next.departments?.find((item) => item.isPrimary)?.id ?? next.departmentId ?? next.departments?.[0]?.id ?? null,
      };
      setActiveScope(selected);
      setScopeState(selected);
      setQueueScope({
        apiOrigin: apiOrigin(),
        tenantId: next.tenantId,
        userId: next.id,
        divisionId: selected.divisionId,
        departmentId: selected.departmentId,
      });
      void flushQueue().then((result) => {
        if (result.sent > 0) void queryClient.invalidateQueries();
      }).catch(() => undefined);
    } else {
      clearActiveScope();
      setScopeState({ divisionId: null, departmentId: null });
      setQueueScope(null);
    }
  }, []);

  const changeScope = useCallback(
    (next: ActiveScope) => {
      if (!user) return;
      const divisionIds = new Set(user.divisions?.map((item) => item.id) ?? []);
      const departmentIds = new Set(user.departments?.map((item) => item.id) ?? []);
      const validated: ActiveScope = {
        divisionId:
          next.divisionId && divisionIds.has(next.divisionId)
            ? next.divisionId
            : user.canViewAllDivisions
              ? null
              : scope.divisionId,
        departmentId:
          next.departmentId && departmentIds.has(next.departmentId) ? next.departmentId : scope.departmentId,
      };
      setActiveScope(validated);
      setScopeState(validated);
      setQueueScope({
        apiOrigin: apiOrigin(),
        tenantId: user.tenantId,
        userId: user.id,
        divisionId: validated.divisionId,
        departmentId: validated.departmentId,
      });
      // Scope değişiminden sonra önceki bölüm/departman verisi ekranda kalamaz.
      queryClient.clear();
    },
    [scope.departmentId, scope.divisionId, user]
  );

  useEffect(() => {
    let cancelled = false;

    // 401 sonrası istemci oturumu düşürür; buradan arayüze yansıtılır.
    setSessionLostHandler(() => {
      if (!cancelled) {
        queryClient.clear();
        applySession(null);
      }
    });

    void (async () => {
      // Çevrimdışı açılışta önbellekteki kullanıcıyla devam et — saha çalışanı
      // uçak modundayken giriş ekranına düşmemeli. PII içeren oturum özeti
      // AsyncStorage yerine SecureStore'dadır ve en çok 24 saat kabul edilir.
      const cached = await readCachedSession();
      if (cached && !cancelled) applySession(cached.user, cached.tenant);
      try {
        const token = await loadAccessToken();
        const active = Boolean(token) || (await refreshSession());
        if (!active) {
          if (!cancelled) applySession(null);
          return;
        }
        const fresh = await auth.me();
        if (!cancelled) applySession(fresh.user, fresh.tenant);
      } catch (err) {
        if (!(err instanceof OfflineError) && !(err instanceof RequestTimeoutError) && !cancelled) {
          applySession(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setSessionLostHandler(null);
    };
  }, [applySession]);

  const signIn = useCallback(
    async (identifier: string, password: string, tenantSlug?: string) => {
      const result = await auth.login({ identifier, password, tenantSlug });
      await setAccessToken(result.accessToken);
      // Login yanıtında `permissions` yok; RBAC'ın çalışması için me() ile tamamla.
      try {
        const full = await auth.me();
        queryClient.clear();
        applySession(full.user, full.tenant);
      } catch (error) {
        // İnce login kullanıcısıyla devam etmek permission ve tenant görünürlük
        // kurallarını belirsiz bırakır. Yetki bağlamı alınamadığında fail-closed.
        await setAccessToken(null);
        queryClient.clear();
        applySession(null);
        try {
          await auth.logout();
        } catch {
          // Yerel oturumu zaten temizledik; ağ hatası asıl nedeni gölgelememeli.
        }
        throw error;
      }
    },
    [applySession]
  );

  const signOut = useCallback(async () => {
    // Token'ı önce kaldır: çıkıştan sonra bu cihaza bildirim gitmesin.
    await unregisterPushToken();
    try {
      await auth.logout();
    } catch {
      // Çevrimdışı çıkışta sunucuya ulaşamamak yerel oturumu kapatmayı engellemesin.
    }
    await setAccessToken(null);
    applySession(null);
    queryClient.clear();
  }, [applySession]);

  const value = useMemo<AuthState>(
    () => ({ user, tenant, scope, loading, signIn, signOut, changeScope }),
    [user, tenant, scope, loading, signIn, signOut, changeScope]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider dışında kullanılamaz');
  return ctx;
}

/**
 * §9.5 RBAC: sunucu da kontrol eder; bu yalnızca arayüzü sadeleştirir.
 * Listeyi süzerken hook kullanılamadığı için saf sürüm de dışa açık.
 */
export function can(user: AuthUser | null, permission?: string): boolean {
  if (!permission) return true;
  if (!user) return false;
  if (user.roles?.includes('super_admin')) return true;
  return user.permissions?.includes(permission) ?? false;
}

export function useCan(permission: string): boolean {
  const { user } = useAuth();
  return can(user, permission);
}
