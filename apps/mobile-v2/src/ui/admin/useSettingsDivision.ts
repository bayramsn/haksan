import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/src/auth/AuthProvider';
import { resolveSettingsDivision, settingsDivisions } from './lookup-meta';

let remembered: string | null = null;

/**
 * Ayarların kendi bölüm kapsamı (web `usePersistedSettingsDivision`): uygulamanın global
 * bölüm filtresini değiştirmez; oturum boyunca bellekte tutulur.
 */
export function useSettingsDivision(requested?: string) {
  const { user, scope } = useAuth();
  const divisions = useMemo(() => user?.divisions ?? [], [user?.divisions]);
  const options = useMemo(() => settingsDivisions(divisions), [divisions]);
  const [divisionId, setLocal] = useState(() => resolveSettingsDivision(divisions, requested ?? remembered, scope.divisionId));

  useEffect(() => {
    setLocal(resolveSettingsDivision(divisions, requested ?? remembered, scope.divisionId));
  }, [divisions, requested, scope.divisionId]);

  const setDivisionId = useCallback(
    (next: string) => {
      const resolved = resolveSettingsDivision(divisions, next);
      remembered = resolved;
      setLocal(resolved);
    },
    [divisions]
  );

  return { divisionId, setDivisionId, divisions, options };
}
