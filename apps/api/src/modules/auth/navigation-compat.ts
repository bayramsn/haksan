import { navigationVisibilityKeyFor, type NavigationVisibilityKey } from '@haksan/shared';

/** Older tenant settings may contain retired keys; preserve stored settings and
 * expose only supported navigation areas, including their legacy aliases. */
export function normalizeHiddenNavigationKeys(keys: readonly string[] | null | undefined): NavigationVisibilityKey[] {
  return [...new Set((keys ?? []).flatMap((key) => {
    const current = navigationVisibilityKeyFor(key);
    return current === null ? [] : [current];
  }))];
}
