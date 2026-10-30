import { getRandomValues } from 'expo-crypto';
import { bindNavigationContext } from '@/src/modules/navigationContext';
import { endAllLiveActivities } from '@/src/native/live-activity';
import { runStartup } from '@/src/security/startup';
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from '@/src/security/secure-store';
import { auth, type AuthTenant, type AuthUser } from '@/src/api/endpoints';
import {
  invalidateRequestContext,
  requestContextKey,
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

async function cacheSession(user: AuthUser | null, tenant: AuthTenant | null, authenticatedAt: number): Promise<void> {
  if (!user) {
    await SecureStore.deleteItemAsync(SESSION_CACHE_KEY);
    return;
  }
  const value: CachedSession = { user, tenant, authenticatedAt };
  await SecureStore.setItemAsync(SESSION_CACHE_KEY, JSON.stringify(value));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [scope, setScopeState] = useState<ActiveScope>(activeScope);
  const [loading, setLoading] = useState(true);
  const previousAuthorization = useRef<string | null>(null);

  // Önbellekten geri yüklemede asıl kimlik doğrulama zamanı korunur; yoksa
  // çevrimdışı her açılış 24 saatlik sınırı sonsuza dek yeniler.
  const applySession = useCallback((next: AuthUser | null, nextTenant: AuthTenant | null = null, authenticatedAt = Date.now()) => {
    const authorization = JSON.stringify([apiOrigin(), next?.tenantId, next?.id, next?.roles, next?.canViewAllDivisions, next?.departmentId, next?.permissions, next?.divisions, next?.departments, next?.accessScopes]);
    if (previousAuthorization.current !== authorization) {
      invalidateRequestContext();
      queryClient.clear();
      // Gerçek hesap değişimi/çıkış (ilk açılış değil): kilit ekranındaki işler önceki kullanıcıya ait.
      if (previousAuthorization.current !== null) endAllLiveActivities();
    }
    previousAuthorization.current = authorization;
    setUser(next);
    setTenant(nextTenant);
    void cacheSession(next, nextTenant, authenticatedAt).catch(() => undefined);
    if (next) {
      const saved = activeScope();
      const divisionIds = new Set(next.divisions?.map((item) => item.id) ?? []);
      const departmentIds = new Set(next.departments?.map((item) => item.id) ?? []);
      const selected: ActiveScope = {
        divisionId:
          saved.divisionId && divisionIds.has(saved.divisionId)
            ? saved.divisionId
            : (next.canViewAllDivisions || next.accessScopes.some((grant) => grant.divisionId === null))
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
            : (user.canViewAllDivisions || user.accessScopes.some((grant) => grant.divisionId === null))
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
      try {
        const cached = await runStartup(readCachedSession);
        if (cached && !cancelled) applySession(cached.user, cached.tenant, cached.authenticatedAt);
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
  // Clearing the cache does not rebind mounted QueryObservers. Recreate all
  // account-owned screens/providers so local forms and active queries start clean.
  const boundary = JSON.stringify([apiOrigin(), user?.tenantId, user?.id, scope.divisionId, scope.departmentId, user?.roles, user?.canViewAllDivisions, user?.departmentId, user?.permissions, user?.divisions, user?.departments, user?.accessScopes]);
  bindNavigationContext(user ? boundary : null, requestContextKey, getRandomValues);
  return <AuthContext.Provider value={value}><Fragment key={boundary}>{children}</Fragment></AuthContext.Provider>;
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
