import type { PhoneEntry } from './native';
type Session = { scope: string; enabled: boolean };
/** Refresh outside the screening service. A failed refresh remains retryable. */
export function createPhoneIndexRefresh(deps: {
  session: () => Session | null;
  hasRole: () => Promise<boolean>;
  fetch: () => Promise<{ entries: PhoneEntry[] }>;
  install: (value: { scope: string; entries: PhoneEntry[]; expiresAt: number }) => Promise<void>;
  now?: () => number;
}) {
  let installed: { scope: string; at: number } | null = null;
  let pending: Promise<void> | null = null;
  const now = deps.now ?? Date.now;
  return async function refresh(scope: string, force = false): Promise<void> {
    if (pending) { await pending; return refresh(scope, force); }
    const current = () => deps.session()?.scope === scope && deps.session()?.enabled === true;
    if (!current()) return;
    if (!force && installed?.scope === scope && now() >= installed.at && now() - installed.at < 12 * 60 * 60_000) return;
    pending = (async () => {
      if (!await deps.hasRole() || !current()) return;
      const index = await deps.fetch();
      if (!current()) return;
      await deps.install({ scope, entries: index.entries, expiresAt: now() + 24 * 60 * 60_000 });
      if (current()) installed = { scope, at: now() };
    })();
    try { await pending; } finally { pending = null; }
  };
}
