import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { canAccessModule, canOpenHref, moduleByKey } from '@/src/modules/catalog';

function hrefPath(href: Href): string {
  if (typeof href === 'string') return href;
  return String(href.pathname ?? '');
}

export function useCanAccessModule(key: string): boolean {
  const { user, tenant } = useAuth();
  const entry = moduleByKey(key);
  return entry ? canAccessModule(user, tenant, entry) : false;
}

export function useCanOpenHref(): (href: Href) => boolean {
  const { user, tenant } = useAuth();
  return useCallback((href: Href) => canOpenHref(user, tenant, hrefPath(href)), [user, tenant]);
}

/** İzni veya kiracı görünürlüğü olmayan rotaya gitmez. */
export function useGuardedPush() {
  const router = useRouter();
  const canOpen = useCanOpenHref();
  return useCallback(
    (href: Href) => {
      if (!canOpen(href)) return;
      router.push(href);
    },
    [canOpen, router],
  );
}
