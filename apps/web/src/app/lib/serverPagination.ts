import { useEffect, useState } from "react";

export const DEFAULT_SERVER_PAGE_SIZE = 12;

/**
 * Server-side searches should not fire for every keystroke. Keeping this
 * small hook shared also keeps the list pages and remote selectors on the
 * same, predictable debounce semantics.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebounced(value), delayMs);
    return () => globalThis.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

export function normalizeTotalPages(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export function clampServerPage(page: number, totalPages: unknown): number {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  return Math.min(safePage, normalizeTotalPages(totalPages));
}

/**
 * Stable identity for requests whose actual authorization scope is in headers.
 *
 * Tenant and user identity are deliberately part of the key. Without them a
 * fresh React Query entry from a previous login could be reused after another
 * user signs in on the same browser.
 */
export function serverScopeKey(
  activeDivision: string,
  activeDepartment: string | null,
  tenantId?: string | null,
  userId?: string | null,
) {
  return {
    tenant: tenantId || "anonymous",
    user: userId || "anonymous",
    division: activeDivision || "all",
    department: activeDepartment ?? "all",
  } as const;
}
